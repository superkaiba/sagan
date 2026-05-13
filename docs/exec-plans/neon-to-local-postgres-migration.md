# Neon → local Postgres (on the VM) migration plan

Self-host Postgres 17 + pgvector on the Sagan VM (`35.226.138.62`,
GCE `e2-standard-32`, 125 GB RAM, 205 GB free disk). Replaces Neon's
~$73/mo bill with $0/mo extra (the VM is already paid for and ~95%
idle). Same runner-and-Postgres machine means LISTEN/NOTIFY runs over
a Unix socket — sub-millisecond round trips vs ~10 ms across the
internet to Neon.

Total cutover downtime target: **~15 min**. The DB is currently
30 MB, so dump/restore is essentially instant.

## Phase 0 — preflight (no downtime, do days ahead)

### P0.1 Confirm GCE snapshot policy is on this VM

The "it's already backed up" claim depends on a resource-policy
attached to the boot disk. Check via the GCE console or `gcloud`:

```bash
gcloud compute instances describe <instance-name> \
  --zone <zone> \
  --format="value(disks[].source)"
gcloud compute disks describe <boot-disk-name> \
  --zone <zone> \
  --format="value(resourcePolicies)"
```

If `resourcePolicies` is empty, attach a daily-snapshot policy via
the GCE console (Compute Engine → Snapshots → Snapshot schedules).
Recommended: daily snapshots, retain 7-14 days, snapshot at 04:00
local time (after our pg_dump runs at 03:00).

This is the "disk died" line of defense. The `pg_dump` cron is the
"oops I dropped a table" line of defense.

### P0.2 Verify Neon access (transfer cap lifted)

```bash
set -a; . /home/thomasjiralerspong/sagan/.env; set +a
psql "$DATABASE_URL_DIRECT" -tA -c "SELECT 1, pg_size_pretty(pg_database_size(current_database()));"
```

Should return `1|30 MB` (or similar). If it errors on quota, bump
Neon's plan for cutover day.

## Phase A — install + configure local Postgres (no downtime)

### A.1 Add the PGDG apt repository

The Ubuntu 22.04 default repos only ship Postgres 14; we need 17.

```bash
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsS https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | \
  sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt-get update
```

### A.2 Install Postgres 17 + pgvector

```bash
sudo apt-get install -y \
  postgresql-17 \
  postgresql-17-pgvector \
  postgresql-client-17
```

Pin the version so it doesn't auto-upgrade across major versions:

```bash
sudo apt-mark hold postgresql-17 postgresql-17-pgvector
```

This installs Postgres as `postgresql@17-main`, listening on
port 5432 by default. The OS user `postgres` is created.

Confirm:

```bash
sudo systemctl status postgresql@17-main
sudo -u postgres psql -c "SELECT version();"
sudo -u postgres psql -c "CREATE EXTENSION vector; SELECT extversion FROM pg_extension WHERE extname='vector'; DROP EXTENSION vector;"
```

### A.3 Tune postgresql.conf for the VM

Conservative settings — Postgres takes ~10% of system RAM
(`shared_buffers = 8GB` on a 125 GB box) and modest connection /
work memory. Edit `/etc/postgresql/17/main/postgresql.conf`:

```ini
listen_addresses = '*'                 # localhost + external for Vercel
port = 5432
max_connections = 200                  # comfortable headroom; cap is system-wide
shared_buffers = 8GB                   # ~10% of 125 GB
effective_cache_size = 32GB            # roughly 25% of system RAM
work_mem = 64MB                        # per-operation; safe at 200 connections
maintenance_work_mem = 1GB             # speeds up vacuum + index builds
random_page_cost = 1.1                 # SSDs
effective_io_concurrency = 200         # SSD
wal_level = replica
max_wal_size = 4GB
checkpoint_completion_target = 0.9

# pgvector HNSW index builds want headroom
maintenance_work_mem = 1GB
```

SSL on for any non-local connection. Use Postgres's auto-generated
snakeoil cert in v1, swap for Let's Encrypt later:

```ini
ssl = on
ssl_cert_file = '/etc/ssl/certs/ssl-cert-snakeoil.pem'
ssl_key_file = '/etc/ssl/private/ssl-cert-snakeoil.key'
```

The default Ubuntu install already creates snakeoil; check with
`ls /etc/ssl/certs/ssl-cert-snakeoil.pem`. If missing:
`sudo apt-get install -y ssl-cert && sudo make-ssl-cert generate-default-snakeoil`.

Apply: `sudo systemctl reload postgresql@17-main`.

### A.4 Configure pg_hba.conf (auth)

Edit `/etc/postgresql/17/main/pg_hba.conf`. Strip the default
permissive entries and add:

```
# TYPE      DATABASE  USER         ADDRESS         METHOD
local       all       postgres                     peer
local       sagan     sagan_app                    scram-sha-256
host        sagan     sagan_app    127.0.0.1/32    scram-sha-256
hostssl     sagan     sagan_app    0.0.0.0/0       scram-sha-256
hostssl     sagan     sagan_app    ::/0            scram-sha-256
```

The `hostssl … 0.0.0.0/0 scram-sha-256` row is what lets Vercel
reach the DB over TLS with password auth — same security model as
the current Neon connection. To tighten later: replace `0.0.0.0/0`
with Vercel's egress range (publicly available) once you confirm
the migration works.

Apply: `sudo systemctl reload postgresql@17-main`.

### A.5 Create the database + app user

```bash
# Generate a strong password (32 random bytes hex)
SAGAN_DB_PASSWORD=$(openssl rand -hex 32)
echo "WROTE PASSWORD — save this; you'll need it for env vars: $SAGAN_DB_PASSWORD"

sudo -u postgres psql <<SQL
CREATE ROLE sagan_app LOGIN PASSWORD '${SAGAN_DB_PASSWORD}';
CREATE DATABASE sagan OWNER sagan_app;
\\c sagan
CREATE EXTENSION IF NOT EXISTS vector;
GRANT ALL PRIVILEGES ON DATABASE sagan TO sagan_app;
GRANT ALL PRIVILEGES ON SCHEMA public TO sagan_app;
ALTER USER sagan_app WITH CREATEDB;
SQL
```

Save `$SAGAN_DB_PASSWORD` to `1Password` / your secret manager.
You'll paste it into both `.env` and Vercel.

### A.6 Open port 5432 on the GCE firewall

The VM currently doesn't allow inbound 5432 from the internet.
Add a rule (from the GCE console or `gcloud`):

```bash
gcloud compute firewall-rules create allow-postgres-vercel \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:5432 \
  --source-ranges=0.0.0.0/0 \
  --target-tags=<the-vm's-network-tag>
```

If the VM has no specific network tag, target by service-account or
instance name instead. Security here is **TLS + scram-sha-256
password** in pg_hba, not IP allowlisting — same security posture as
Neon today.

Verify reachability from outside the VM:

```bash
# From any other machine
psql "postgres://sagan_app:${SAGAN_DB_PASSWORD}@35.226.138.62:5432/sagan?sslmode=require" \
  -c "SELECT 1;"
```

## Phase B — set up backups (no downtime)

### B.1 Daily pg_dump cron

```bash
sudo mkdir -p /var/backups/sagan
sudo chown postgres:postgres /var/backups/sagan
sudo chmod 700 /var/backups/sagan
```

Write `/etc/cron.daily/sagan-pg-backup`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DATE=$(date +%Y%m%d)
BACKUP_DIR=/var/backups/sagan
LOG=/var/log/sagan-backup.log

{
  echo "=== $(date -Iseconds) starting backup ==="
  sudo -u postgres pg_dump --format=custom --no-owner --no-privileges \
    --file="${BACKUP_DIR}/sagan-${DATE}.dump" sagan
  echo "  wrote ${BACKUP_DIR}/sagan-${DATE}.dump ($(du -h "${BACKUP_DIR}/sagan-${DATE}.dump" | cut -f1))"
  find "$BACKUP_DIR" -name 'sagan-*.dump' -mtime +30 -delete
  echo "  pruned dumps older than 30 days"
  echo "=== $(date -Iseconds) backup complete ==="
} >> "$LOG" 2>&1
```

```bash
sudo chmod +x /etc/cron.daily/sagan-pg-backup
sudo /etc/cron.daily/sagan-pg-backup   # one-shot to verify it works
tail /var/log/sagan-backup.log
ls -lh /var/backups/sagan
```

You should see a dump file ~30 MB right now.

### B.2 (Optional, later) Off-VM copy

Weekly copy the latest dump to GCS. Skip for v1; add when the
research output starts looking irreplaceable.

```bash
# Future: gsutil cp /var/backups/sagan/sagan-*.dump gs://sagan-backups/
```

## Phase C — migrate the data (~10 min downtime)

### C.1 Drain the runner

```bash
set -a; . /home/thomasjiralerspong/sagan/.env; set +a
psql "$DATABASE_URL_DIRECT" -c "SELECT id, kind, status FROM agent_runs WHERE status IN ('running','deploying');"
```

If runs are active and you can wait, wait. Otherwise SIGTERM is
fine — recovery loop queues followups after migration completes.

```bash
sudo systemctl stop sagan-runner
```

### C.2 Lock Neon writes

```bash
psql "$DATABASE_URL_DIRECT" \
  -c "ALTER DATABASE neondb SET default_transaction_read_only = on;"
```

Vercel functions will return 500s during this window — acceptable
for ~10 min, or ship a maintenance banner first if you want
friendlier UX.

### C.3 Dump from Neon

```bash
pg_dump --format=custom --no-owner --no-privileges --verbose \
  --file=/tmp/sagan-cutover.dump "$DATABASE_URL_DIRECT"
ls -lh /tmp/sagan-cutover.dump
```

For a 30 MB DB this takes seconds.

### C.4 Restore into local sagan

```bash
PGPASSWORD="$SAGAN_DB_PASSWORD" pg_restore --jobs=4 --no-owner --no-privileges \
  --verbose --dbname "postgres://sagan_app@127.0.0.1:5432/sagan?sslmode=disable" \
  /tmp/sagan-cutover.dump 2>&1 | tee /tmp/sagan-restore.log
```

(`sslmode=disable` is fine over loopback; the runner will use
`sslmode=require` only when crossing the network.)

### C.5 Verify

```bash
for tbl in agent_run_events workflow_events comments experiments agent_runs \
           projects pod_lifecycle approval_requests todos; do
  NEON=$(psql "$DATABASE_URL_DIRECT" -tA -c "SELECT count(*) FROM $tbl;")
  LOCAL=$(PGPASSWORD="$SAGAN_DB_PASSWORD" psql \
    "postgres://sagan_app@127.0.0.1/sagan?sslmode=disable" \
    -tA -c "SELECT count(*) FROM $tbl;")
  printf "%-25s Neon=%-8s Local=%-8s %s\n" "$tbl" "$NEON" "$LOCAL" \
    "$([ "$NEON" = "$LOCAL" ] && echo ✓ || echo MISMATCH)"
done

# Drizzle migrations table (must be 28)
PGPASSWORD="$SAGAN_DB_PASSWORD" psql "postgres://sagan_app@127.0.0.1/sagan?sslmode=disable" \
  -tA -c "SELECT count(*) FROM drizzle.__drizzle_migrations;"

# Sequence states (critical for experiments.number)
PGPASSWORD="$SAGAN_DB_PASSWORD" psql "postgres://sagan_app@127.0.0.1/sagan?sslmode=disable" \
  -tA -c "SELECT last_value FROM experiments_number_seq;"

# pgvector
PGPASSWORD="$SAGAN_DB_PASSWORD" psql "postgres://sagan_app@127.0.0.1/sagan?sslmode=disable" \
  -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
PGPASSWORD="$SAGAN_DB_PASSWORD" psql "postgres://sagan_app@127.0.0.1/sagan?sslmode=disable" \
  -c "SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%vector%' OR indexdef LIKE '%hnsw%';"
```

Every row count must match. The drizzle migrations table must
report `29` (28 from `_journal.json` + the initial bootstrap row).
**Stop and investigate if anything mismatches.**

### C.6 Swap env vars

**VM `.env`** (the runner reads via systemd's `EnvironmentFile`):

```bash
cp /home/thomasjiralerspong/sagan/.env \
   /home/thomasjiralerspong/sagan/.env.neon-backup-$(date +%Y%m%d)

# Edit /home/thomasjiralerspong/sagan/.env — replace:
#   DATABASE_URL=…neon…
#   DATABASE_URL_DIRECT=…neon…
# with:
#   DATABASE_URL=postgres://sagan_app:${PASSWORD}@127.0.0.1:5432/sagan?sslmode=disable
#   DATABASE_URL_DIRECT=postgres://sagan_app:${PASSWORD}@127.0.0.1:5432/sagan?sslmode=disable
```

Loopback connections don't need TLS — they never leave the VM.
`sslmode=disable` saves ~5 ms per connection.

**Vercel** (production env, the public-IP route):

```bash
cd /home/thomasjiralerspong/sagan/apps/web

vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production
# Paste: postgres://sagan_app:${PASSWORD}@35.226.138.62:5432/sagan?sslmode=require

vercel env rm DATABASE_URL_DIRECT production
vercel env add DATABASE_URL_DIRECT production
# Paste the same URL (no separate pool — Postgres handles connections directly)
```

Force a redeploy:

```bash
cd /home/thomasjiralerspong/sagan
git commit --allow-empty -m "chore: redeploy after DB migration to local Postgres"
git push
```

### C.7 Restart the runner

```bash
cd /home/thomasjiralerspong/sagan
./scripts/restart-runner.sh
```

Tail the journal:

```bash
sudo journalctl -u sagan-runner -f
# Expect: "subscribed to agent_run_queued and agent_run_approved"
# Expect: NO PostgresError lines
```

### C.8 Smoke tests

1. Open https://sagan.superkaiba.com — homepage loads.
2. /pipeline — cards render.
3. Click an experiment — entity page loads, PlanPanel renders.
4. Dispatch a tiny qa:
   ```bash
   set -a; . /home/thomasjiralerspong/sagan/.env; set +a
   RUN_ID=$(psql "$DATABASE_URL_DIRECT" -tA -c \
     "INSERT INTO agent_runs (kind, provider, status, request, approval_required)
      VALUES ('qa', 'claude_code', 'queued', 'smoke test: reply with OK', false)
      RETURNING id;")
   psql "$DATABASE_URL_DIRECT" -c "SELECT pg_notify('agent_run_queued', '$RUN_ID');"
   # Watch the run reach status=completed within ~30 s.
   ```
5. Post a `@claude` comment on any narrative.
6. Verify Vercel can reach the DB (the dashboard loading at all already proves this).

## Phase D — rollback (if any smoke test fails)

```bash
cp /home/thomasjiralerspong/sagan/.env.neon-backup-* /home/thomasjiralerspong/sagan/.env

cd /home/thomasjiralerspong/sagan/apps/web
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production    # paste old Neon pool URL
vercel env rm DATABASE_URL_DIRECT production
vercel env add DATABASE_URL_DIRECT production  # paste old Neon direct URL

git commit --allow-empty -m "rollback: revert to Neon DB"
git push

psql "<OLD_NEON_DIRECT_URL>" \
  -c "ALTER DATABASE neondb SET default_transaction_read_only = off;"

./scripts/restart-runner.sh
```

You lose the writes that happened on local after the cutover —
essentially the smoke-test rows.

## Phase E — post-cutover (next 7 days)

- Keep Neon **read-only** as rollback insurance. Cancel any upgrade
  back to Free tier so the cost stays $0.
- Verify the pg_dump cron fired at 03:00 the first night and again
  the next.
- Watch `sudo journalctl -u sagan-runner` for any error patterns.
- Watch `sudo journalctl -u postgresql@17-main` for connection / SSL
  issues from Vercel.
- After 7-14 stable days: delete the Neon project and the
  `.env.neon-backup-*` file.

## Phase F — security hardening (optional, recommended within 30 days)

### F.1 Replace snakeoil cert with Let's Encrypt

Currently Vercel connects with `sslmode=require` which encrypts but
doesn't verify the cert. To get `sslmode=verify-full`:

1. Point a hostname at the VM: `db.sagan.superkaiba.com` →
   `35.226.138.62` (Cloudflare DNS, gray-cloud / DNS-only — orange
   cloud doesn't proxy raw TCP).
2. Run certbot:
   ```bash
   sudo certbot certonly --standalone -d db.sagan.superkaiba.com
   ```
3. Point Postgres at the cert:
   ```ini
   ssl_cert_file = '/etc/letsencrypt/live/db.sagan.superkaiba.com/fullchain.pem'
   ssl_key_file = '/etc/letsencrypt/live/db.sagan.superkaiba.com/privkey.pem'
   ```
4. Renew cron is automatic via certbot. Restart Postgres on renew:
   create `/etc/letsencrypt/renewal-hooks/post/postgres-reload.sh`
   that runs `systemctl reload postgresql@17-main`.
5. Update Vercel `DATABASE_URL` host from `35.226.138.62` to
   `db.sagan.superkaiba.com` and `sslmode=require` to
   `sslmode=verify-full`.

### F.2 Tighten pg_hba 0.0.0.0/0 → Vercel egress range

Once you've confirmed migration is stable, replace the `hostssl …
0.0.0.0/0` line with Vercel's egress IPs (publicly documented).

## Risk register

| Risk | Mitigation |
|---|---|
| pgvector version mismatch | DO/Ubuntu PGDG ship 0.7.x; Sagan uses 0.8.0. HNSW indexes are forward-compatible, but rebuild after restore: `REINDEX TABLE projects;` if vector indexes look odd in C.5. |
| Vercel can't reach the VM IP | Verify with `psql` from a non-VM machine before cutover. GCE firewall rule must include `0.0.0.0/0` on 5432 with SSL. |
| Postgres consumes too much memory | shared_buffers=8GB is conservative on a 125 GB machine. Cap if you ever co-locate more services. |
| VM dies → DB dies | GCE snapshots (Phase 0) + daily pg_dump (Phase B). Acceptable single-host risk at Sagan's scale. |
| Disk fills | 205 GB free now, DB is 30 MB, growth projection 400 MB/yr. Years of headroom; alert via cron if `df` exceeds 90%. |
| Sequence drift | C.5 verifies; manual setval if needed. |
| Postgres patch upgrades | apt-mark hold keeps 17.x but allows minor patches. Test `sudo apt upgrade postgresql-17` in maintenance windows. |

## Estimated wall time

| Phase | Time |
|---|---|
| Phase 0 (preflight) | 5 min, days ahead |
| Phase A.1-A.6 (install + config) | 20 min, no downtime |
| Phase B (backup cron) | 5 min, no downtime |
| Phase C (migration) | **~10 min downtime** |
| Phase D (smoke + verify) | 5 min |
| Phase E (monitor) | passive, 7 days |
| Phase F (hardening) | 30 min, weeks later |

## Why this beats the DO plan

- $30/mo × 12 = $360/yr saved. Permanent.
- LISTEN/NOTIFY over Unix socket: sub-millisecond, no network hop.
- One less external dependency. DB outage = VM outage = everything
  is down anyway (the runner is on the same box).
- pgvector tuning is yours; no plan-tier limits on
  maintenance_work_mem for HNSW builds.
- Disk autogrows on GCE; no plan-tier storage cliffs.

## Why this could regret later

- VM dies = DB dies. GCE snapshots minimize the blast radius but
  recovery is "spin up a new VM, mount the snapshot, restore". Not
  instant.
- No PITR (point-in-time-recovery) unless you set up WAL archiving
  yourself. Daily dumps give 24-hour-granular recovery, not
  minute-granular. Probably fine for Sagan.
- Postgres major-version upgrades (17 → 18 → 19) are your problem,
  not a vendor's. Plan ~1 hr every 2 years.
- Backups depend on you noticing if the cron breaks. Add a
  health-check ping (e.g. an `epm:db-backup` workflow_event posted
  by the backup script, with a separate cron alerting if no event
  appears for 36 h).

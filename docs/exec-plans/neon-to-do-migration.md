# Neon → DigitalOcean Postgres migration plan

Sagan currently runs on a single Neon Postgres project (Postgres 17,
pgvector 0.8.0, `aws-us-east-1`). Neon Scale costs ~$73/mo for our load
profile (always-on LISTEN/NOTIFY pins ~720 CU-hours) and just hit its
data-transfer quota wall. Migrating to **DigitalOcean Managed Postgres
Basic 2 GB / 2 vCPU / 60 GB at $30/mo** cuts the bill ~60% with
headroom for our actual connection count (~47 backend connections vs
DO's $15 plan's 22-connection cap, which would bottleneck the runner's
20-concurrent-run setting).

## Why this size, not the $15 plan

Reviewer flagged: Sagan's runner permits up to 20 concurrent in-flight
runs (`services/runner/src/queue.ts:29`), holds one permanent slot for
the LISTEN connection, and Vercel functions pool on top. DO Basic
1 GB caps at ~22 backend connections — guaranteed
`too many connections` errors. PgBouncer transaction-mode breaks
LISTEN/NOTIFY; session-mode just pushes the cap back. Step up to 2 GB
(~47 connections) and the bottleneck goes away.

## Pre-flight (no downtime — do these days before cutover)

### P0. Lift the Neon transfer cap for cutover day

The data-transfer quota is currently blocking queries. The pg_dump
itself counts against egress. Two options:

- **Upgrade Neon to Launch ($19/mo) just for cutover day.** Includes
  50 GB egress — comfortably enough for a 5 GB dump + verification
  traffic. Cancel back to Free immediately after migration is
  verified.
- Or wait for the monthly quota reset if you happen to be near it.

### P1. Provision DO Managed Postgres

Via the DO dashboard or `doctl databases create`:

```bash
doctl databases create sagan-pg \
  --engine pg \
  --version 17 \
  --region nyc3 \
  --size db-s-2vcpu-2gb \
  --num-nodes 1
```

- Region: `nyc3` (closest to Vercel `iad1`).
- Engine: PostgreSQL 17 (must match current Neon version exactly).
- Size: `db-s-2vcpu-2gb` ($30/mo).
- Single-node (no standby). HA is `+$30/mo` and not required while
  Sagan has one owner.

Capture from the dashboard / `doctl databases connection sagan-pg`:

- `DO_PRIMARY_URL` — direct connection (LISTEN, migrations).
- `DO_POOL_URL` — PgBouncer transaction-mode (Vercel serverless).
- `DO_HOST`, `DO_PORT` (default 25060), `DO_USER` (`doadmin`),
  `DO_PASSWORD`, `DO_DATABASE` (`defaultdb` initially).

### P2. Enable pgvector on the new cluster

```sql
-- Connect via psql "$DO_PRIMARY_URL"
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extversion FROM pg_extension WHERE extname = 'vector';
```

DO ships pgvector on Postgres 17. **Verify the version is ≥ 0.7.0**;
ideally 0.8.x. If it's older, file a support ticket — HNSW index
files should be forward-compatible but we'd want a safety rebuild.

### P3. Firewall: trusted sources

In the DO dashboard, set "Trusted sources" so only known clients can
reach the cluster:

- **VM**: `35.226.138.62/32` (the Sagan runner VM).
- **Vercel**: Vercel's serverless egress is dynamic. Two options:
  - Add `0.0.0.0/0` and rely on TLS + password auth (simplest;
    matches current Neon setup).
  - Or set up DO's "Private Networking" with a Vercel-issued static
    egress IP (Vercel paid feature) — overkill for our scale.

### P4. Pre-create a non-superuser app role (optional, recommended)

```sql
CREATE ROLE sagan_app LOGIN PASSWORD '<generated>';
GRANT ALL PRIVILEGES ON DATABASE defaultdb TO sagan_app;
ALTER DATABASE defaultdb OWNER TO sagan_app;
```

Then run migrations / restore as `sagan_app` instead of `doadmin`.
Cleaner ownership for backup/restore later. **Skip this for the
first migration if you want a faster cutover** — restoring with
`--no-owner` to `doadmin` is fine.

### P5. Dry-run dump + restore (optional but recommended)

Two days before the real cutover:

```bash
set -a; . /home/thomasjiralerspong/sagan/.env; set +a

# Dump Neon to a local file (custom format, parallel-restorable)
pg_dump --format=custom --no-owner --no-privileges \
  --file=/tmp/sagan-dryrun.dump \
  "$DATABASE_URL_DIRECT"

# Restore to DO into a separate dryrun database
psql "$DO_PRIMARY_URL" -c "CREATE DATABASE sagan_dryrun;"
pg_restore --jobs=4 --no-owner --no-privileges \
  --dbname "$DO_HOST_AS_URL_FOR_sagan_dryrun" \
  /tmp/sagan-dryrun.dump

# Verify row counts match Neon
for tbl in experiments agent_runs comments workflow_events agent_run_events \
          projects project_narratives todos pod_lifecycle approval_requests; do
  echo "$tbl:"
  psql "$DATABASE_URL_DIRECT" -tA -c "SELECT count(*) FROM $tbl;"
  psql "$DO_PRIMARY_URL_FOR_sagan_dryrun" -tA -c "SELECT count(*) FROM $tbl;"
done

# Verify pgvector indexes exist on the new side
psql "$DO_PRIMARY_URL_FOR_sagan_dryrun" -c \
  "SELECT indexname, indexdef FROM pg_indexes WHERE indexdef LIKE '%vector%';"

# Verify drizzle migrations table parity
psql "$DATABASE_URL_DIRECT" -tA -c \
  "SELECT count(*) FROM drizzle.__drizzle_migrations;"
psql "$DO_PRIMARY_URL_FOR_sagan_dryrun" -tA -c \
  "SELECT count(*) FROM drizzle.__drizzle_migrations;"

# Clean up the dryrun database
psql "$DO_PRIMARY_URL" -c "DROP DATABASE sagan_dryrun;"
```

Expected times:
- Dump: 5-15 min on a ~5 GB database (quota-throttled could be longer).
- Restore (4 parallel jobs): 5-10 min.
- Vector index rebuild during restore: 2-5 min for ~thousands of rows
  at 1536 dimensions.

If any of these fail, **address the failure before scheduling the
real cutover**.

## Cutover (~30 minutes of write downtime)

Do this during a quiet window. The runner is offline and writes to
Sagan are rejected during this period. Reads on Vercel still work
against Neon until DNS/env flips.

### C1. Stop the runner cleanly

```bash
# Wait for active runs to drain. Active = status in (running, deploying).
set -a; . /home/thomasjiralerspong/sagan/.env; set +a
psql "$DATABASE_URL_DIRECT" -c \
  "SELECT id, kind, status FROM agent_runs WHERE status IN ('running','deploying');"
```

If active runs are present and you can wait, wait. If you can't,
they'll be SIGTERMed and the existing recovery loop will queue
follow-ups on the new database after cutover.

```bash
sudo systemctl stop sagan-runner
```

### C2. Lock Neon writes

```sql
-- Run via psql "$DATABASE_URL_DIRECT" as the Neon owner.
ALTER DATABASE neondb SET default_transaction_read_only = on;
```

Active sessions complete in-flight transactions. New writes fail with
`cannot execute INSERT in a read-only transaction`. Vercel functions
will surface 500s during this window — acceptable for a 30-min
maintenance window. If you want a friendlier UX, ship a
maintenance banner via Vercel env before this step.

### C3. Drop pgvector indexes for faster dump

```sql
-- Run via psql "$DATABASE_URL_DIRECT" (must temporarily UNSET read_only).
ALTER DATABASE neondb SET default_transaction_read_only = off;

-- Drop vector indexes so pg_dump doesn't try to dump them serially.
-- They'll be recreated by the schema dump on restore anyway, but
-- dropping them first makes the dump file smaller and the restore
-- index-rebuild parallelizable.
DROP INDEX IF EXISTS projects_embedding_idx;
DROP INDEX IF EXISTS <any other vector indexes — grep schema.ts>;

-- Re-lock writes.
ALTER DATABASE neondb SET default_transaction_read_only = on;
```

Find vector indexes:

```bash
grep -nE "vector|hnsw|ivfflat" /home/thomasjiralerspong/sagan/packages/db/src/schema/index.ts
psql "$DATABASE_URL_DIRECT" -c \
  "SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%vector%' OR indexdef LIKE '%hnsw%' OR indexdef LIKE '%ivfflat%';"
```

### C4. Dump

```bash
pg_dump --format=custom --no-owner --no-privileges \
  --verbose \
  --file=/tmp/sagan-cutover.dump \
  "$DATABASE_URL_DIRECT"
ls -lh /tmp/sagan-cutover.dump
```

Save the file size — used as a sanity check post-restore. Tail the
verbose output; it'll print `pg_dump: saving table "schema.tablename"`
lines. Confirm every expected table appears.

### C5. Create the database on DO + extension

```bash
psql "$DO_PRIMARY_URL" -c "CREATE DATABASE sagan;"
# Update DO_PRIMARY_URL / DO_POOL_URL to point at the new database
# (replace /defaultdb with /sagan in the connection string).
DO_SAGAN_PRIMARY_URL=...
DO_SAGAN_POOL_URL=...

psql "$DO_SAGAN_PRIMARY_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql "$DO_SAGAN_PRIMARY_URL" -c \
  "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
```

### C6. Restore

```bash
pg_restore --jobs=4 --no-owner --no-privileges \
  --verbose \
  --dbname "$DO_SAGAN_PRIMARY_URL" \
  /tmp/sagan-cutover.dump 2>&1 | tee /tmp/sagan-restore.log
```

`--jobs=4` parallelizes both COPY and index builds. Vector index
rebuilds happen here; this is the slowest step. Tail the log to watch
progress. Errors related to existing roles (`role "neon_owner" does
not exist`) are fine — `--no-owner` swallows them. Errors related to
duplicate extensions are fine. Any other error is a problem.

### C7. Verify

Run the row-count + index + migration parity checks from P5 against
the live cutover database. If anything mismatches, **stop and
investigate before flipping env vars**.

Quick smoke:

```bash
for tbl in experiments agent_runs comments workflow_events agent_run_events; do
  echo -n "$tbl  Neon="
  psql "$DATABASE_URL_DIRECT" -tA -c "SELECT count(*) FROM $tbl;"
  echo -n "       DO="
  psql "$DO_SAGAN_PRIMARY_URL" -tA -c "SELECT count(*) FROM $tbl;"
done

# Sequence parity (critical for experiments.number)
psql "$DATABASE_URL_DIRECT" -tA -c \
  "SELECT last_value FROM experiments_number_seq;"
psql "$DO_SAGAN_PRIMARY_URL" -tA -c \
  "SELECT last_value FROM experiments_number_seq;"

# Migrations table
psql "$DO_SAGAN_PRIMARY_URL" -tA -c \
  "SELECT count(*) FROM drizzle.__drizzle_migrations;"
# Should equal 28.

# Vector index presence
psql "$DO_SAGAN_PRIMARY_URL" -c \
  "SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%vector%';"
```

### C8. Swap env vars

**VM `.env`** (the runner reads this via systemd's `EnvironmentFile`):

```bash
# Backup current
cp /home/thomasjiralerspong/sagan/.env \
   /home/thomasjiralerspong/sagan/.env.neon-backup-$(date +%Y%m%d)

# Replace the two lines (no other Neon-bound URLs in the repo):
#   DATABASE_URL=…neon… → $DO_SAGAN_POOL_URL
#   DATABASE_URL_DIRECT=…neon… → $DO_SAGAN_PRIMARY_URL
```

**Vercel** (production + preview):

```bash
cd /home/thomasjiralerspong/sagan/apps/web
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production
# Paste $DO_SAGAN_POOL_URL when prompted

vercel env rm DATABASE_URL_DIRECT production
vercel env add DATABASE_URL_DIRECT production
# Paste $DO_SAGAN_PRIMARY_URL when prompted

# Repeat for preview if you use the same DB; otherwise leave Neon for preview
# and only flip production.
```

Trigger a Vercel redeploy:

```bash
cd /home/thomasjiralerspong/sagan
git commit --allow-empty -m "chore: redeploy after DB migration to DO Postgres"
git push
```

Wait for Vercel to mark the new deployment Ready.

### C9. Restart the runner

```bash
cd /home/thomasjiralerspong/sagan
./scripts/restart-runner.sh
```

The runner will pick up the new `DATABASE_URL_DIRECT` from `.env`,
open a fresh LISTEN connection against DO, and resume sweep timers.
Tail the journal to confirm:

```bash
sudo journalctl -u sagan-runner -f
# Expect: "subscribed to agent_run_queued and agent_run_approved"
# Expect: no "PostgresError" / "data transfer quota" messages.
```

### C10. Smoke tests

1. Open https://sagan.superkaiba.com — homepage loads.
2. /pipeline — cards render.
3. Click an experiment — entity page loads, PlanPanel renders, agent log loads.
4. Run a tiny qa dispatch:
   ```bash
   set -a; . /home/thomasjiralerspong/sagan/.env; set +a
   RUN_ID=$(psql "$DATABASE_URL_DIRECT" -tA -c \
     "INSERT INTO agent_runs (kind, provider, status, request, approval_required)
      VALUES ('qa', 'claude_code', 'queued', 'smoke test: reply with OK', false)
      RETURNING id;")
   psql "$DATABASE_URL_DIRECT" -c "SELECT pg_notify('agent_run_queued', '$RUN_ID');"
   # Watch the run reach status=completed within ~30 s.
   ```
5. Post a `@claude` comment on a project narrative — the runner should pick it up.

If any smoke fails, **investigate before unlocking Neon** so you can
roll back by reverting `.env` and Vercel env.

## Rollback (if smoke fails)

```bash
# 1. Restore env vars from the backup
cp /home/thomasjiralerspong/sagan/.env.neon-backup-* \
   /home/thomasjiralerspong/sagan/.env

# 2. Re-add Neon URLs to Vercel and redeploy
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production  # paste old Neon pool URL
vercel env rm DATABASE_URL_DIRECT production
vercel env add DATABASE_URL_DIRECT production  # paste old Neon direct URL
git commit --allow-empty -m "rollback: revert to Neon DB"
git push

# 3. Unlock writes on Neon
psql "<OLD_NEON_DIRECT_URL>" -c \
  "ALTER DATABASE neondb SET default_transaction_read_only = off;"

# 4. Restart runner
./scripts/restart-runner.sh
```

You'll lose any writes that happened on DO after the cutover —
which should be near-zero because the runner just started and the
smoke tests are the only writes.

## Post-cutover (next 7 days)

- **Keep Neon alive but read-only.** As long-tail rollback insurance.
  Cost: whatever Neon Free / Launch tier is.
- **Rebuild any vector indexes you dropped in C3** if pg_dump didn't
  recreate them:
  ```sql
  -- Confirm they exist; recreate if missing. Schema file is the
  -- source of truth.
  CREATE INDEX projects_embedding_idx ON projects USING hnsw (embedding vector_cosine_ops);
  ```
- **Watch the runner journal for errors** during the first 24 h —
  pgvector version mismatches, connection limits, slow queries.
- **Tighten DO Trusted Sources** if you started with `0.0.0.0/0`. Add
  Vercel's egress range if available; otherwise accept the simplicity.
- **Drop `experiments.number_seq` if it desynced.** Manually
  re-sequence:
  ```sql
  SELECT setval('experiments_number_seq', (SELECT MAX(number) FROM experiments));
  ```

## Cleanup (after 7-14 days of stability)

- Delete the Neon project.
- Cancel any temporary Neon plan upgrade (Launch → Free) used to get
  past the transfer cap during the dump.
- Remove `.env.neon-backup-*` from the VM.
- Delete `/tmp/sagan-cutover.dump`.

## Estimated total time

| Phase | Wall time | Downtime |
|---|---|---|
| P0-P5 pre-flight | ~1 h, days before | none |
| C1 stop runner + drain | 0-15 min | runner offline |
| C2-C3 lock + drop indexes | 2 min | writes rejected |
| C4 pg_dump | 10-20 min | writes rejected |
| C5 create DB + extension | 1 min | writes rejected |
| C6 pg_restore | 10-20 min | writes rejected |
| C7 verify | 5 min | writes rejected |
| C8 swap env + Vercel redeploy | 5 min | writes rejected |
| C9 restart runner | 2 min | runner offline |
| C10 smoke tests | 5 min | live again |
| **Cutover total** | **~45-75 min** | **~40-60 min of writes** |

## Risks and mitigations

- **pgvector version mismatch**: rebuild indexes after restore as
  insurance. Verified safe per HNSW format docs.
- **Neon transfer cap blocks dump**: temporarily upgrade Neon to
  Launch for cutover day.
- **Connection limit on DO 2 GB plan**: we provisioned the right
  size; 47 connections > Sagan's actual peak.
- **Vercel env propagation delay**: forcing a fresh deploy guarantees
  the new env takes effect. Don't trust runtime env reloads.
- **Sequence drift**: pg_dump captures sequence values, but manually
  re-setval the critical sequences if anything looks off in C7.
- **Dropped indexes not recreated**: pg_dump custom format includes
  the index definitions in post-data and rebuilds them on restore —
  but verify in C7 with `pg_indexes`.
- **LISTEN works through PgBouncer transaction-mode = NO**: the
  runner uses `DATABASE_URL_DIRECT` (DO's primary, non-pooled URL).
  Vercel functions use the pool URL for short transactional queries.
  This is the same split Sagan already has on Neon.

## Why not use logical replication for zero-downtime

DO Managed Postgres supports `pglogical` and standard logical
replication. A zero-downtime cutover would:

1. Set up logical replication: Neon → DO.
2. Wait for replication to catch up (continuous tailing).
3. Switch env vars during a brief connection-drain window.
4. Drop the replication slot.

For Sagan's single-owner workload, the 45-75 min downtime cost is
cheaper than the engineering time to set up and validate logical
replication. Skipping. If the owner-count grows to 5+ users with
real SLAs, revisit.

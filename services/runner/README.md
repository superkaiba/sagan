# @sagan/runner

VM-side daemon that picks up queued `agent_runs` rows and executes them via
the Claude Agent SDK.

## How it works

1. The dashboard inserts a row into `agent_runs` with `status='queued'` and a
   request string. The API route (or any caller) issues
   `pg_notify('agent_run_queued', '<run_id>')`.
2. This daemon's `LISTEN agent_run_queued` connection wakes up. It atomically
   flips the row to `status='running'` (skipping the work if another
   instance already claimed it) and starts a Claude Agent SDK session in
   `cwd = repo root`.
3. Every SDKMessage is persisted as an `agent_run_events` row.
4. For `kind = plan` or `experiment`: the run stops at
   `status='awaiting_approval'` once the model invokes `ExitPlanMode`. The
   captured plan markdown lands in `agent_runs.plan_md`.
5. Approved `kind = experiment` runs dispatch RunPod pods. Approved
   non-experiment runs are finalized as `completed` with an
   `approval_finalized` event because there is no runner-side dispatch step.
6. For `kind = apply`: the model executes file edits, the runner watches the
   stream, and the run reaches `status='completed'` on success.
7. For `kind = qa`: tools are restricted to read-only (Read, Grep, Glob); the
   final assistant text is returned.

The queue sweep also runs every 60 seconds. It picks up missed `queued` and
`approved` rows, finalizes approved non-experiment rows, and marks old
`running` rows failed after the stale timeout so dead sessions do not block the
workflow indefinitely.

Background jobs (`lit_review`, `insight_scan`, `weekly_digest`) are wrapped in
`job_runs`: cron, boot, NOTIFY, and queued durable job rows all transition
through `running` to `completed`, `skipped`, or `failed`.

Runner audit writes are best-effort. Each trail event attempts to write both a
structured `audit_events` row and a mirrored daily-log note; write failures are
logged but do not fail agent runs or jobs.

## Local dev

```bash
# Terminal A — long-running daemon
pnpm --filter @sagan/runner dev

# Terminal B — drop a smoke-test job and wait for the plan
pnpm --filter @sagan/runner smoke
```

The daemon logs to stdout; systemd in production routes to journald.

## Production (VM)

```bash
sudo cp services/runner/systemd/eps-runner.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eps-runner
journalctl -u eps-runner -f
```

The unit reads env from the repo's `.env` file and runs as
`thomasjiralerspong` so it has the same permissions as the interactive
checkout. `ProtectHome=read-only` is loosened only for
`/home/thomasjiralerspong/sagan` so the runner can make self-improvement edits.

## Env

- `DATABASE_URL_DIRECT` — required (LISTEN/NOTIFY does not work through the
  Neon pooler).
- `ANTHROPIC_API_KEY` — required.
- `RUNNER_LOG_LEVEL` — `debug | info | warn | error` (default `info`).
- `RUNNER_REPO_ROOT` — defaults to `../..` from the runner's cwd.
- `RUNNER_STALE_RUNNING_MINUTES` — optional stale timeout for `running`
  `agent_runs` rows (default `360`).

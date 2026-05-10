# EPS Research Dashboard

Personal research-life dashboard. Greenfield successor to
`explore-persona-space-dashboard`.

- **Live**: https://sagan.superkaiba.com (also at https://eps-research-dashboard.vercel.app)
- **Database**: Neon Postgres 17 (us-east-1) with pgvector 0.8.0
- **Runner**: VM-side systemd service running the Claude Agent SDK
- **GitHub**: https://github.com/superkaiba/eps-research-dashboard

## Layout

```
apps/
  web/             Next.js 16 (Turbopack) — primary dashboard
  mobile/          deferred; PWA covers the use case for now
packages/
  db/              Drizzle schema, migrations, query helpers
  api/             Shared Zod schemas
  auth/            argon2id password + hand-rolled session tokens
  agent-protocol/  Typed RunRequest / RunEvent / Plan / Approval
  ui/              shared UI primitives (placeholder)
services/
  runner/          systemd-managed daemon: Claude Agent SDK + RunPod
                   adapter + cron jobs (lit-review, weekly-digest,
                   insight-scan)
```

## Surfaces

- `/today` — research log (4 entry kinds) + Kanban + `/today/[date]` archive
- `/tasks` — Kanban over `todos`
- `/projects` — list + create + running summary panel
- `/beliefs` — list + create + version history
- `/knowledge` — kind-grouped browse + `/knowledge/graph` (React Flow + Dagre)
- `/library` — 4-state lanes + `/library/today` (cron-driven arxiv inbox)
- `/agent` — dispatch (plan/apply/qa/experiment) + live SSE event stream + plan approval
- `/digests` — Claude-drafted weekly summaries + edit + Mark sent
- `/e/[kind]/[id]` — generic detail (editable title + body, edges rail, comments rail)

Public (no-auth) routes:

- `/login`, `/api/auth/*`
- `/digest/[date]` — daily digest permalinks
- `/d/[token]` — weekly digest share link
- `/mentor/updates` — public scrape of the GitHub project board for the legacy mentor view
- `/p/`, `/r/` — reserved for project / run share tokens

## Local development

```bash
pnpm install
# Copy .env.example to .env and fill in Neon + Anthropic + RunPod keys
pnpm --filter @eps/db db:migrate
pnpm --filter @eps/db db:seed   # creates the owner user

# Web (binds 0.0.0.0:3100 so the VM URL reaches it)
pnpm --filter @eps/web dev

# Runner (locally)
pnpm --filter @eps/runner dev
```

## Production

- The web app is deployed by Vercel on every push to `main`.
- The runner is a systemd service on the VM (see
  `services/runner/systemd/eps-runner.service`).
- Three cron jobs run inside the runner:
  - `0 6 * * *` lit-review (arxiv RSS pull)
  - `0 18 * * 0` insight-scan (cross-project edge proposals)
  - `0 22 * * 0` weekly-digest (Claude-drafted advisor summary)
- Manual trigger of any cron via Postgres NOTIFY (`lit_review_run`,
  `insight_scan_run`, `weekly_digest_run`).

## Mobile

Installable as a PWA from `sagan.superkaiba.com` on iOS/Android.
The full Expo wrapper is intentionally deferred — the PWA covers
dispatch, plan approval, and Q&A in the same browser-shaped UI.

## Plan

Implementation plan: `~/.claude/plans/this-codebase-has-evolved-joyful-pebble.md`.

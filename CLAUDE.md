# Sagan — Agent Rules

Sagan is a research dashboard intended to host multiple research projects
as tenants. Vercel production at `sagan.superkaiba.com` is the canonical
live surface; the VM is the agent runner and workspace. The
`explore-persona-space` (EPS) project is the first and currently only
tenant — multi-tenancy in the schema and API is a future phase (see
*Tenant-agnostic guardrail* below).

## Tenant-agnostic guardrail

Sagan is intended to host multiple research projects as tenants. New
tables, fields, API routes, and UI views must pass the test: *would a
hypothetical second project (something other than EPS) plausibly want
this exact thing?* If no — the concept is EPS-shaped — it belongs in the
`explore-persona-space` repo, not here. EPS-specific files that already
exist in this repo (`apps/web/src/lib/mentor-results-data.ts`,
`apps/web/data/mentor-legacy-results.json`, `docs/clean-result-guidelines.md`,
`docs/em-mechanism-lit-review-*.md`) are legacy and will be moved out in
a later phase; do not add more.

Clients of Sagan (EPS today, more later) talk to it only over HTTP.
Sagan never reaches into a client repo at runtime.

## Layout

- `apps/web` — Next.js 16 dashboard (deployed to Vercel).
- `apps/mobile` — Expo (RN + web) phone companion (Phase 6).
- `packages/{db,api,auth,agent-protocol,ui}` — shared workspace packages.
- `services/runner` — VM-side daemon orchestrating Claude Agent SDK runs.

## Operating Model

- Treat `https://sagan.superkaiba.com` or `NEXT_PUBLIC_SITE_URL` as live
  (the canonical domain; `dashboard.superkaiba.com` is kept as a legacy
  alias and stays attached to the same Vercel project).
- The agent runs on a VM. The user cannot access `localhost` or `127.0.0.1`
  from their browser. The main user-facing view is
  `https://sagan.superkaiba.com`.
- Use the VM checkout at `/home/thomasjiralerspong/sagan` to
  inspect, edit, test, commit, and push changes.
- When showing a dev or preview server from this VM, bind to `0.0.0.0` and
  report the external VM URL `http://35.226.138.62:<port>/...`. Do not give
  `localhost` URLs to the user.
- Every completed web/app change must end with a user-reachable link. Prefer
  a verified Vercel deployment for production-ready work. If production deploy
  is not appropriate, create or keep alive an online preview/dev URL on the VM
  and report `http://35.226.138.62:<port>/...`; never stop at "open localhost".
- For production changes: run checks, commit, push to the Vercel-connected
  branch, and report the Vercel deployment URL/status when available.
- Do not use destructive git commands (`git reset --hard`, `git checkout --`,
  etc.) unless the user explicitly asks.
- Do not revert unrelated dirty work. Work with existing changes.

## User-facing ergonomics

The user does not want to run terminal commands. Default to surfaces they
can tap from a phone or browser:

- Trigger one-off chores (mobile builds, manual data jobs, etc.) via
  `workflow_dispatch` GitHub Actions, not local `pnpm`/`eas`/`gh` commands.
  When a workflow needs an input, pick a sensible default so it can be
  fired with a single click. Run them on the user's behalf with `gh
  workflow run` from this VM and hand back the run URL.
- Publish artifacts to a URL: GitHub Actions Summary, the Sagan dashboard,
  a published artifact page, or a tappable install link. Never tell the
  user to copy something out of a terminal pane.
- For install / QR-style hand-offs, embed the QR image inline in the
  Actions Summary (e.g. `api.qrserver.com/v1/create-qr-code`) so opening
  the run page on the phone is enough.
- If a step truly requires a terminal action by the user (interactive
  login, OAuth device flow, registering an iOS UDID), state that one
  explicit step and otherwise stay out of the terminal.

## Improvement Modes

- **Clarify**: inspect enough to ask precise questions. Do not edit, commit,
  push, or deploy.
- **Direct apply**: edit the main checkout, run checks, commit, push, and
  verify the Vercel deployment.
- **Sandbox preview**: create a git worktree under
  `/home/thomasjiralerspong/eps-dashboard-runs/<run-id>`, run a preview server
  on an available `31xx` port, and stop before production promotion until the
  user approves.

## Checks

- Run `pnpm typecheck` for code changes.
- Run `pnpm build` before production-affecting pushes.
- For UI changes, verify desktop and phone widths when possible.

## Database

- Single Neon project (currently named `eps-research` for historical
  reasons; Postgres 17, pgvector 0.8.0, `aws-us-east-1`). Connection
  strings live in `.env` (gitignored).
- `DATABASE_URL` (pooled) is for serverless functions; `DATABASE_URL_DIRECT`
  is for migrations and runner LISTEN/NOTIFY.
- Migrations: `pnpm --filter @sagan/db db:generate` to author, `db:migrate`
  to apply. Generated SQL is committed under `packages/db/drizzle/`.

## Auth

- Single owner. Password auth (argon2id) with hand-rolled session tokens
  (60-day sliding expiration). No Lucia, no Supabase.
- `users` and `sessions` tables live in `@sagan/db` schema.
- Session helpers in `packages/auth/src/session.ts`.
- Long-lived API tokens (`sk_…` prefix) for scripts and agents: mint
  and revoke at `/api-tokens`. Stored hashed in the `api_tokens` table;
  helpers in `packages/auth/src/api-token.ts`. `getSession()` accepts
  them as `Authorization: Bearer sk_…` alongside session bearers.
- A token for VM-side scripts lives in `.env` as `$SAGAN_API_TOKEN`
  (name: `vm-scripts`). Read it from `process.env.SAGAN_API_TOKEN` —
  never hard-code the value. Revoke and re-mint from `/api-tokens` if
  it leaks.

## Projects

A research project is a row in the `projects` table (`slug`, `title`,
`summary_md`, `status`, `public`, `share_token`, `embedding`). The
dashboard view is `/p/<slug>`.

Create one by POSTing to `/api/projects` with the VM-side API token:

```bash
set -a; . /home/thomasjiralerspong/sagan/.env; set +a
curl -sS -X POST "$NEXT_PUBLIC_SITE_URL/api/projects" \
  -H "Authorization: Bearer $SAGAN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "...", "summaryMd": "..."}'
```

Body schema (Zod-validated): `title` (required, ≤200 chars), `slug`
(optional, `[a-z0-9-]+`, ≤120 chars — auto-derived from title and
numeric-suffixed for uniqueness if omitted), `summaryMd` (optional,
≤20k chars). The handler also writes a daily-log trail entry and
enqueues a `project_lit_review` job via `pg_notify`; the runner picks
it up and writes a draft row into `project_narratives`.

## Agent Run Tracking

The runner records every action it takes. Useful tables:

- `agent_runs` — one row per dispatched run (kind ∈ {plan, apply, qa, experiment}, status, request, plan_md, runpod_pod_id, ...).
- `agent_run_events` — append-only event log per run (tool calls, file changes, errors, deploys).
- `chat_sessions` and `chat_messages` — persisted dashboard conversations.
- `comments` — per-entity discussion + Claude-as-commenter (see plan §4f).

Use short event messages. Do not write secrets into run summaries or events.

## Output format

Default to **HTML** for long-lived artifacts the user will read in a
browser: design explorations, "compare N options" mockups, spec docs,
PR / code-review writeups, runtime explainers, weekly digests, mentor
updates, and **clean experiment results** (the `body` field on an
experiment entity). Sagan renders HTML attached to an entity inline via
`figures.kind = 'html_artifact'` or via `<RichBody>` on the entity page.
Pair with the `frontend-design` plugin for defaults that don't look
generic.

Keep **markdown** for code-adjacent files where diffs matter:
`CLAUDE.md`, `README.md`, commit messages, PR bodies, and daily-log
entries the user types in the dashboard. The principle: HTML for "I'll
open this in a browser and look at it", markdown for "this lives in git
and I'll read its diff".

For **clean experiment results** specifically — the HTML write-up that
lives on `experiments.body` and renders at `/e/experiment/[id]` — follow
`docs/clean-result-guidelines.md`. That doc covers the canonical three-
piece structure (TL;DR → primary plot → Experimental design dropdown),
title rules, plot conventions (plain-English labels, no math notation in
the chart, real data not approximations, SVG `<title>` hover tooltips),
voice rules ("I" not "we", no fluff transitions), sections to avoid
(standing caveats, additional figures, separate background/methodology
h2s, references to abandoned metrics), and a worked example
(experiment #311).

## Implementation Plan

The full multi-phase blueprint lives at
`~/.claude/plans/this-codebase-has-evolved-joyful-pebble.md`. Refer to it for
hierarchy decisions, route structure, the comment system contract, RunPod
workflow, etc.

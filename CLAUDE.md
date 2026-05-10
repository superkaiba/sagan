# EPS Research Dashboard — Agent Rules

This repository is the new research-life dashboard. Greenfield successor to
`explore-persona-space-dashboard`. Vercel production is the canonical live
surface; the VM is the agent runner and workspace.

## Layout

- `apps/web` — Next.js 16 dashboard (deployed to Vercel).
- `apps/mobile` — Expo (RN + web) phone companion (Phase 6).
- `packages/{db,api,auth,agent-protocol,ui}` — shared workspace packages.
- `services/runner` — VM-side daemon orchestrating Claude Agent SDK runs.

## Operating Model

- Treat `https://sagan.superkaiba.com` or `NEXT_PUBLIC_SITE_URL` as live
  (the canonical domain; `dashboard.superkaiba.com` is kept as a legacy
  alias and stays attached to the same Vercel project).
- Use the VM checkout at `/home/thomasjiralerspong/sagan` to
  inspect, edit, test, commit, and push changes.
- When showing a dev or preview server from this VM, bind to `0.0.0.0` and
  report the external VM URL `http://35.226.138.62:<port>/...`. Do not give
  `localhost` URLs to the user.
- For production changes: run checks, commit, push to the Vercel-connected
  branch, and report the Vercel deployment URL/status when available.
- Do not use destructive git commands (`git reset --hard`, `git checkout --`,
  etc.) unless the user explicitly asks.
- Do not revert unrelated dirty work. Work with existing changes.

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

- Single Neon project `eps-research` (Postgres 17, pgvector 0.8.0,
  `aws-us-east-1`). Connection strings live in `.env` (gitignored).
- `DATABASE_URL` (pooled) is for serverless functions; `DATABASE_URL_DIRECT`
  is for migrations and runner LISTEN/NOTIFY.
- Migrations: `pnpm --filter @eps/db db:generate` to author, `db:migrate` to
  apply. Generated SQL is committed under `packages/db/drizzle/`.

## Auth

- Single owner. Password auth (argon2id) with hand-rolled session tokens
  (60-day sliding expiration). No Lucia, no Supabase.
- `users` and `sessions` tables live in `@eps/db` schema.
- Session helpers in `packages/auth/src/session.ts`.

## Agent Run Tracking

The runner records every action it takes. Useful tables:

- `agent_runs` — one row per dispatched run (kind ∈ {plan, apply, qa, experiment}, status, request, plan_md, runpod_pod_id, ...).
- `agent_run_events` — append-only event log per run (tool calls, file changes, errors, deploys).
- `chat_sessions` and `chat_messages` — persisted dashboard conversations.
- `comments` — per-entity discussion + Claude-as-commenter (see plan §4f).

Use short event messages. Do not write secrets into run summaries or events.

## Implementation Plan

The full multi-phase blueprint lives at
`~/.claude/plans/this-codebase-has-evolved-joyful-pebble.md`. Refer to it for
hierarchy decisions, route structure, the comment system contract, RunPod
workflow, etc.

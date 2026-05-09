# EPS Research Dashboard

Personal research-life dashboard. Greenfield rewrite of the previous `explore-persona-space-dashboard`.

## Layout

```
apps/
  web/             Next.js 16 App Router — primary dashboard
  mobile/          Expo (RN + web) — phone companion
packages/
  db/              Drizzle schema, migrations, query helpers
  api/             Shared API client + Zod schemas
  auth/            Password auth (Lucia v3 + argon2id)
  ui/              Cross-platform primitives
  agent-protocol/  Typed contract for VM ↔ apps
services/
  runner/          VM-side daemon: Claude Agent SDK orchestrator
infra/
  vercel.ts        Project config
```

## Plan

Implementation plan lives at `~/.claude/plans/this-codebase-has-evolved-joyful-pebble.md`.

## Local development

```bash
pnpm install
pnpm dev
```

Requires Node 20+ and pnpm 9+.

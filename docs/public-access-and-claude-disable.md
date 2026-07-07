# Public access + Claude Code disabled (2026-07-06)

Two changes shipped together:

1. **No login required.** Every dashboard page renders without a session.
2. **Claude Code access disabled.** No web surface can dispatch agent work
   or call the Anthropic API.

## 1. Login removal

- `apps/web/proxy.ts` no longer bounces cookieless requests to `/login`.
  It only tags requests with `x-sagan-pathname`.
- `apps/web/app/(app)/layout.tsx` treats an anonymous visitor as a full
  read-only viewer: sidebar shows "Public view" and a **Sign in** link
  instead of the logout button. Signed-in non-owner accounts keep their
  limited mentor view.
- Pages that had their own session gates (`/e/[kind]/[id]`,
  `/clean-results/[id]`, `/digests/[id]`, `/agent/[id]`,
  `/mentor/daily/[date]`) now render without a session.
- Read-only GET APIs opened to anonymous callers so public pages work
  end to end: `comments`, `search`, `approvals/count`, `edges`,
  `entity/[kind]/[id]`, `experiments/[id]/improve` (status).

**What stays gated:**

- All mutations (POST/PATCH/DELETE) still require a session or `sk_` API
  token, and most require the owner role — anonymous visitors can look,
  not touch.
- `/api-tokens` and `/admin/health` redirect to `/login`.
- `/login` still works; sign in to get write access back in the browser.

## 2. Claude Code / agent dispatch disabled

Kill switch: `apps/web/src/lib/agent-dispatch.ts`. Dispatch is **off by
default**; set `SAGAN_ENABLE_AGENT_DISPATCH=1` (Vercel env) to restore it.

Hard-blocked routes (return `403 agent_dispatch_disabled`):
`agent-runs` (POST), `agent-runs/[id]/{approve,launch-pod,retry}`,
`conversations` (POST) + `conversations/[id]/send`, `comments/revise`,
`narratives/[id]/improve`, `experiments/[id]/{improve,dispatch-planner,queue-followups}`,
`pipeline/advance`, `daily-log/clean-result/{draft,question}` (inline
Anthropic calls), `lit-review/run`, `weekly-digest/run`.

Soft-blocked (route works, Claude enqueue skipped): `@claude`/`@codex`
comments still post but never dispatch; experiment PATCH to
`clean_result_drafting` no longer resumes the orchestrator; project
creation no longer enqueues a lit-review job.

UI: the Claude conversation dock is hidden. Other dispatch buttons remain
visible but their API calls return 403.

**Not covered by the switch:** the VM runner daemon still runs its own
cron jobs (daily lit review, weekly digest, insight scan) and watchers.
Stopping those means stopping `sagan-runner` on the VM — out of scope
here since the ask was about dashboard access.

## Reverting

- Re-enable Claude dispatch: set `SAGAN_ENABLE_AGENT_DISPATCH=1` in the
  Vercel project env and redeploy.
- Restore the login wall: revert this commit (`git revert <sha>`); the
  auth plumbing (sessions, tokens, guards) was left intact.

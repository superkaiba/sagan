# Sagan EPS Control-Surface Plan

## Goal

Make Sagan the **dashboard and human control surface** for the EPS task
workflow. The user runs `/issue N` end-to-end without touching a terminal:
view state, read timelines, read plans, comment, ask Claude, approve gates,
block/unblock, promote — all from the dashboard.

The `/issue` skill in EPS stays the engine. Sagan does not run a parallel
state machine.

## Why this supersedes earlier plans

Two earlier documents must be treated as historical context only:

- `docs/exec-plans/eps-workflow-port-plan.md` — declares "Sagan is the only
  workflow control plane" and "Sagan is canonical." That model has been
  reversed by EPS's recent migration to local files
  (`explore-persona-space/.claude/workflow.yaml` declares
  `control_plane: local_files`).
- `docs/eps-sagan-workflow-integration.md` — same direction, also stale.

Phase 0 of this plan marks both superseded with a header pointer to this
file. They are not deleted; they remain readable as the historical
context for why Sagan still has experiments/pipeline tables and HTTP
endpoints that talk EPS-shaped concepts.

## Locked Decisions

- **EPS local files are canonical workflow state.** `tasks/<status>/<N>/`
  folders, `events.jsonl`, `comments.jsonl`, `plans/`, `body.md`.
- **`scripts/task.py` (in EPS) is the single writer.** Flock + git commit
  per operation. Already true.
- **The `/issue` skill (in EPS) is the engine.** Exit-on-gate semantics
  retained. Resumability via re-invocation from current state.
- **Sagan is the dashboard.** Reads mirror cache, presents gate buttons,
  shells out to `task.py` for writes, spawns fresh `/issue N` for
  workflow advancement after approvals.
- **No new HTTP service in EPS.** Sagan's runner shells out to `task.py`
  directly with `cwd=EPS`.
- **One new board for EPS tasks in v1, at `/eps/board`.** No second
  variant (no separate `/eps/archive`, `/eps/blocked`, etc.) — one
  board, all statuses, grouped by `workflow.yaml` columns. The existing
  `/pipeline` board is kept untouched for its current non-EPS scope
  (todos, clean results, ideas); its experiment branch is excised but
  it does not show EPS tasks. Merging `/pipeline` into `/eps/board` is
  a v2 question.
- **Push-based tailer.** Sagan's runner watches the EPS `tasks/`
  directory via `chokidar` (fs-watch). No polling. No new code in EPS.
- **`promote` source-auth:** `task.py promote` gains
  `--source=sagan-user:<sagan_session_id>`. The `<sagan_session_id>` is
  the `sessions.id` value from `@sagan/db` for the currently
  authenticated browser session that triggered the promote. Sagan's
  runner reads it from the request context and passes it to `task.py`
  when shelling out. Workflow.yaml gate def for `awaiting_promotion`
  allows `source=sagan-user:*` as a valid human-invoked source. API
  token (`sk_…`) sources are rejected for promote.
- **Keep Sagan's existing `experiments` table for now.** Stop writing to
  it from new code, but do not drop. Cleanup is a follow-up plan.
- **Body = `claude` CLI subprocess.** Each "orchestrator body" is a
  literal `claude --print --input-format stream-json --output-format
  stream-json …` spawned by Sagan's `services/runner` with `cwd=EPS`
  and `prompt=/issue N`. Same surface a human's interactive session
  would see.
- **At most one body alive per task.** Enforced by a new lockfile
  `tasks/<status>/<N>/.orchestrator.pid` written and released by the
  `/issue` skill at entry/exit.
- **"Ask Claude" is a separate `kind=eps_qa` session.** It does NOT go
  through the orchestrator. Writes question and reply as comments via
  `task.py comment-add`.

## Target Architecture

```
                  One orchestrator per issue N
          ┌─────────────────────────────────────────────┐
          │  State machine (on disk in EPS)             │
          │  ├─ tasks/<status>/<N>/ (folder = status)   │
          │  ├─ events.jsonl                            │
          │  ├─ comments.jsonl                          │
          │  ├─ plans/v*.md                             │
          │  ├─ body.md                                 │
          │  ├─ artifacts/                              │
          │  └─ .orchestrator.pid (lock, gitignored)    │
          │                                             │
          │  At most one claude CLI subprocess alive    │
          │  acting on it at any moment.                │
          └─────────────────────────────────────────────┘
                ▲                                ▲
                │ shells out                     │ fs-watch (chokidar)
                │ task.py …                      │ on tasks/**/*.jsonl,
                │ + spawnIssueRun(N)             │ body.md, REGISTRY.json
                │                                ▼
        ┌───────┴──────────────┐         ┌──────────────────┐
        │   Sagan dashboard    │◄────────│  eps_task_mirror │
        │   + services/runner  │  reads  │  (Sagan DB)      │
        └──────────────────────┘         └──────────────────┘
                ▲
                │ HTTP + auth
                ▼
        ┌──────────────────────┐
        │       User           │
        │  (browser / phone)   │
        └──────────────────────┘
```

## Workflow Shape

Lifted directly from EPS `.claude/workflow.yaml`. Sagan does not redefine
this. Vendored copy lives at `packages/workflow/workflow.yaml`.

```
proposed → clarifying → planning → plan_pending → approved → implementing
  → code_reviewing → testing → running → uploading → verifying
  → interpreting → reviewing → awaiting_promotion → completed
```

Auxiliary: `blocked`, `followups_running`, `archived`, `shared`.

Sagan UI uses workflow.yaml's `columns` block for board grouping.

## Phased Implementation

### Phase 0 — Setup and supersession (~30 min)

- Commit this plan to Sagan `main`.
- Prepend supersession headers to:
  - `docs/exec-plans/eps-workflow-port-plan.md`
  - `docs/eps-sagan-workflow-integration.md`
- Create worktrees:
  - EPS: `.claude/worktrees/sagan-control-surface` branched off `main`.
  - Sagan: `.claude/worktrees/sagan-control-surface` branched off `main`.
- Confirm both worktrees clean; main checkouts' uncommitted changes
  remain in their respective working trees and are NOT carried into
  the worktrees.

### Phase 1 — EPS-side foundation (small, do first)

Worktree: EPS `sagan-control-surface`.

**1.1 `task.py comment-add` subcommand.**
- Args: `task_n`, `--author` (`user`|`claude`|`codex`), `--body-md`,
  optional `--thread-id`, optional `--reply-to`, optional
  `--source=sagan-user:<session>`.
- Behavior: append JSON line to `tasks/<status>/<N>/comments.jsonl`
  under flock, git-commit with message `comment-add #<N>`.
- ~30 LOC reusing existing flock + commit helpers.
- Test: write a comment, read it back, verify lockfile released and
  commit landed.

**1.2 Orchestrator lockfile.**
- Add `scripts/orchestrator_lock.py` with `acquire <N>`, `release <N>`,
  `status <N>` subcommands. File path:
  `tasks/<status>/<N>/.orchestrator.pid`. Gitignore that filename.
- Acquire: refuse if PID file exists and PID is alive. Else write own
  PID + start timestamp.
- Release: delete file if owning PID matches.
- Edit `/issue` skill (`SKILL.md`) — wrap the existing entry with
  `acquire`, every documented exit with `release`. On crash (no
  release), next invocation sees stale PID, takes it.
- Test: spawn two `claude … --prompt "/issue 192"` concurrently;
  second exits with `orchestrator-locked` marker after acquiring fails.

**1.3 `task.py` callable-API audit.**
- Enumerate subcommands Sagan will shell out to: `set-status`,
  `post-marker`, `comment-add` (new), `set-body`, `new-plan-version`,
  `promote`, `add-tag`, `remove-tag`, `latest-marker`, `view`,
  `list-by-status`, `list-markers`.
- For each, ensure it accepts `--json` (returns structured stdout) and
  `--source=<scheme>:<id>` (audit trail). Add where missing.
- Document the callable surface in `tasks/CALLABLE_API.md`.

**1.4 `task.py promote --source=sagan-user:*` plumbing.**
- Promote subcommand accepts the new `--source` flag. When source
  matches `sagan-user:*`, the human-only invariant is satisfied. When
  invoked without a sagan-user source or a TTY-attached terminal,
  promote refuses (preserves current behavior).
- Update workflow.yaml gate def for `awaiting_promotion` to enumerate
  valid `source` values.

**1.5 Workflow.yaml stays the same.** No structural changes to the
workflow itself. This phase only adds the writer surface Sagan needs.

### Phase 2 — Sagan-side plumbing (~2 days)

Worktree: Sagan `sagan-control-surface`.

**2.1 `SAGAN_CLIENT_REPOS` populated for EPS.**
- `.env` gains `SAGAN_CLIENT_REPOS={"eps":"/home/thomasjiralerspong/explore-persona-space"}`.
- `.env` gains `EPS_TASK_PY=<eps>/scripts/task.py`.
- `.env` gains `EPS_TASKS_DIR=<eps>/tasks`.
- `.env` gains `EPS_WORKFLOW_YAML=<eps>/.claude/workflow.yaml`.
- `.env.example` updated.

**2.2 `spawnIssueRun(taskN: number)` helper.**
- New file: `services/runner/src/lib/eps-orchestrator.ts`.
- Reuses existing `session.ts` `runWithStreaming`. Spawn args:
  `cwd = clientRepos.eps`, `prompt = /issue ${taskN}`, `kind =
  eps_orchestrator`, `clientSlug = eps`.
- Inserts row in `agent_runs` with `kind = 'eps_orchestrator'` and
  new column `eps_task_n int`. Stream-json events get tagged with
  `eps_task_n` so they appear on the task detail page.
- Drizzle migration for `agent_runs.eps_task_n` (nullable, indexed).

**2.3 `eps-mirror` fs-watch job.**
- New file: `services/runner/src/jobs/eps-mirror.ts`.
- On startup, walks `tasks/REGISTRY.json` and seeds the mirror table.
- `chokidar.watch` on `${EPS_TASKS_DIR}` with these globs:
  - `REGISTRY.json` (registry changes)
  - `**/events.jsonl`
  - `**/comments.jsonl`
  - `**/body.md`
  - `**/plans/*.md`
- On any change, identifies the task number from the path, shells
  out `task.py view --json <N>`, upserts mirror row, issues
  `pg_notify('eps_task_mirror_updated', '<N>')` for Next.js
  revalidation.
- Re-establishes watches on registry changes (a status transition
  moves the per-task folder; chokidar's `ignoreInitial: false`
  + `awaitWriteFinish` handles the rename).

**2.4 `eps_task_mirror` table.**
- New table via Drizzle migration:
  ```
  number int primary key
  status text not null
  title text not null
  kind text not null
  has_clean_result boolean not null
  latest_marker_kind text
  latest_marker_at timestamptz
  body_md text
  current_plan_md text
  blockers jsonb
  comments_summary jsonb
  events_tail jsonb
  updated_at timestamptz not null default now()
  ```
- Index on `(status, updated_at desc)` for board ordering.

**2.5 `eps-task-api` thin wrapper.**
- New file: `apps/web/src/lib/eps-task-api.ts`.
- One function per `task.py` subcommand, each calling `execFile` on
  `EPS_TASK_PY` with the current Sagan session ID injected as
  `--source=sagan-user:<id>`. Each returns a typed result parsed
  from `--json` stdout.
- Auto-respawn rules (encoded inline):
  | After                                       | Spawn `/issue N`? |
  | ------------------------------------------- | ----------------- |
  | approve from `plan_pending`                 | yes               |
  | promote from `awaiting_promotion`           | yes (follow-ups)  |
  | unblock                                     | yes               |
  | block                                       | no                |
  | comment-add                                 | no                |
  | ask-Claude                                  | no (separate qa)  |

**2.6 `kind=eps_qa` session support.**
- Extend runner to recognise `kind=eps_qa` runs. cwd=EPS, prompt
  scoped to the task: `"You are answering a question on task <N>.
  The question is in the latest user comment in tasks/<status>/<N>/
  comments.jsonl. Reply by writing a comment via 'task.py comment-add
  <N> --author=claude --body-md=<reply>'. Then exit."`
- Reuse existing chat-session / Claude-as-commenter machinery
  wherever possible.

### Phase 3 — Sagan dashboard surfaces (~3 days)

**3.1 `/eps/board` page.**
- New route: `apps/web/app/(app)/eps/board/page.tsx`.
- Reads `eps_task_mirror` grouped by `workflow.yaml` columns.
- Cards show: number, title, kind chip, latest marker, badges
  (`blocked`, `needs approval`, `has clean result`).
- Loading reactive via `pg_notify` channel.

**3.2 `/eps/t/[number]` task detail page.**
- New route. Sections:
  - Header: title, current status, kind, blockers.
  - Status banner with action buttons (see 3.3).
  - Timeline: last 50 events from `events_tail`. Each shows marker
    kind, timestamp, collapsible body.
  - Plan: render `current_plan_md`.
  - Body: render `body_md`.
  - Comments: threaded view from `comments.jsonl` mirror.
  - Composer for new comments.

**3.3 Status-conditional action buttons.**
| Current status                    | Buttons shown                                |
| --------------------------------- | -------------------------------------------- |
| `proposed`, `clarifying`, `planning` | Block, Comment, Ask Claude, Pause, Restart |
| `plan_pending`                    | Approve plan, Block, Comment, Ask Claude     |
| `approved`, `implementing`, …     | Block, Comment, Ask Claude, Pause, Restart   |
| `running` (long pod)              | Block, Comment, Ask Claude                   |
| `awaiting_promotion`              | Promote, Block, Comment, Ask Claude          |
| `blocked`                         | Unblock, Comment, Ask Claude                 |
| `completed`, `archived`           | Comment, Ask Claude                          |

- "Pause" sends SIGTERM to the lockfile PID. Records `epm:paused-via-sagan`.
- "Restart" pauses, then `spawnIssueRun(N)`.

**3.4 "Ask Claude" modal.**
- Composer + submit. POST to `/api/eps-task/[N]/ask-claude`.
- Server appends the question as a `user` comment via `comment-add`,
  then enqueues a `kind=eps_qa` run scoped to the task.
- The qa run writes the reply as a `claude` comment via `comment-add`.
- Comment thread updates live via mirror watch.

**3.5 API routes.**
- `apps/web/app/api/eps-task/[number]/approve/route.ts`
- `apps/web/app/api/eps-task/[number]/block/route.ts`
- `apps/web/app/api/eps-task/[number]/unblock/route.ts`
- `apps/web/app/api/eps-task/[number]/promote/route.ts`
- `apps/web/app/api/eps-task/[number]/comment/route.ts`
- `apps/web/app/api/eps-task/[number]/ask-claude/route.ts`
- `apps/web/app/api/eps-task/[number]/pause/route.ts`
- `apps/web/app/api/eps-task/[number]/restart/route.ts`
- `apps/web/app/api/eps-task/[number]/start/route.ts`
- All use `eps-task-api.ts` server-side.

### Phase 4 — Surgical edits (~1 day)

**4.1 `apps/web/app/api/pipeline/advance/route.ts` experiment branch.**
- File is 1030 lines, multi-purpose. Audit it; identify the experiment
  branch (`kind === 'experiment'` paths).
- Delete just that branch. Other branches (todos, clean-results, ideas)
  untouched.
- Delete experiment-only helpers that become unused; typecheck guides
  removals.

**4.2 `apps/web/app/(app)/pipeline/PipelineBoard.tsx`.**
- Strip experiment-column wiring. Keep todos/clean-results/ideas.
- Don't add EPS tasks here in v1 — those live on `/eps/board`.

**4.3 `services/runner/src/{dispatcher.ts, watcher.ts, agent-recovery.ts, followups-watcher.ts}`.**
- Read each. Identify EPS-experiment-specific logic (the parallel state
  machine the reviewer flagged).
- Delete EPS-experiment-specific paths. Keep generic process
  supervision, recovery, RunPod-for-Sagan-internal-jobs logic.
- Reconcile with the uncommitted changes still in `main` only when
  merging back — during this work the worktree is the source of truth.

**4.4 Workflow.yaml vendoring.**
- Copy `<eps>/.claude/workflow.yaml` to
  `packages/workflow/workflow.yaml`.
- New `packages/workflow/src/index.ts` parses the YAML, exposes typed
  `statuses[]`, `columns[]`, `markerKinds[]`, `gates[]`.
- Pre-commit hook in EPS reminds: "Copy to Sagan's vendored copy."
- Sagan boot warns on version mismatch.

### Phase 5 — CLAUDE.md and supersession (~30 min)

- Sagan `CLAUDE.md`:
  - Delete: "EPS workflow state is canonical in Sagan" and the
    paragraph that follows.
  - Replace with: "EPS workflow state is canonical in EPS local files
    (see `.claude/workflow.yaml`). Sagan reads it through the mirror
    cache and writes back via shell-outs to EPS `scripts/task.py`."
  - Relax tenant-agnostic guardrail: "The runner is allowed to spawn
    `claude` CLI subprocesses with `cwd` set to any registered client
    repo (see `SAGAN_CLIENT_REPOS`). It still does not touch client
    repo files directly except through the client's own writer."
  - Delete the sentence: "/issue <N> means Sagan experiments.number."
- EPS `CLAUDE.md`:
  - Update mentions of `eps.superkaiba.com/tasks/<N>` to point at
    `sagan.superkaiba.com/eps/t/<N>`.
- Both: cross-link to this plan.

### Phase 6 — End-to-end verification (~half day)

Acceptance: take one quiet existing EPS task through the loop using
Sagan only.

1. Start: open `/eps/t/<N>` in browser → click Start → `/issue N`
   spawned → planning runs → exits at `plan_pending`.
2. Read plan in Sagan timeline. Add a comment. Click Approve plan →
   status moves to `approved` → fresh body spawned → implementer
   runs.
3. Block mid-run (test disagreement path). Unblock. Watch resume.
4. Let it reach `awaiting_promotion`. Click Promote. Watch follow-ups.
5. Confirm timeline reflects every event accurately.
6. Try to run `/issue N` in terminal while a Sagan-spawned body is
   alive → lockfile rejects.

Pass criterion: full loop completes without touching a terminal.

### Phase 7 — Merge (~1 hr)

- EPS worktree → PR → merge into EPS `main` first. `task.py` and
  lockfile additions go live.
- Sagan worktree → PR → merge into Sagan `main`. Brings dashboard
  online.
- Merge order matters: Sagan depends on EPS's `task.py comment-add`
  and `--source` flag.

## Cleanup — explicitly NOT in v1

- Drop or downgrade `experiments` / `pipeline_*` tables in Sagan.
- Move EPS-tenant-specific legacy files
  (`mentor-results-data.ts`, `em-mechanism-lit-review-*.md`,
  `clean-result-guidelines.md`) out of Sagan into EPS.
- Merge the `/pipeline` and `/eps/board` boards.
- Multi-tenant rework (until there's a second tenant).

Tracked as follow-up plans, not blocking v1.

## Risks and mitigations

- **In-flight subagent state on crash.** If a body crashes mid-step,
  the spawned subagent may have left partial work. The next /issue N
  re-dispatches the subagent (current skill behavior); collision in
  the worktree is possible.
  *Mitigation:* document as known constraint. Subagents should be
  idempotent where possible; the `/issue` skill already takes the
  worktree lock at sub-agent dispatch boundaries.
- **fs-watch missed events.** Chokidar can miss events under heavy
  rename load.
  *Mitigation:* hourly reconciliation pass that re-reads
  `REGISTRY.json` and refreshes all rows.
- **Workflow.yaml drift between EPS and Sagan vendored copy.**
  *Mitigation:* pre-commit hook in EPS reminds; Sagan boot warns on
  version mismatch; CI check (later) fails on hash mismatch.
- **Concurrent body via terminal /issue + Sagan Start.**
  *Mitigation:* lockfile rejects the second one. The rejected session
  posts `epm:orchestrator-locked` so it's visible in the timeline.
- **Pause SIGTERM during git-commit in task.py.**
  *Mitigation:* skill catches SIGTERM, finishes the in-flight
  task.py invocation, then releases lock and exits. ~10 LOC in
  SKILL.md.

## Worktree paths

- EPS: `/home/thomasjiralerspong/explore-persona-space/.claude/worktrees/sagan-control-surface`
- Sagan: `/home/thomasjiralerspong/sagan/.claude/worktrees/sagan-control-surface`

Both branched from their respective `main` at the time Phase 0
commits this plan.

## Approval history

- 2026-05-20: brainstormed with user. Independent review FAILed the
  initial orchestrator-parking design; user accepted simpler
  shell-out-to-`task.py` + respawn-`/issue` design with one orchestrator
  per issue defined as state-machine-on-disk + at-most-one-live-body.

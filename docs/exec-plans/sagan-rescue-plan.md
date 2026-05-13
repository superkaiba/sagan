# Sagan Rescue Plan: Research Operating System

## Product Understanding

Sagan should let the owner do research without touching terminals, GitHub
project boards, ad hoc scripts, or separate literature/reporting tools. The
core loop is:

`idea -> plan -> approval -> RunPod experiment -> interpretation -> clean result -> comments/Q&A -> revision -> approval/share -> followups`

Everything else in the product should reduce cognitive load around that loop.

## Target Outcome

A trusted web/mobile research dashboard that shows running experiments,
yesterday's meaningful work, next steps, relevant literature, clean-result
drafts, weekly reviews, collaborator comments, Claude answers, and ideation
prompts.

After one month, the owner should trust Sagan as the full research dashboard
and should not need to use a terminal for normal research workflow.

## Non-Goals

- No secret rotation.
- No destructive data deletion.
- No automatic sending to advisors, mentors, or collaborators.
- No citation-management focus beyond paper metadata, summaries, ranking, and
  Q&A.
- No requirement to preserve current UI/API compatibility during the refactor.
  Production research data must survive.
- No full import of every historical GitHub issue. Import clean results; link
  and search everything else.

## Locked Decisions

- Use a hybrid rescue, not a greenfield rewrite.
- Protect production research data; UI/API compatibility can break.
- Import clean results from `/home/thomasjiralerspong/explore-persona-space`;
  link/search all other old issues and artifacts.
- Multi-user accounts are required for mentors and collaborators.
- Collaborators see scoped project context, not raw private notes or agent logs
  unless explicitly shared.
- Claude replies to comments immediately and is clearly attributed as Claude.
- Claude may automatically propose experiments, clearly marked as
  Claude-proposed. Queuing, plan approval, and launching still require owner
  approval.
- Weekly review drafts every Sunday by default. Manual kickoff must also be
  available.
- Ideation must both propose ideas and prompt the owner with question decks.
- Email notifications come first. Leave Slack, Discord, and other channels open
  for later.
- A one-time freeze/migrate window is acceptable when needed, with backup and
  rollback notes.
- Experiment approvals use a ranked queue with approve/defer/reject.
- After an experiment plan is approved, Sagan may launch real RunPod work
  without a second per-launch prompt.
- No fixed cost/concurrency cap for approved experiments. The approval
  bottleneck is the plan. Still record compute estimates and actual usage.
- Failed/stalled agent or experiment workflows auto-try up to 3 times, then
  move to blocked with evidence.
- Native Expo mobile is first-class.
- Public/share links use opaque tokens.

## Assumptions And Defaults

- "Production research data" means Neon DB rows, local experiment artifacts,
  `eval_results`, figures, comments, clean-result drafts, W&B/HF links, share
  tokens, GitHub issue history, and agent transcripts.
- Existing dirty work may be intentional. Preserve it.
- GitHub issues in `explore-persona-space` remain historical evidence, but
  Sagan should become the authoritative workflow state machine.
- For X/Twitter, do not paste account passwords into chat, code, or docs. Use
  OAuth/API credentials, exports, bookmarked/shared URLs, or another explicit
  connector path.
- Claude answers can post immediately, but product UI must make source and
  attribution obvious.
- Rough ideation sessions are autosaved, but only promoted idea cards, belief
  updates, experiment proposals, comments, or literature tasks enter the
  canonical research record.

## Current Repo Map

Sagan repo: `/home/thomasjiralerspong/sagan`

- `apps/web`: Next.js 16 app, main dashboard.
- `apps/mobile`: Expo app with login, Today, Agent, Run detail, and push hooks.
- `packages/db`: Drizzle schema and migrations for Neon Postgres + pgvector.
- `packages/auth`: current single-owner password/session auth.
- `packages/api`: shared Zod schemas.
- `packages/agent-protocol`: run/event/approval protocol.
- `packages/ui`: placeholder shared UI package.
- `services/runner`: Claude Agent SDK daemon, queue, cron jobs, partial RunPod
  dispatch.

Reference workflow repo: `/home/thomasjiralerspong/explore-persona-space`

High-value files read there:

- `CLAUDE.md`
- `.github/ISSUE_TEMPLATE/experiment.md`
- `.github/ISSUE_TEMPLATE/code-change.md`
- `.claude/skills/issue/SKILL.md`
- `.claude/skills/issue/markers.md`
- `.claude/skills/adversarial-planner/SKILL.md`
- `.claude/skills/auto-experiment-runner/SKILL.md`
- `.claude/skills/experiment-proposer/SKILL.md`
- `.claude/skills/clean-results/template.md`
- `.claude/skills/clean-results/principles.md`
- `.claude/skills/clean-results/checklist.md`
- `.claude/skills/promote-clean-result/SKILL.md`
- `scripts/pod.py`
- `scripts/pod_lifecycle.py`
- `scripts/runpod_api.py`
- `scripts/pod_watch.py`
- `scripts/gpu_heuristics.py`
- `scripts/verify_uploads.py`
- `scripts/gh_project.py`
- `scripts/gh_issue_state.py`

## Existing Functionality To Preserve

- Monorepo structure and Drizzle schema center.
- Auth/session base.
- `agent_runs` and `agent_run_events` append-only event model.
- SSE/mobile agent approval flow.
- `job_runs`, `audit_events`, and daily trail concept.
- Comments model with Claude-trigger support.
- Today, projects, beliefs, tasks, library, digests, agent surfaces.
- Expo mobile approval and push registration path.
- Systemd runner model.
- Static mentor/public continuity until tokenized replacements exist.
- Generic entity detail and polymorphic edges/comments where useful.

## Functionality To Delete Or Defer

Delete only after explicit confirmation. Defer or consolidate:

- Advanced graph visualization as a primary UI.
- Date-guessable public digest links. Replace with opaque tokens.
- Duplicate push registration APIs.
- `/p/` and `/r/` public routes until tokenized sharing is real.
- Silent edge insertion from insight scan. Change to suggestions requiring
  review.
- Full Slack/Discord support.
- Whole old-issue import.
- Full citation management.

## Architecture Direction

Keep Sagan's monorepo and make the experiment workflow the architectural spine.

Port the `explore-persona-space` issue state machine into Sagan DB/UI:

`proposed -> planning -> plan_pending -> approved -> running -> verifying -> interpreting -> reviewing -> awaiting_promotion -> approved/shared or blocked`

GitHub issue markers become typed Sagan workflow events. Sagan comments become
the human/Claude review surface. Agent runs stay append-only and auditable.

The runner should become a workflow engine, not just "run Claude and log
output." It should orchestrate:

- adversarial planning;
- approval gates;
- RunPod launch/watch/retry;
- artifact verification;
- interpretation critique;
- clean-result drafting;
- comment-triggered Q&A and revisions;
- notifications;
- blocked-state summaries.

## Data Model Direction

Add or evolve tables carefully through reviewed migrations:

- `entity_memberships`: user/entity/project access scope and role.
- `notifications`: in-app/email/mobile notification records.
- `notification_preferences`: per-user channel and event settings.
- `comment_subscriptions`: automatic subscriptions on comment, mention, or
  Claude question.
- `clean_results`: state, title, body, confidence, source experiment/run,
  approved/shared/archive fields, share token.
- `clean_result_versions`: revision history from AI/user comment loops.
- `workflow_events`: durable state-machine events not tied only to a Claude
  run.
- `approval_requests`: plan approval, queue approval, promotion approval.
- `run_artifacts`: W&B, HF, eval JSON, figures, logs, metrics, and
  verification status.
- `pod_lifecycle`: RunPod pod id, status, GPU spec, account, retries,
  stopped/terminated timestamps.
- `idea_sessions`: persistent ideation workspaces.
- `idea_cards`: generated or human-authored ideas with source links and
  promotion state.
- `edge_suggestions`: reviewed links between projects, beliefs, results, and
  literature.
- Optional ranking metadata for literature relevance, either as a new table or
  fields around `lit_inbox`.

Preserve existing `experiments`, `runs`, `agent_runs`, `comments`,
`audit_events`, `daily_log_entries`, `lit_items`, `lit_sources`, `lit_inbox`,
`share_grants`, and `push_devices` where practical.

## Web App Direction

Today is the cockpit. It should answer immediately:

- What experiments are running and in what state?
- What did the owner do yesterday?
- What are the next steps?
- What literature is relevant to recent results?
- What clean-result drafts need review?
- What collaborator/Claude comment threads need attention?
- What weekly review state exists?

Add first-class surfaces for:

- experiment proposal/detail;
- approval queue;
- run status and artifact verification;
- clean-result draft/revision/approval/share;
- weekly review draft/edit/share/comment;
- collaborator comments and notification settings;
- ideation sessions;
- literature read-next and paper Q&A.

Use utilitarian, calm UI. Avoid making another place to maintain. System/action
trail entries should be visible but collapsed/separated from cleaned research
notes.

## Mobile Direction

Expo should support the same core workflow on the move:

- Today status;
- approval inbox;
- experiment/run detail;
- push deep links for plan-ready, run-finished, blocked, and comment replies;
- clean-result reading, commenting, and approval;
- weekly review notifications;
- read-next literature queue;
- lightweight ideation prompts.

## Agent Runner Direction

Port the workflow from `explore-persona-space`:

- proposal and clarification;
- adversarial planner;
- fact-checker;
- critic;
- consistency checker;
- revised plan;
- user approval;
- implementation/preflight;
- RunPod provision/resume/stop lifecycle;
- watchdog/stall detection;
- upload/artifact verification;
- interpretation and critique;
- clean-result draft;
- reviewer pass/fail;
- awaiting promotion;
- followup proposal.

RunPod direction should borrow from `explore-persona-space/scripts/pod_lifecycle.py`:

- live RunPod API state is authoritative for pod status/host/port;
- project metadata stores intent/TTL/notes;
- pods are workflow-scoped;
- stop preserves volume;
- terminate destroys volume and needs explicit approval;
- watchdogs move stalled runs to blocked and include evidence;
- retry cap is 3 attempts before blocked.

## Authentication, Accounts, And Notifications

Move from "single owner + opaque share links" to lightweight multi-user
accounts:

- owner account: full control;
- collaborator/mentor accounts: scoped access;
- public token links: read-only or explicitly scoped;
- login default: keep current owner password auth; add email magic links or
  invite links for collaborators.

Notification behavior:

- in-app notification for every user;
- email notification for collaborators/mentors by default;
- mobile push for registered Expo devices;
- auto-subscribe a user when they comment, ask Claude, or are mentioned;
- notify when Claude starts answering if useful, and always when Claude
  finishes answering;
- Claude answers post immediately but show clear attribution and source
  context.

Collaborator scope:

- can read scoped project/result/review context;
- can comment;
- can ask Claude in scoped context;
- can suggest edits and proposed experiments;
- cannot approve clean results, launches, broad context sharing, or public
  sharing.

## Weekly Review Direction

The current weekly digest is an early scaffold. The final weekly review
workflow should be:

1. Sunday default draft job, with manual trigger available.
2. Draft from approved clean results, draft results needing attention, running
   and blocked experiments, belief updates, decisions, key comments/questions,
   relevant literature, and last week's promised next steps.
3. Owner reviews/edits/approves.
4. Review becomes a shareable mentor/collaborator page.
5. Collaborators can comment and ask Claude.
6. Review comments/questions can become followups, clean-result revisions, or
   experiment proposals.
7. Nothing is sent automatically unless explicitly shared/sent.

## Literature Direction

The literature system should provide:

- daily inbox;
- reading queue;
- search;
- relevance ranking;
- summaries;
- paper Q&A;
- links to results, beliefs, and followup experiments.

Initial sources:

- arXiv;
- Semantic Scholar;
- OpenReview;
- X/Twitter;
- RSS/web;
- OpenAlex or similar metadata/search as useful.

Ranking should optimize for relevance to:

- recent results;
- active beliefs;
- possible followup experiments;
- threats/caveats to current claims;
- advisor/mentor review needs.

## Ideation Direction

Ideation is a first-class workspace, not another backlog.

Modes:

- `Prompt me`: Sagan asks one context-aware question at a time to help the
  owner generate ideas.
- `Brainstorm with me`: the owner answers and Sagan expands/refines.
- `Suggest ideas`: Sagan proposes ranked idea cards.
- `Red team`: Sagan asks adversarial questions about current claims.
- `Followup builder`: converts promising ideas into experiment proposals.

Context sources:

- clean results;
- draft clean results;
- failed or blocked runs;
- active beliefs;
- comments/questions;
- recent literature;
- unread high-rank papers.

Outputs:

- idea cards;
- proposed experiments;
- belief updates;
- literature search tasks;
- clean-result questions/comments;
- archived dead ends with rationale.

Prompt deck examples:

- What result most surprised you this week?
- What would falsify your favorite belief?
- What is the cheapest experiment that would update you?
- What assumption do all recent experiments share?
- What paper conflicts with this clean result?
- What variable has never been ablated?
- What if we reverse the setup?
- What would your mentor ask first?
- Which failed run is actually informative?
- Which clean result deserves replication?
- What would make this result not matter?
- What is the most annoying uncertainty still open?
- Which result changed your plans least, and why?
- Which recent paper would you most want to disprove?
- What would a skeptical collaborator ask before trusting this claim?

## Deployment And Ops Direction

- Runner remains systemd-managed on the VM.
- Web remains Vercel-deployed.
- Mobile remains Expo/EAS.
- The currently configured `.env` database is an approved disposable/dev QA
  target for this rescue session. Load `.env` when needed, and run migrations
  plus mutating QA against that DB.
- Important production DB migrations require backup/export plus explicit
  approval. The current `.env` DB is not being treated as important production
  data because the user explicitly said it contains nothing important.
- No deploy/push/production migration is part of this planning session.
- Add operational dashboards inside Sagan for runner health, queued jobs,
  blocked runs, recent failures, and notification delivery state.

## Milestones

### Milestone 0: Baseline And Safety

Purpose: document exact repo state and data risks before edits.

User-visible outcome: none, except a trustworthy progress baseline.

Files/subsystems likely touched:

- This plan file only.
- No application code.

DB/API/UI implications:

- None.

Verification commands:

- `git status --short`
- `pnpm typecheck`
- inspect `.env.example`
- inspect migration state

Manual QA:

- None.

Risks:

- Confusing user dirty work with agent work.
- Applying implementation edits before baseline is clear.

Rollback notes:

- No code changes.

Acceptance criteria:

- Dirty work documented.
- Baseline checks recorded.
- No destructive command run.

### Milestone 1: Accounts, Access, And Notifications

Purpose: make collaborators real users so comments and Claude answers can be
attributed and notified.

User-visible outcome:

- Mentor/collaborator can log in or accept an invite.
- Mentor can comment on a shared result/review.
- Claude replies immediately and visibly as Claude.
- Mentor gets email when Claude answers.

Files/subsystems likely touched:

- `packages/db/src/schema/index.ts`
- `packages/auth`
- `packages/api`
- `apps/web/app/api/auth/*`
- `apps/web/app/api/comments/*`
- web share/collaborator routes
- runner notification/email job

DB/API/UI implications:

- Add memberships/access scope.
- Add notification tables.
- Add comment subscriptions.
- Add email delivery abstraction.
- Keep opaque share links for read-only public sharing.

Verification commands:

- `pnpm --filter @sagan/db typecheck`
- `pnpm --filter @sagan/auth typecheck` if package script exists, otherwise
  root `pnpm typecheck`
- `pnpm --filter @sagan/web typecheck`
- `pnpm --filter @sagan/web build`

Manual QA steps:

- Create collaborator/mentor access.
- Log in as collaborator.
- Comment on a shared clean result or weekly review.
- Ask Claude from that comment.
- Confirm Claude answer posts with attribution.
- Confirm email notification is sent or logged through configured dev adapter.
- Confirm collaborator cannot approve clean result or launch experiment.

Risks:

- Over-sharing private context.
- Email provider setup delays.
- Anonymous share links conflicting with account identity.

Rollback notes:

- Revoke membership/share token.
- Disable email send adapter.
- Preserve comments and notifications as data.

Acceptance criteria:

- Collaborator identity exists.
- Scoped comments work.
- Claude answer attribution is obvious.
- Email notification path works.
- Access checks prevent collaborator-only users from owner-only actions.

### Milestone 2: Workflow State Spine

Purpose: make Sagan own the experiment lifecycle currently represented by
GitHub issues and markers.

User-visible outcome:

- User can create/propose an experiment in Sagan.
- The experiment has a canonical state and event timeline.
- The approval queue can show proposed/planning/plan-pending/approved/running
  states.

Files/subsystems likely touched:

- `packages/db/src/schema/index.ts`
- `packages/agent-protocol/src/index.ts`
- `packages/api/src/schemas/index.ts`
- `apps/web/app/api/experiments/*`
- `apps/web/app/(app)/agent/*`
- new or existing experiment UI pages
- `services/runner/src/queue.ts`

DB/API/UI implications:

- Add workflow events and approval request structures.
- Evolve experiment statuses to match product lifecycle.
- Preserve current `experiments`/`runs` where possible.

Verification commands:

- `pnpm --filter @sagan/db db:generate`
- review generated SQL
- migrate only a dev clone unless production approval is explicitly granted
- `pnpm typecheck`

Manual QA steps:

- Create experiment proposal.
- See state timeline.
- Move to plan-pending.
- Approve/reject.
- Confirm daily/audit trail entries are separated from clean research notes.

Risks:

- Enum migration friction.
- Existing dirty schema/migration work.
- State duplication between `agent_runs`, `experiments`, and future workflow
  tables.

Rollback notes:

- Keep old tables untouched.
- Roll back dev migration only.
- Do not production-migrate without backup and approval.

Acceptance criteria:

- One experiment can move from idea to plan-pending with durable events.
- User can tell whose turn it is.
- No historical research data is lost.

### Milestone 3: Adversarial Plan Approval

Purpose: port the old planning workflow into Sagan while keeping Claude as the
sole plan drafter/reviser and using bounded, merged Claude+Codex critique loops
before owner approval.

User-visible outcome:

- Approval screen shows experiment, goal, hypothesis, prediction, kill
  criterion, compute/hardware, artifacts, verification, risks, and likely clean
  result shape.
- Owner can approve from web or mobile.

Files/subsystems likely touched:

- `services/runner/src/session.ts`
- runner prompt/templates
- `apps/web/app/(app)/agent/[id]/*`
- mobile agent/run detail screens
- `packages/agent-protocol`

DB/API/UI implications:

- Plan payloads should become structured enough to render safely, while
  preserving markdown for readability.
- Approval requests should record approver, timestamp, notes, and plan version.

Verification commands:

- `pnpm --filter @sagan/runner typecheck`
- `pnpm --filter @sagan/web build`
- `pnpm --filter @sagan/mobile typecheck`

Manual QA steps:

- Request an experiment plan.
- Verify adversarial plan sections exist.
- Approve from web.
- Approve from mobile.
- Reject with note and confirm runner records it.

Risks:

- Plans become too verbose.
- Plans omit essential experiment details.
- Agent runs may use too broad permissions.

Rollback notes:

- Fall back to current `agent_runs.plan_md` approval flow.

Acceptance criteria:

- User can approve confidently without terminal context.
- Approved plan has enough detail for RunPod launch and result verification.

### Milestone 4: RunPod Lifecycle

Purpose: replace terminal RunPod workflow with Sagan-controlled lifecycle.

User-visible outcome:

- Approved plan launches a RunPod run.
- Sagan shows pod id, GPU spec, status, logs/artifacts, retries, and blocked
  evidence.
- No terminal is required for launch/watch.

Files/subsystems likely touched:

- `services/runner/src/tools/runpod.ts`
- `services/runner/src/dispatcher.ts`
- new runner watcher module
- `services/runner/src/index.ts`
- `packages/db`
- `apps/web/app/api/runs/*`
- experiment/run detail UI
- mobile run detail

DB/API/UI implications:

- Add pod lifecycle rows.
- Add run artifact rows.
- Store retry count, last heartbeat, blocked reason, and wakeup events.
- Model stop/resume/terminate separately. Terminate needs explicit approval.

Verification commands:

- `pnpm --filter @sagan/runner typecheck`
- mocked RunPod smoke tests or dry-run path
- `pnpm --filter @sagan/web build`

Manual QA steps:

- Approve a debug/small run.
- Confirm Sagan launches pod.
- Confirm status updates.
- Simulate/observe failure and retry behavior.
- Confirm blocked summary after repeated failure.
- Confirm pod stop preserves volume.

Risks:

- Cost.
- RunPod API/SSH drift.
- Missing credentials.
- Stalled pods.

Rollback notes:

- Stop pod and preserve volume/artifacts.
- Mark workflow blocked.
- Do not terminate volume without explicit approval.

Acceptance criteria:

- One approved RunPod run can be launched/watched from Sagan.
- User receives useful status without terminal.
- Stalls/failures do not disappear silently.

### Milestone 5: Artifact Verification And Clean Results

Purpose: produce mentor-grade results only from verified evidence.

User-visible outcome:

- Sagan verifies artifacts before interpretation.
- AI drafts a clean result.
- User comments/questions.
- Claude answers and revises.
- User approves/shares/archives.

Files/subsystems likely touched:

- `packages/db`
- clean-result web pages/routes
- comments APIs/UI
- share grants/token pages
- mobile clean-result detail
- runner interpretation/reviewer jobs
- possible verifier port from `explore-persona-space/scripts/verify_clean_result.py`

DB/API/UI implications:

- Add clean-result state/versioning.
- Link clean results to experiments/runs/beliefs/projects/literature.
- Add artifact verification state.
- Opaque share tokens for shared clean results.

Verification commands:

- `pnpm typecheck`
- `pnpm --filter @sagan/web build`
- `pnpm --filter @sagan/mobile typecheck`
- clean-result verifier or equivalent structural check

Manual QA steps:

- Complete or simulate run artifacts.
- Draft clean result.
- Ask a question as owner.
- Ask a question as collaborator.
- Confirm Claude answer posts clearly as Claude.
- Confirm result can be revised.
- Approve.
- Open tokenized shared page.

Risks:

- Generic summaries instead of real research communication.
- Missing artifacts.
- Confusing draft vs approved vs shared states.

Rollback notes:

- Preserve every version.
- Revert to previous clean-result version.
- Keep unverified result as draft/blocked, not approved.

Acceptance criteria:

- Clean result follows the `explore-persona-space` style: claim, evidence,
  caveats, confidence, reproducibility, figures, and mentor-readable prose.
- Draft and approved states are visually distinct.

### Milestone 6: Today, Weekly Reviews, And Mobile

Purpose: make daily and weekly use coherent from web and phone.

User-visible outcome:

- Today answers the user's four key questions.
- Sunday weekly review drafts automatically.
- Manual weekly review kickoff exists.
- Mobile shows approvals, status, comments, and review notifications.

Files/subsystems likely touched:

- `apps/web/app/(app)/today/*`
- `apps/web/app/(app)/digests/*` or new weekly-review routes
- `services/runner/src/jobs/weekly-digest.ts`
- mobile Today/Agent/You screens
- push/email notification paths

DB/API/UI implications:

- Weekly review becomes a review workspace, not only markdown.
- Reviews link to clean results, decisions, blockers, next priorities,
  important comments, and literature.
- Action trail remains collapsed/separated from cleaned research log.

Verification commands:

- `pnpm --filter @sagan/web build`
- `pnpm --filter @sagan/mobile typecheck`
- push/email smoke route or dev adapter check

Manual QA steps:

- Open Today desktop and phone.
- Confirm running experiments/statuses are visible.
- Confirm yesterday and next steps are clear.
- Run manual weekly review draft.
- Confirm Sunday cron behavior is still configured.
- Comment on review as collaborator.
- Ask Claude in review context.

Risks:

- Too much noise in Today.
- Weekly review duplicates clean results instead of summarizing them.
- Mobile deep links fail silently.

Rollback notes:

- Keep weekly review as draft.
- Disable cron while preserving manual trigger.

Acceptance criteria:

- Today is useful as the first screen.
- Weekly review is an editable/shareable review workspace.
- Mobile can handle the approval/status/comment loop.

### Milestone 7: Literature Intelligence

Purpose: tell the owner what to read next.

User-visible outcome:

- Library has daily inbox, read-next ranking, summaries, paper Q&A, and reasons
  tied to recent results/beliefs/followups.

Files/subsystems likely touched:

- `services/runner/src/jobs/lit-review.ts`
- lit source schemas
- `apps/web/app/(app)/library/*`
- paper detail/Q&A routes
- runner jobs for ranking and summaries

DB/API/UI implications:

- Extend sources beyond current arXiv scaffold.
- Store source/relevance/ranking reasons.
- Link papers to beliefs, results, experiments, and threats/caveats.

Verification commands:

- mocked source fetch tests where added
- `pnpm --filter @sagan/runner typecheck`
- `pnpm --filter @sagan/web build`

Manual QA steps:

- Add or enable source.
- Run lit review job.
- Open read-next queue.
- Confirm reasons mention recent results/beliefs.
- Ask a question about a paper and save answer.
- Promote paper to ideation or experiment context.

Risks:

- X/Twitter API limits.
- Noisy ranking.
- Rate limits.
- Expensive summarization.

Rollback notes:

- Disable a source without deleting items.
- Fall back to manual add/read queue.

Acceptance criteria:

- "Read next" is useful and explained.
- At least one threat/caveat paper can be surfaced for a recent clean result.

### Milestone 8: Ideation Workspace

Purpose: help the owner generate ideas and let Sagan propose ideas from all
results, literature, and beliefs.

User-visible outcome:

- Owner starts an ideation session from a result, belief, paper, or project.
- Sagan prompts with useful questions.
- Sagan proposes idea cards.
- Owner can promote an idea to experiment proposal, belief update, literature
  task, or clean-result question.

Files/subsystems likely touched:

- new ideation web routes/components
- `packages/db` idea tables
- `packages/api` idea schemas
- runner ideation prompts/jobs
- links from clean result, belief, paper, project, Today

DB/API/UI implications:

- Persistent sessions.
- Idea cards with source links, author kind, state, and promotion target.
- Canonical record only changes when an idea is promoted.

Verification commands:

- `pnpm typecheck`
- `pnpm --filter @sagan/web build`

Manual QA steps:

- Start an ideation session from a clean result.
- Use `Prompt me` mode.
- Answer prompts.
- Generate idea cards.
- Promote one idea to experiment proposal.
- Confirm unpromoted rough notes do not pollute Today/clean log.

Risks:

- Becomes another backlog to maintain.
- AI suggestions lack diversity.
- Prompts become generic.

Rollback notes:

- Keep sessions archived and do not promote cards.
- Hide ideation from primary nav until useful.

Acceptance criteria:

- Ideation reduces cognitive load.
- At least one useful proposed experiment is generated from results +
  literature + beliefs.

### Milestone 9: Collaboration And Advisor Sharing

Purpose: make mentor/collaborator review loops native and safe.

User-visible outcome:

- Mentor/collaborator can read scoped context, comment, ask Claude, receive
  notifications, and propose edits/experiments.

Files/subsystems likely touched:

- memberships/access checks
- shared review/result routes
- comments/notifications
- collaborator settings UI

DB/API/UI implications:

- Scoped context selection.
- Subscription management.
- Read/comment/ask/propose permissions.

Verification commands:

- `pnpm typecheck`
- `pnpm --filter @sagan/web build`

Manual QA steps:

- Share weekly review with mentor.
- Mentor comments.
- Claude answers immediately.
- Mentor receives email.
- Mentor proposes experiment.
- Owner sees it as Claude/collaborator-proposed and can approve/defer/reject.

Risks:

- Context leakage.
- Confusing collaborator proposals with owner-approved plans.

Rollback notes:

- Revoke access.
- Disable collaborator Claude Q&A at route/API level.

Acceptance criteria:

- Collaborators can participate without terminal or GitHub access.
- Owner remains approval authority.

### Milestone 10: Sagan Self-Improvement And Hardening

Purpose: let Sagan improve itself safely and become trustworthy.

User-visible outcome:

- Owner can request Sagan product/code improvements from the dashboard.
- Agent plans/applies/QA's with gates.
- Health dashboards show runner/jobs/notifications.
- Production migration/deploy process is documented and safe.

Files/subsystems likely touched:

- runner permissions/session options
- plan/apply/QA routes
- codex/Claude review UI
- health/admin pages
- tests
- ops docs/systemd notes

DB/API/UI implications:

- Code-change run states.
- Changed files and verification summary.
- Preview/deploy gate.

Verification commands:

- `pnpm typecheck`
- `pnpm build`
- focused tests as added
- migration dry-run
- runner smoke

Manual QA steps:

- Request a small Sagan change.
- Approve plan.
- Inspect diff.
- Run checks.
- Confirm no push/deploy unless approved.
- Complete one live experiment-to-clean-result workflow.

Risks:

- Uncontrolled edits/deploys.
- Poor rollback boundaries.
- Agent modifies user dirty work.

Rollback notes:

- Revert only agent-owned commits.
- Never reset hard or checkout over user work.
- Use Vercel rollback and DB backup process when production is involved.

Acceptance criteria:

- The one-month workflow is usable without terminal.
- Checks and rollback paths are credible.
- User can trust the system as research infrastructure.

## Cross-Cutting Risks

- Dirty Sagan and dirty `explore-persona-space` worktrees.
- DB schema drift between migrations and Neon.
- RunPod lifecycle cost and stalled pods.
- Agent overreach through broad permissions.
- Public sharing leaks.
- Literature ranking noise.
- Clean-result quality regression.
- No conventional test suite yet.
- Mobile push/deep links can fail silently.
- Notification delivery can fail without visible state.

## Verification Matrix

- Baseline: `git status --short`, `pnpm typecheck`.
- Web: `pnpm --filter @sagan/web typecheck`, `pnpm --filter @sagan/web build`.
- Runner: `pnpm --filter @sagan/runner typecheck`, runner smoke.
- Mobile: `pnpm --filter @sagan/mobile typecheck`.
- DB: `pnpm --filter @sagan/db db:generate`, review SQL, migrate dev clone
  first.
- Full repo: `pnpm typecheck`, `pnpm build` before production-affecting
  changes.
- Manual QA: approval, RunPod, blocked state, clean result, collaborator
  comment, Claude answer notification, weekly review, ideation promotion.

## Definition Of Done

Sagan is done when the owner can:

- propose an experiment in Sagan;
- approve a complete plan from web or mobile;
- let Sagan launch/watch RunPod;
- receive notification when results need review;
- review AI interpretation and clean-result draft;
- comment, ask questions, and get revised result text;
- approve/share the clean result;
- handle collaborator comments and Claude answers;
- review weekly progress;
- rank/read literature;
- ideate next work;
- maintain the workflow from web/mobile without terminal use.

## Milestone 0 Baseline Record

Captured 2026-05-10 UTC before any rescue execution edits other than this log
update.

Commands run:

- `git status --short`: dirty worktree. Modified tracked work spans README,
  web routes/UI/API, mobile screens, agent protocol/API schemas, DB schema and
  Drizzle journal, runner jobs/dispatcher/session/queue, package manifests, and
  `pnpm-lock.yaml`. Untracked paths include new web API/UI helpers, mentor
  daily routes, `docs/`, `packages/db/drizzle/0003_workflow_audit.sql`,
  `packages/db/drizzle/meta/0003_snapshot.json`, and runner trail/job-run
  helpers.
- `git diff --stat`: 55 tracked files changed, 4269 insertions and 404
  deletions.
- `pnpm typecheck`: passed. Turbo reported 8 successful packages and 8 cached
  tasks: `@sagan/agent-protocol`, `@sagan/api`, `@sagan/auth`, `@sagan/db`,
  `@sagan/mobile`, `@sagan/runner`, `@sagan/ui`, and `@sagan/web`.
- `.env.example` inspection: placeholder credentials only; documents Neon
  pooled/direct URLs, owner login seed values, Anthropic/OpenAI, RunPod, W&B,
  Hugging Face, Twitter, Semantic Scholar, and legacy GitHub import variables.
  No secrets were rotated or changed.
- Migration state inspection: `packages/db/drizzle` contains `0000`, `0001`,
  `0002`, and `0003_workflow_audit` SQL files. Git tracks migrations through
  `0002`; `0003_workflow_audit.sql` and `meta/0003_snapshot.json` are
  untracked, while `meta/_journal.json` is modified and includes the `0003`
  entry. `packages/db/drizzle.config.ts` requires `DATABASE_URL_DIRECT` or
  `DATABASE_URL` for Drizzle commands.

Baseline risks:

- The repo has substantial pre-existing dirty work across app, runner, DB,
  and lockfile surfaces. Preserve it and inspect touched files before edits.
- DB schema and migration state may be ahead of tracked migrations because the
  Drizzle journal references untracked `0003_workflow_audit` artifacts.
- Production DB state was not inspected and no migration was run.
- The typecheck pass was fully cached; use package-specific checks/builds after
  code changes.
- No destructive commands were run: no secret rotation, data deletion,
  production migration, deploy, push, or RunPod volume action.

## Milestone 1 Execution Record

Implementation pass captured 2026-05-10 UTC.

Implemented locally:

- Added DB-backed user roles, scoped `entity_memberships`, collaborator/mentor
  invite tokens, notification preferences, comment subscriptions, and
  notification records.
- Added `daily_log_entry` and `weekly_digest` entity kinds so comments and
  notifications can attach to daily clean-result entries and weekly reviews.
- Added owner-only gates around agent-run dispatch, raw run/event reads, Codex
  review prompts, and approve/reject actions.
- Added scoped comment access: owners can read/comment everywhere; members can
  read scoped entities; collaborator/mentor memberships can comment and ask
  Claude in scoped context.
- Added invite/accept APIs at `/api/collaborators/invite` and
  `/api/collaborators/accept`.
- Added in-app notification APIs at `/api/notifications` and
  `/api/notifications/preferences`.
- Added comment subscription, email-mention, Claude-started, and
  Claude-finished notification writes. The first email adapter is an explicit
  dev/log adapter: notification rows record `email_status = logged` and emit
  `[dev-email]` logs instead of contacting a provider.
- Generated migration `packages/db/drizzle/0004_milky_edwin_jarvis.sql`.

Checks run:

- `pnpm --filter @sagan/db typecheck`: passed.
- `pnpm --filter @sagan/auth typecheck`: passed.
- `pnpm --filter @sagan/runner typecheck`: initially failed because runner
  trail types did not include the new entity kinds; passed after updating the
  shared type surface.
- `pnpm --filter @sagan/web typecheck`: initially failed because the generic
  entity page assumed every entity kind was editable; passed after rendering
  daily log entries and weekly reviews read-only.
- `DATABASE_URL=postgresql://user:pass@localhost:5432/sagan pnpm --filter
  @sagan/db db:generate`: passed and generated migration `0004`.
- `bash -lc 'set -a; source .env; set +a; pnpm --filter @sagan/db
  db:migrate'`: passed against the user-approved disposable `.env` DB.
- `pnpm typecheck`: passed, 8 successful packages. Re-run after QA fixes also
  passed.
- `pnpm --filter @sagan/web build`: passed. Re-run after QA fixes also passed.

Manual QA:

- Loaded `.env` for local commands. User explicitly approved running migrations
  and mutating QA against the configured database because it has no important
  data.
- Owner login through `/api/auth/login`: HTTP 200, role `owner`.
- Created weekly-review fixture
  `f37a6a4e-0483-4913-bada-2ea5ab5e8975`.
- Created mentor invite through `/api/collaborators/invite`: HTTP 200.
- Initial invite acceptance QA found a real blocker: the auth proxy redirected
  `/api/collaborators/accept` to `/login`. Fixed by adding
  `/api/collaborators/accept` to public proxy paths.
- Accepted invite through `/api/collaborators/accept`: HTTP 200, role
  `mentor`, membership role `mentor`.
- Mentor scoped comment read on the shared weekly review: HTTP 200.
- Mentor unscoped comment read on another weekly review: HTTP 403.
- Mentor `@claude` comment on the scoped weekly review: HTTP 200, queued QA run
  `996117a6-da68-48e9-9c9b-dece873f9f39`, comment subscription created, and
  `claude_started` notification row created.
- Mentor attempt to launch an agent run through `/api/agent-runs`: HTTP 403.
- Mentor attempt to approve an awaiting-approval run: HTTP 403.
- Live runner completed a QA comment run. A background runner race exposed a
  missing idempotency path for `claude_finished` notifications when a Claude
  reply already exists; fixed by making `notifyClaudeFinished` idempotent and
  notifying even when `maybePostCommentReply` sees an existing Claude reply.
- Controlled runner QA run `6bd6de39-9831-4d5e-b8f0-40e030408e02` completed,
  posted a child comment with `author_kind = claude`, and wrote a
  `claude_finished` notification for the mentor with `email_status = logged`
  and `emailed_at` set. Dev adapter emitted `[dev-email]`.

2026-05-10 update:

- User clarified that `.env` can be loaded for local commands.
- User explicitly approved running migrations and mutating QA against the
  currently configured `.env` database, and stated that this database does not
  contain important data.
- Treat that configured database as an approved disposable/dev QA target for
  rescue work. This does not change the general rule that genuinely important
  production research data needs backup/export and explicit approval before
  destructive production operations.

## Milestone 2 Execution Record

Implementation pass captured 2026-05-10 UTC.

Implemented locally:

- Added `workflow_events` and `approval_requests` tables with migration
  `packages/db/drizzle/0005_sweet_redwing.sql`.
- Extended experiment statuses with `proposed`, `plan_pending`, `approved`,
  `verifying`, `interpreting`, `reviewing`, `awaiting_promotion`, `shared`,
  and `blocked` while preserving legacy states.
- Added workflow helpers for experiment turn labels, durable state events, and
  idempotent experiment-plan approval requests.
- Added `/api/experiments` for owner-only experiment proposal creation and
  listing.
- Extended `/api/experiments/[id]` to return experiment detail, workflow
  events, approval requests, and owner-only state transitions.
- Added `/experiments` as the approval queue/workflow surface, with proposal
  creation, active state list, pending requests, timeline, and turn labels.
- Added Experiments to the app navigation.

Checks run:

- `pnpm --filter @sagan/db typecheck`: passed.
- `pnpm --filter @sagan/api typecheck`: passed.
- `pnpm --filter @sagan/web typecheck`: initially failed on an unescaped JSX
  arrow in the timeline; passed after fix.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:generate`: passed
  and generated migration `0005_sweet_redwing`.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:migrate`: passed
  against the approved disposable `.env` DB.
- `pnpm typecheck`: passed, 8 successful packages.
- `pnpm --filter @sagan/web build`: passed and included `/experiments`,
  `/api/experiments`, and `/api/experiments/[id]`.

Manual QA:

- Owner login through `/api/auth/login`: HTTP 200.
- Created experiment proposal through `/api/experiments`: HTTP 200, status
  `proposed`, turn label present.
- Verified durable `workflow_events` row: `event_type = created`,
  `to_status = proposed`.
- Patched experiment to `plan_pending`: HTTP 200.
- Verified experiment detail returned a pending `experiment_plan`
  `approval_requests` row and a `state_changed` workflow event from
  `proposed` to `plan_pending`.
- Patched experiment to `approved`: HTTP 200.
- Verified approval request resolved with `status = approved` and
  `resolved_by` set.
- Verified workflow event exists with `to_status = approved`.
- Verified `/api/experiments?status=approved` includes the QA experiment.
- Verified `/experiments` renders with HTTP 200 and includes the approval queue.
- QA experiment id:
  `cc5873fd-89fa-4eef-9ac3-0c6fb659c5ca`.

## Milestone 3 Execution Record

Implementation pass captured 2026-05-10 UTC.

Implemented locally:

- Added structured `plan_json` storage to `agent_runs` with migration
  `packages/db/drizzle/0006_many_proemial_gods.sql`.
- Extended the agent protocol plan schema with structured plan fields:
  goal, hypothesis, prediction, kill criterion, compute/hardware, artifacts,
  verification, risks, likely clean-result shape, and section bodies.
- Updated the runner experiment planning prompt to require Claude-authored
  drafts, paired Claude+Codex critique loops with merged findings, a
  scope-preserving revision rule, and exact final markdown headings for
  approval rendering.
- Added `parseStructuredPlan` and persisted structured sections when a plan
  enters `awaiting_approval`.
- Wired experiment-scoped planning runs to move experiments to `plan_pending`,
  store structured plan JSON on the experiment, append workflow events, and
  create pending experiment-plan approval requests.
- Rendered structured plan sections in the web agent run page and mobile run
  detail while preserving markdown.
- Updated approve/reject routes to accept optional notes and update
  experiment workflow for any agent run scoped to an experiment, not only
  `kind = experiment`.
- Fixed bearer/mobile API access through the web proxy. Protected API routes
  with `Authorization: Bearer ...` now reach route-level auth instead of being
  redirected to `/login` for lacking the web session cookie.

Checks run:

- `pnpm --filter @sagan/runner typecheck`: passed.
- `pnpm --filter @sagan/db typecheck`: passed.
- `pnpm --filter @sagan/mobile typecheck`: passed before QA and again after
  the bearer-proxy fix.
- `pnpm --filter @sagan/web typecheck`: initially failed because the web agent
  page destructured `initialPlanJson` before it was defined; passed after fix.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:generate`: passed
  and generated migration `0006_many_proemial_gods`.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:migrate`: passed
  against the approved disposable `.env` DB.
- `pnpm typecheck`: passed, 8 successful packages.
- `pnpm --filter @sagan/web build`: passed and included the updated agent,
  experiment, and approval routes.

Manual QA:

- Created real experiment-scoped planning fixture
  `b64a3dc9-10e8-4062-88e5-556fc33237a1`.
- Ran Claude through the runner for experiment plan run
  `492474e1-25df-493a-8f10-38c246973aa6`. Claude produced a 10107-character
  plan and the run entered `awaiting_approval`.
- Initial structured-plan query found 12 section headings but empty required
  field bodies because the first parser was too regex-fragile; fixed parser by
  line-scanning headings and backfilled the QA run/experiment plan JSON.
- Verified the plan run had `status = awaiting_approval`, non-empty
  `plan_md`, 12 parsed sections, and no missing required structured fields.
- Verified the experiment moved to `plan_pending` and stored `plan_json`.
- Verified a pending `experiment_plan` approval request linked to the agent
  run with requested state `plan_pending`, approved state `approved`, and
  rejected state `planning`.
- Verified workflow events for `planning -> plan_pending` and
  `approval_requested`.
- Ran approval/rejection QA with DB fixtures scoped to experiments:
  web approve run `73172489-71ad-4de8-b4bc-89b1612bee16`, bearer/mobile
  approve run `21f12c62-b9fa-4942-8c86-ac7a0936670d`, and bearer/mobile
  reject run `7f46b53b-2077-4e13-a4a9-f15c1bfaa8aa`.
- Initial bearer/mobile approve QA failed because the auth proxy redirected
  bearer-only protected API calls to `/login`; fixed `apps/web/proxy.ts`.
- Re-run approval QA passed: web approve returned HTTP 200, bearer/mobile
  approve returned HTTP 200, bearer/mobile reject returned HTTP 200, approvals
  recorded `approved_by` and `approved_at`, experiments moved to `approved`,
  rejection moved its experiment back to `planning`, and approval requests
  resolved with the expected notes.

## Milestone 4 Execution Record

Implementation pass captured 2026-05-11 UTC.

Implemented locally:

- Added migration `packages/db/drizzle/0007_rare_spitfire.sql`.
- Added `blocked` to `agent_run_status`.
- Added `pod_lifecycle` rows for RunPod pod id, account, name, GPU type/count,
  status, desired status, SSH endpoint, retry budget, blocked evidence,
  heartbeat/check timestamps, stop/terminate timestamps, and metadata.
- Added `run_artifacts` rows for pod/log/artifact handles linked to
  experiments, runs, agent runs, and pod lifecycle rows.
- Added per-spec `dryRun: true` support to the RunPod dispatch path so QA can
  exercise launch/watch/stop control flow without spending GPU money or
  contacting the real RunPod API.
- Updated approved experiment dispatch to create `runs`, `pod_lifecycle`, and
  `run_artifacts` rows, keep the agent run in `deploying`/`running` instead of
  marking it completed immediately, and update experiment workflow status.
- Added a runner pod lifecycle watcher that polls active pods, records
  RunPod status/SSH updates, advances agent runs/experiments to `running`,
  retries transient RunPod lookup failures, and moves exhausted failures to
  `blocked` with evidence.
- Added a runner stop action. Stop requests call RunPod stop, not terminate, so
  the volume is preserved.
- Added `/api/agent-runs/[id]/runpod/stop` for owner-triggered stop requests.
- Extended agent run detail API responses with lifecycle and artifact rows.
- Added RunPod lifecycle/artifact panels to web and mobile run detail screens,
  including pod id, GPU spec, status, SSH endpoint, retry count, errors, and a
  stop action.

Checks run:

- `pnpm --filter @sagan/runner typecheck`: passed.
- `pnpm --filter @sagan/db typecheck`: passed.
- `pnpm --filter @sagan/web typecheck`: passed.
- `pnpm --filter @sagan/mobile typecheck`: passed.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:generate`: passed
  and generated migration `0007_rare_spitfire`.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:migrate`: passed
  against the approved disposable `.env` DB.
- `pnpm typecheck`: passed, 8 successful packages.
- `pnpm --filter @sagan/web build`: passed and included
  `/api/agent-runs/[id]/runpod/stop`.

Manual QA:

- Dry-run dispatch/watch/stop QA created experiment
  `c3ededa3-1f24-4cba-9105-cc571e123c65` and agent run
  `24d422e0-1766-44b3-9ed6-310876f4d232`.
- Dispatch parsed a fenced `runpod-spec` with `dryRun: true`, created synthetic
  pod `dryrun-mp0fsrr7-ugyxdy`, created one `runs` row, one
  `pod_lifecycle` row, and one `run_artifacts` row.
- Watcher sweep advanced the agent run to `running`, set `runpod_status =
  running`, advanced the experiment to `running`, and recorded SSH endpoint
  `127.0.0.1:2222`.
- Stop action moved the lifecycle row to `stopped`, set `stopped_at`, moved the
  agent run to `cancelled`, moved the experiment to `cancelled`, and wrote a
  workflow event noting that the RunPod volume was preserved.
- API readback for run `24d422e0-1766-44b3-9ed6-310876f4d232` returned HTTP
  200 with `run.status = cancelled`, one stopped dry-run pod, and one
  `runpod_pod` artifact.
- API-level stop QA created experiment
  `afb98538-3ec9-4260-9738-6aa4e6f220b6` and agent run
  `1f4841ed-80d3-4d8c-add6-024ea75a8c2c`.
- `/api/agent-runs/1f4841ed-80d3-4d8c-add6-024ea75a8c2c/runpod/stop`
  returned HTTP 200 with `podCount = 1`, moved the pod to `stop_requested`,
  and the runner stop helper then moved it to `stopped` with the agent run
  `cancelled`.
- QA found and fixed one stop-route bug: the route marked pods
  `stop_requested` before notifying the runner, while the runner helper only
  selected `deploying`, `running`, and `retrying`. The helper now also selects
  `stop_requested`.
- No real RunPod pod was launched during QA; the milestone was verified through
  the explicit dry-run path.

## Milestone 5 Execution Record

Implementation pass captured 2026-05-11 UTC.

Implemented locally:

- Added migration `packages/db/drizzle/0008_high_karma.sql`.
- Added `clean_result` as a first-class `entity_kind`.
- Added `clean_results` and `clean_result_versions` tables with draft,
  reviewing, approved, shared, archived, and blocked states.
- Added artifact-backed clean result creation at `/api/clean-results`. Draft
  creation requires artifact IDs and marks those `run_artifacts` as verified
  before the clean result is created.
- Added `/api/clean-results/[id]` for detail, revision/version creation, and
  approval. Approval requires `artifact_status = verified` and writes an
  approved clean-result entry into the daily log.
- Added `/api/clean-results/[id]/share` to create opaque share grants for
  approved clean results.
- Added public `/r/[token]` pages for shared clean results.
- Added owner web surfaces at `/clean-results` and `/clean-results/[id]` with
  artifact visibility, versions, comments, approval, and sharing actions.
- Added clean results to the app nav, entity loader, comments, daily-log entity
  links, search, and knowledge browse.
- Tightened runner `qa` prompts so Claude comment replies return only the
  direct comment text instead of instruction-like text.

Checks run:

- `pnpm --filter @sagan/db typecheck`: passed.
- `pnpm --filter @sagan/api typecheck`: passed.
- `pnpm --filter @sagan/agent-protocol typecheck`: passed.
- `pnpm --filter @sagan/web typecheck`: passed.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:generate`: passed
  and generated migration `0008_high_karma`.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:migrate`: passed
  against the approved disposable `.env` DB.
- `pnpm typecheck`: passed, 8 successful packages.
- `pnpm --filter @sagan/mobile typecheck`: passed.
- `pnpm --filter @sagan/web build`: passed and included `/clean-results`,
  `/clean-results/[id]`, `/api/clean-results`, `/api/clean-results/[id]`,
  `/api/clean-results/[id]/share`, and `/r/[token]`.

Manual QA:

- Clean-result QA used artifact
  `20ef3f72-e226-48e0-8c26-9fa97d4b1a1f`.
- Created clean result `a9564278-e8f3-4644-8857-bc35c942b031` through
  `/api/clean-results`: HTTP 200.
- Verified the artifact row moved to `status = verified` with `verified_at`
  set before clean-result draft creation.
- Approved the clean result through `/api/clean-results/[id]`: HTTP 200.
- Verified clean result status later reached `shared`, artifact status stayed
  `verified`, `approved_at` was set, `shared_at` was set, and
  `source_daily_log_entry_id` was set.
- Added an `@claude` comment on the clean result through `/api/comments`: HTTP
  200, comment kind `ask_claude`, and an agent run was linked.
- Revised the clean result through `/api/clean-results/[id]`: HTTP 200 and
  version count reached at least 2.
- Shared the approved clean result through `/api/clean-results/[id]/share`:
  HTTP 200, returned `/r/N24GMmX0sGMWXxXELx9IheAa9NyFaQlC`.
- Public GET on the share URL returned HTTP 200 and included the clean-result
  title.
- Initial clean-result `@claude` QA run
  `30a70aa4-6c99-4d2a-9959-0af6ac34b286` completed, but the reply text was
  instruction-like rather than a useful answer. Fixed the runner QA prompt.
- Controlled clean-result Q&A run
  `cc9bfcb1-463d-4e87-a5bb-0d057835cb9a` completed and posted Claude reply
  `72adcf1a-eead-4c9c-a73e-96f306c41c2c` with a concrete caveat answer.

## Milestone 6 Execution Record

Implementation pass captured 2026-05-11 UTC.

Implemented locally:

- Added `/api/today/summary` so web and mobile can fetch active experiments,
  active runs, pending approvals, yesterday counts, and latest weekly-review
  state from one authenticated endpoint.
- Updated the web Today page to surface running experiments, owner approvals,
  yesterday's log count, and weekly-review status as first-screen summary
  cards above the research log.
- Updated mobile Today to load `/api/today/summary` and show compact summary
  pills for experiments, approvals, yesterday, and weekly review.
- Added native comment threads to weekly digest detail pages.
- Tightened runner QA behavior for scoped comment answers:
  weekly digests, clean results, and experiments now inject scoped DB context
  into QA prompts, and obvious placeholder replies are rejected instead of
  posted as Claude comments.

Checks run:

- `pnpm --filter @sagan/web typecheck`: passed.
- `pnpm --filter @sagan/mobile typecheck`: passed.
- `pnpm --filter @sagan/runner typecheck`: passed after scoped QA context and
  placeholder-guard changes.
- `pnpm typecheck`: passed, 8 successful packages.
- `pnpm --filter @sagan/web build`: passed and included `/today`,
  `/api/today/summary`, `/digests/[id]`, and `/api/weekly-digest/run`.

Manual QA:

- Loaded `.env` and used the approved disposable DB for mutating QA.
- Created weekly digest fixture
  `0a354427-f145-4399-b475-39bfaf3d8d43`.
- `/api/today/summary` returned HTTP 200 with owner cookie auth.
- `/api/today/summary` returned HTTP 200 with owner bearer auth for mobile.
- `/today` returned HTTP 200 with owner cookie auth.
- `/api/weekly-digest/run` returned HTTP 200 and queued manual weekly digest
  job `57e671cd-dfc4-49a2-91a8-ddeb44ae1518`.
- Accepted a mentor invite scoped to the weekly digest; the accepted user has
  role `mentor` and scoped access to that review.
- Mentor comment on the weekly digest returned HTTP 200.
- Mentor `@claude` comment on the weekly digest returned HTTP 200, linked QA
  run `d6780fe7-3153-450c-8076-71092619c024`, and wrote a
  `claude_started` notification.
- The background runner completed that QA run, but because the running process
  had not been restarted after the M5 prompt fix, the reply was still
  instruction-like. This confirmed that operational runner restarts matter
  after prompt/session changes.
- Controlled patched weekly-digest Q&A run
  `2094b53b-e1c6-49e7-9a5d-ae1bfadb1b93` reproduced a placeholder reply
  (`<claude reply>`), showing the QA prompt lacked scoped digest context.
- Added scoped entity context and placeholder rejection in the runner, then
  reran controlled weekly-digest Q&A. Run
  `8140efd1-cc1a-485d-80b3-9f1884f1e261` completed and posted Claude reply
  `779153bb-5368-4da2-9685-bb33c8c89143` with a concrete answer grounded in
  the digest body.
- Verified `claude_finished` notifications for the successful weekly-digest QA
  run for both relevant users.

## Milestone 7 Execution Record

Implementation pass captured 2026-05-11 UTC.

Implemented locally:

- Added migration `packages/db/drizzle/0009_tearful_butterfly.sql`.
- Extended `lit_items` with stored `summary_md`, `relevance_reason_md`,
  `threat_reason_md`, and `last_ranked_at`.
- Extended the lit-review runner beyond the arXiv scaffold: enabled RSS
  sources, including inline XML config for deterministic QA, while preserving
  existing arXiv RSS polling.
- Added heuristic read-next ranking against recent clean results, beliefs, and
  experiments. Inbox reasons now explain matched research context and terms.
- Added threat/caveat detection for papers that match recent research context
  and discuss failures, limitations, caveats, bias, confounds, negative
  results, robustness, adversarial cases, evaluations, or benchmarks.
- Added stored extractive summaries for surfaced literature items.
- Added a literature intelligence panel on paper detail pages showing summary,
  read-next reason, threat/caveat reason, ranking date, and recent inbox
  appearances.
- Updated Library and Today's lit review pages to show scores, summaries, and
  ranking reasons.
- Added `lit_item` scoped DB context to runner QA prompts so paper Q&A comments
  can answer from the stored title, abstract, summary, relevance reason, and
  threat/caveat reason.

Checks run:

- `pnpm --filter @sagan/db typecheck`: passed.
- `pnpm --filter @sagan/runner typecheck`: passed.
- `pnpm --filter @sagan/web typecheck`: passed.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:generate`:
  passed and generated migration `0009_tearful_butterfly`.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:migrate`: passed
  against the approved disposable `.env` DB.
- `pnpm typecheck`: passed, 8 successful packages.
- `pnpm --filter @sagan/mobile typecheck`: passed.
- `pnpm --filter @sagan/web build`: passed and included `/library`,
  `/library/today`, `/e/[kind]/[id]`, `/api/lit-items`,
  `/api/lit-items/[id]`, and `/api/lit-review/run`.

Manual QA:

- Loaded `.env` and used the approved disposable DB for mutating QA.
- Created enabled inline RSS source
  `3bd76cdf-165e-43be-ac06-c0aa00a4abaa`.
- Temporarily disabled existing arXiv sources during the controlled direct
  runner QA, then restored them. Readback confirmed two enabled arXiv sources
  and one enabled RSS source.
- Direct `runLitReview()` completed with `sourcesChecked = 1`, `inserted = 1`,
  and `surfaced = 1`.
- Created lit item `56fb5e56-2c46-49cc-9ebc-fabb827f6215` from the RSS item
  "Artifact verification caveats for Sagan clean results."
- Created inbox row `d640ca6b-1fd8-4748-a568-a6771ece328e` with score `88`.
- Verified the read-next reason tied the item to clean result
  `a9564278-e8f3-4644-8857-bc35c942b031` / "M5 clean-result QA" and matched
  terms including clean, artifact, caveat, Sagan, create, and verifying.
- Verified `summary_md`, `relevance_reason_md`, `threat_reason_md`, and
  `last_ranked_at` were stored on the lit item.
- Verified threat/caveat reason: the paper was surfaced as a potential
  threat/caveat for the clean result because it discussed failure, caveat,
  negative controls, and benchmarks.
- Controlled paper Q&A run `8cd50b5b-54eb-4d01-90f0-bc04dd5fee2a` completed
  and posted Claude reply `cfd7f88d-9886-4463-9aa7-b134056c265a` answering
  the paper caveat question from the stored paper context.
- Promoted the paper into experiment context by creating `threat` edge
  `c8a3d19b-9df9-4fe2-aa96-33c4defaa2d6` from the lit item to experiment
  `afb98538-3ec9-4260-9738-6aa4e6f220b6`.

## Milestone 8 Execution Record

Implementation pass captured 2026-05-11 UTC.

Implemented locally:

- Added migration `packages/db/drizzle/0010_ambitious_ma_gnuci.sql`.
- Added persistent `idea_sessions` and `idea_cards` tables. Sessions store
  source kind/id, notes, status, prompt deck, creator, and archive state.
  Cards store author, state, source, promotion kind, and promoted record link.
- Added ideation APIs:
  `/api/ideation/sessions`,
  `/api/ideation/sessions/[id]`,
  `/api/ideation/sessions/[id]/cards`, and
  `/api/ideation/cards/[id]/promote`.
- Added deterministic prompt-deck and idea-card generation from a clean result,
  belief, paper, or project plus nearby beliefs, literature, and clean results.
- Added explicit promotion targets: experiment proposal, belief-update task,
  literature task, and clean-result question task.
- Promotion creates canonical records only after the user promotes a card.
  Session notes and draft cards remain in ideation tables and do not write to
  the daily log.
- Added `/ideation` and `/ideation/[id]` web surfaces with prompt mode, notes,
  generated cards, and promotion controls.
- Added "Start ideation" actions on generic source entity pages and the clean
  result detail page, and added Ideation to the app nav.

Checks run:

- `pnpm --filter @sagan/db typecheck`: passed.
- `pnpm --filter @sagan/web typecheck`: passed.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:generate`:
  passed and generated migration `0010_ambitious_ma_gnuci`.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:migrate`: passed
  against the approved disposable `.env` DB.
- `pnpm typecheck`: passed, 8 successful packages.
- `pnpm --filter @sagan/mobile typecheck`: passed.
- `pnpm --filter @sagan/web build`: passed and included `/ideation`,
  `/ideation/[id]`, `/api/ideation/sessions`,
  `/api/ideation/sessions/[id]`, `/api/ideation/sessions/[id]/cards`, and
  `/api/ideation/cards/[id]/promote`.

Manual QA:

- Loaded `.env` and used the approved disposable DB for mutating QA.
- Used the active local Next dev server on `http://localhost:3100` so API QA
  exercised current route code with bearer auth.
- Started an ideation session from clean result
  `a9564278-e8f3-4644-8857-bc35c942b031`.
- Created ideation session `61a9d9cd-44ec-4288-92cd-eff5bf5cc67c` titled
  "Ideate from M5 clean-result QA" with source kind `clean_result`, active
  status, and 8 prompt-deck prompts.
- Saved rough session notes through `/api/ideation/sessions/[id]`: HTTP 200.
- Generated 3 idea cards through `/api/ideation/sessions/[id]/cards`: HTTP
  200. Draft cards were:
  `b1b8a9a9-eb96-44ca-9b92-1862d138bfaa`,
  `e9dadb50-fccb-4606-89e6-906ed0e05075`, and
  `dff9f43a-96a3-4012-9498-6c85545c1022`.
- Verified daily-log count stayed at 41 after creating the session, saving
  notes, and generating cards, so rough ideation did not pollute Today or the
  clean research log.
- Promoted card `b1b8a9a9-eb96-44ca-9b92-1862d138bfaa` to an experiment
  proposal through `/api/ideation/cards/[id]/promote`: HTTP 200.
- Promotion created experiment `1bdbca33-ebd6-4248-8fe3-8f744795eacd`, marked
  the idea card `state = promoted`, and stored
  `promotion_kind = experiment`, `promoted_kind = experiment`, and the promoted
  experiment ID.
- Verified daily-log count increased from 41 to 42 only after promotion.

## Milestone 9 Execution Record

Implementation pass captured 2026-05-11 UTC.

Implemented locally:

- Tightened generic entity reads so `/api/entity/[kind]/[id]` now enforces
  scoped `requireEntityRead` instead of returning any entity to any logged-in
  user.
- Tightened generic entity pages so non-owners can view only scoped entities
  and cannot edit titles/bodies or start ideation from scoped review pages.
- Tightened weekly digest detail pages so scoped mentors/collaborators can read
  and comment, while only owners see the digest editor.
- Tightened clean-result detail pages so scoped readers can read/comment, while
  only owners see approval/share/ideation actions.
- Expanded `/api/experiments` create behavior: owners still have full create
  authority, while mentors/collaborators can propose experiments only when they
  include a source entity they can read.
- Collaborator/mentor proposals are forced to `status = proposed` even if the
  client submits a stronger status, store proposer/source metadata in
  `plan_json`, grant the proposer scoped membership on the new experiment, and
  notify owners.
- Owner-only experiment detail/update APIs remain the approval authority.

Checks run:

- `pnpm --filter @sagan/web typecheck`: passed after scoped access changes.
- `pnpm typecheck`: passed, 8 successful packages.
- `pnpm --filter @sagan/mobile typecheck`: passed.
- `pnpm --filter @sagan/web build`: passed and included the collaborator,
  comments, entity, experiment, digest, and clean-result routes touched by M9.

Manual QA:

- Loaded `.env` and used the approved disposable DB for mutating QA.
- Used the active local Next dev server on `http://localhost:3100` so API QA
  exercised current route code with bearer auth.
- Owner invited mentor `ff0f8910-dc6d-4043-b02d-1431626212f1` to weekly digest
  `0a354427-f145-4399-b475-39bfaf3d8d43`; invite accept returned role
  `mentor`.
- Mentor scoped entity read on the shared weekly digest returned HTTP 200.
- Mentor unscoped entity read on a different weekly digest returned HTTP 403.
- Mentor comment on the scoped weekly digest returned HTTP 200, comment
  `c15c231e-fae6-4c90-87ca-18c0b3636052`.
- Mentor `@claude` comment on the digest returned HTTP 200 and linked QA run
  `162c3878-bea9-4b84-8618-12a35f5d673a`.
- Controlled runner execution completed that run and posted Claude reply
  `93984bbb-e5e0-48f6-8733-87acdd061809`.
- Verified `claude_finished` notification for the mentor had
  `email_status = logged`; dev adapter emitted `[dev-email]`.
- Mentor proposed experiment `2cd47d67-1778-4def-a2ad-d88f14e1eb4c` from the
  scoped weekly digest through `/api/experiments`. The client submitted
  `status = approved`, but the API forced the initial status to `proposed`.
- Mentor attempt to update/approve that experiment through
  `/api/experiments/[id]` returned HTTP 403.
- Owner list `/api/experiments?status=proposed` included the collaborator
  proposal.
- Owner moved the proposal to `plan_pending`, then blocked it as the reject
  path; final status read back as `blocked`.
- Verified the mentor received scoped membership on the proposed experiment
  with role `mentor`.
- Verified owner notification `ef1579e4-a822-4b1c-a363-628bda38ad49` was
  created for the collaborator proposal.

## Milestone 10 Execution Record

Implementation pass captured 2026-05-11 UTC.

Implemented locally:

- Added owner-only health API `/api/admin/health`.
- Added owner-only `/admin/health` page and nav entry. The page surfaces agent
  run status counts, notification email-status counts, active runs, recent
  jobs, active experiments, and active RunPod lifecycle rows.
- Added shared `loadHealthSummary()` helper used by both API and page.
- Added ops documentation at `docs/ops/sagan-ops.md` covering disposable `.env`
  DB scope, important-production-data precautions, preflight checks, runner
  restart expectations, RunPod stop-before-terminate policy, deploy/rollback
  gates, and agent-owned change boundaries.
- Verified the existing dashboard agent path can dispatch a no-op
  self-improvement plan, capture the plan, prepare a Codex review prompt, and
  require owner approval without pushing, deploying, or recording changed files.

Checks run:

- `pnpm --filter @sagan/web typecheck`: passed after health route/page changes.
- `set -a; source .env; set +a; pnpm --filter @sagan/db db:generate`: passed
  with "No schema changes, nothing to migrate."
- `pnpm typecheck`: passed, 8 successful packages.
- `pnpm --filter @sagan/mobile typecheck`: passed.
- `pnpm --filter @sagan/runner typecheck`: passed.
- `pnpm --filter @sagan/web build`: passed and included `/admin/health` and
  `/api/admin/health`.
- `pnpm build`: passed. Turbo ran the web build successfully; the other
  packages have no build scripts.

Manual QA:

- Loaded `.env` and used the approved disposable DB for mutating QA.
- Used the active local Next dev server on `http://localhost:3100` so API QA
  exercised current route code with bearer auth.
- Owner GET `/api/admin/health` returned HTTP 200 with active run data.
- Mentor GET `/api/admin/health` returned HTTP 403.
- Dashboard-dispatched no-op self-improvement plan run
  `7e240263-8fe3-45c7-b7ed-9808dbb76120` through `/api/agent-runs`.
- Controlled runner execution captured a plan via `ExitPlanMode`, moved the
  run to `awaiting_approval`, and stored a 3,081-character plan.
- `/api/agent-runs/7e240263-8fe3-45c7-b7ed-9808dbb76120/codex-review`
  returned HTTP 200 and a 19,987-character Codex review prompt.
- `/api/agent-runs/7e240263-8fe3-45c7-b7ed-9808dbb76120/approve` returned
  HTTP 200 and moved the run to `approved`.
- Verified `changed_files_json = null` and `vercel_deployment_url = null` for
  the no-op plan run after approval, so no push/deploy/change artifact was
  recorded.
- Verified an `awaiting_approval` event was recorded and approval audit event
  `afc8f463-de2b-4096-94eb-fa22cd57591f` was written.
- A first M10 QA script attempt created stale plan run
  `2b0fa84b-4f3f-471e-85ca-172a17ce0ebd`; after confirming it was only a
  no-op plan, it was cancelled so it would not remain actionable.
- Completed an integrated experiment-to-clean-result workflow through Sagan's
  dry-run RunPod path:
  experiment `db9716df-d394-46a7-b945-878989f6da02`, approved experiment agent
  run `39abe69a-e0e1-4eab-b572-1b3cd05c9283`, dry-run pod
  `dryrun-mp0hwztw-t11hik`, source run
  `00c82613-9549-4957-bdd2-5313458aeed8`, and artifact
  `98b2c9d5-c2e3-42b9-af2d-d6c6c87fb3bf`.
- The dry-run watcher moved the pod to `running`; `/api/clean-results`
  verified the artifact and created clean result
  `8a3ba33b-f94b-4e3f-9cfe-9532210459ce`.
- Approved and shared that clean result. Public share URL
  `/r/6OgpxomduCVHX53n39hET5O6VdS5_DTo` returned HTTP 200.
- Stopped the dry-run pod after the clean result was shared; final pod status
  read back as `stopped`.

## Progress Log

- 2026-05-10: Sagan discovery completed.
- 2026-05-10: User interview completed.
- 2026-05-10: `explore-persona-space` workflow read completed.
- 2026-05-10: Auth, weekly review, notification, and ideation decisions added.
- 2026-05-10: Plan written to `docs/exec-plans/sagan-rescue-plan.md`.
- 2026-05-10: Milestone 0 baseline captured: dirty work documented,
  `.env.example` and Drizzle migration state inspected, and `pnpm typecheck`
  passed from cache.
- 2026-05-10: Milestone 1 implementation pass added scoped accounts,
  collaborator invites, notification records/preferences/subscriptions,
  owner-only agent gates, and a dev-email notification adapter. Initial
  automated checks passed.
- 2026-05-10: Milestone 1 DB-backed QA completed against the user-approved
  disposable `.env` DB. QA found and fixed invite-accept proxy access plus
  runner notification idempotency. Final `pnpm typecheck` and web build passed.
- 2026-05-10: Milestone 2 workflow spine implemented and QA'd: experiment
  proposal creation, durable workflow events, plan-pending approval request,
  approval resolution, and `/experiments` queue page.
- 2026-05-10: Milestone 3 adversarial plan approval implemented and QA'd:
  structured experiment plans, web/mobile plan rendering, experiment-linked
  approval requests, web approval, bearer/mobile approval, and bearer/mobile
  rejection all passed.
- 2026-05-11: Milestone 4 RunPod lifecycle implemented and QA'd through the
  dry-run RunPod path: approved experiment dispatch, watcher status updates,
  lifecycle/artifact rows, API readback, and stop-preserves-volume flow all
  passed.
- 2026-05-11: Milestone 5 artifact verification and clean results implemented
  and QA'd: verified-artifact draft creation, approval, revision versioning,
  comments/Claude Q&A, share-token creation, and public shared-page readback
  all passed.
- 2026-05-11: Milestone 6 Today, weekly review, and mobile pass completed:
  web/mobile Today summaries, weekly-review comments, manual weekly-review
  kickoff, scoped mentor review comments, and weekly-digest Claude Q&A all
  passed after adding scoped QA context and placeholder-output guards.
- 2026-05-11: Milestone 7 literature intelligence implemented and QA'd:
  RSS sources, stored summaries, read-next scoring, clean-result-linked
  threat/caveat reasons, paper Q&A, and paper-to-experiment promotion all
  passed against the approved disposable `.env` DB.
- 2026-05-11: Milestone 8 ideation workspace implemented and QA'd: persistent
  source-linked sessions, prompt decks, generated idea cards, explicit
  promotion targets, and experiment promotion passed; rough notes/cards stayed
  out of Today until promotion.
- 2026-05-11: Milestone 9 collaboration/advisor sharing implemented and QA'd:
  scoped mentor reads/comments, Claude email notification, collaborator
  experiment proposal, owner-only approval/update authority, and a scoped
  entity-read leak fix all passed.
- 2026-05-11: Milestone 10 hardening implemented and QA'd: owner health
  dashboard/API, ops safety notes, migration dry-run, no-op self-improvement
  plan dispatch, Codex review prompt generation, owner approval gate, and
  no-push/no-deploy verification all passed.

## Discoveries Log

- Sagan already has a strong skeleton but incomplete lifecycle.
- `explore-persona-space` contains the mature experiment/clean-result workflow.
- RunPod dispatch exists but watcher/completion/artifact lifecycle is incomplete.
- Current auth is insufficient for collaborator notifications.
- Current weekly digest is a scaffold, not the final review workflow.
- Clean-result style is highly specified and should become product behavior.
- Both Sagan and `explore-persona-space` have substantial dirty work.
- `pnpm typecheck` passed during discovery.
- Milestone 0 baseline confirmed substantial current dirty work in Sagan before
  rescue execution edits, including untracked `docs/` and untracked Drizzle
  `0003_workflow_audit` artifacts referenced by the modified journal.
- Milestone 1 schema work requires building on top of the untracked
  `0003_workflow_audit` migration state; the generated `0004` migration assumes
  `0003` is part of the local migration history.
- Loading `.env` exposes the configured Neon database for local commands.
  User confirmed this DB has no important data and approved migrations plus
  mutating QA against it.
- A running runner can race with direct QA execution after `@claude` comments.
  Finished-notification writes must therefore be idempotent and must run even
  when a Claude reply already exists for the trigger run.
- The existing experiment model was only a simple status field plus edit route;
  Milestone 2 required adding durable workflow events and approval requests as
  first-class records.
- The approval queue can be implemented as a focused `/experiments` surface
  before deeper RunPod orchestration exists.
- Structured plan parsing should be heading-line based rather than a single
  broad regex; the regex parser preserved headings but lost required field
  bodies on a real Claude plan.
- The web proxy must treat bearer-authenticated API requests as potentially
  authenticated. Cookie-only proxy checks break mobile APIs before route-level
  auth can validate the bearer session.
- The pre-existing dispatcher marked approved experiment runs `completed`
  immediately after pod creation. That hid the actual RunPod lifecycle from
  Sagan and needed to become durable `deploying`/`running` state plus watcher
  evidence.
- Stop requests need a two-phase state: web marks `stop_requested`, then the
  runner performs the RunPod stop call. Runner selection must include
  `stop_requested` rows or the notification can be missed.
- Clean-result Q&A exposed that generic QA runs can return instruction-like
  text if the prompt does not explicitly say the result is the exact comment
  body. The runner now gives QA runs direct comment-reply instructions.
- The existing daily-log clean-result assistant was useful scaffolding, but it
  did not create durable clean-result objects, versions, verified artifact
  links, approval state, or opaque share tokens.
- Weekly-digest Q&A exposed a second QA gap: even with direct-reply
  instructions, a scoped DB entity must be included in the prompt because QA
  mode is file-read-only and cannot query Sagan's database on its own.
- A long-running background runner process keeps old prompt/session code until
  restarted. Controlled direct `runSession` QA is useful for validating the
  patched code path, but deployment/ops should restart the runner after runner
  prompt changes.
- The existing lit-review job already used arXiv RSS rather than the older
  export API because the export endpoint rate-limits aggressively. Milestone 7
  kept that arXiv path and added generic RSS support.
- Literature ranking can be useful without an LLM call by matching surfaced
  items against recent clean-result, belief, and experiment terms, then storing
  the explanation. This gives deterministic read-next reasons and keeps the
  cron cheap.
- Paper Q&A needs the same scoped-context treatment as clean-result and weekly
  review Q&A; a lit item page already has comments, so saved paper Q&A can be
  implemented through Claude comment replies instead of a separate answer table.
- Ideation can start as deterministic product logic instead of another live
  LLM dependency: source context plus recent literature/belief/result context
  is enough to create useful prompt decks and initial card drafts.
- The daily log should be a promotion boundary for ideation. Session creation,
  rough notes, and draft cards remain private workspace state; only promoted
  cards create canonical experiments or tasks and daily-log entries.
- M9 QA exposed an access-control leak: `/api/entity/[kind]/[id]` and generic
  entity pages loaded records for any logged-in user. These now enforce scoped
  entity read access, and scoped readers no longer see owner edit/approval
  controls on digest or clean-result detail pages.
- Health visibility can be useful without a new table: current agent run,
  job, notification, experiment, and pod lifecycle tables provide enough
  owner-facing operational state for the first admin dashboard.
- No-op self-improvement QA should use plan mode first. It exercises dashboard
  dispatch, runner plan capture, review-prompt generation, and approval gates
  without letting the agent edit files or deploy.

## Decision Log

- Add lightweight multi-user accounts.
- Email notifications first.
- Claude replies immediately with attribution.
- Sunday weekly review default plus manual trigger.
- Ideation is a first-class workspace.
- Import clean results only; link/search other historical GitHub state.
- Use a ranked approval queue for proposed experiments.
- Use opaque tokens for shared/public links.
- Treat current Sagan dirty work, including the `0003_workflow_audit`
  migration artifacts, as pre-existing rescue context pending targeted review;
  do not normalize, roll back, or production-migrate it during Milestone 0.
- Use invite-token password setup for the first collaborator/mentor account
  path, and use a dev/log email adapter until a provider is chosen.
- Use the currently configured `.env` database for migrations and mutating
  rescue QA; user confirmed it has no important data.
- Preserve plan markdown as the human-readable source, but store structured
  plan JSON for reliable web/mobile approval rendering and workflow gates.
- Use `dryRun: true` inside `runpod-spec` for local lifecycle QA. Real
  approved experiment specs can omit it to launch through the real RunPod API.
- Implement stop before terminate. Stop preserves the volume and is safe for
  the first Sagan-controlled lifecycle action; terminate still needs an
  explicit approval path later.
- Treat clean results as first-class entities rather than daily-log-only
  entries. The daily log receives approved clean-result references, while
  drafts, versions, comments, artifacts, and sharing live on `clean_results`.
- Keep legacy experiment statuses while adding the rescue-plan lifecycle states
  so existing rows remain readable.
- Store experiment workflow transitions in `workflow_events`; use
  `approval_requests` for owner approval queue state instead of overloading
  `agent_runs`.
- Include scoped Sagan DB context in QA prompts for comment replies on weekly
  digests, clean results, and experiments; reject obvious placeholder QA
  outputs before posting them as Claude comments.
- Store literature summaries and ranking explanations on `lit_items`, while
  keeping daily surfacing score/reason on `lit_inbox`.
- Support generic RSS literature sources before heavier API integrations; arXiv
  remains an RSS source path, and future Semantic Scholar/OpenAlex/X ingestion
  can feed the same ranking/explanation fields.
- Model ideation as source-linked sessions and draft cards. Keep rough notes
  out of canonical research state until an explicit promotion creates an
  experiment or task.
- For the first ideation milestone, generate prompt decks and cards
  deterministically from Sagan context; deeper LLM-assisted ideation can be
  layered onto the same tables later.
- Allow mentors/collaborators to create experiment proposals only from scoped
  source entities. Force those proposals to `proposed`, record proposer/source
  metadata, grant scoped membership on the new experiment, and keep all status
  advancement owner-only.
- Add `/admin/health` as the first operational dashboard, backed by existing
  run/job/notification/pod tables rather than new health-check schema.
- Treat dashboard-triggered self-improvement as plan/review/approval first;
  apply, push, deploy, and production migration actions remain separate gates
  requiring explicit owner approval.

## Open Questions Safe To Defer

- Exact email provider.
- Exact X/Twitter ingestion mechanism.
- Slack/Discord integrations.
- Final collaborator role names.
- Exact visual design system.
- Whether clean-result verifier is ported directly or rewritten.
- Whether old GitHub issues are linked through GitHub API, local snapshots, or
  both.

## External Sources Checked

- Stanford d.school "How Might We":
  https://dschool.stanford.edu/tools/how-might-we-questions
- SCAMPER overview:
  https://ixdf.org/literature/topics/scamper
- Scientific question guidance:
  https://www.globe.gov/do-globe/resources/student-resources/be-a-scientist/steps-in-the-scientific-process/pose-questions
- AI idea diversity:
  https://arxiv.org/abs/2402.01727
- LLM hypothesis generation survey:
  https://arxiv.org/abs/2504.05496
- RunPod docs:
  https://docs.runpod.io
- Anthropic Agent SDK:
  https://platform.claude.com/docs/en/agent-sdk/typescript
- Expo notifications:
  https://docs.expo.dev/push-notifications/
- X API docs:
  https://docs.x.com/
- arXiv API:
  https://info.arxiv.org/help/api/
- OpenReview:
  https://docs.openreview.net/
- Semantic Scholar API:
  https://www.semanticscholar.org/product/api
- OpenAlex:
  https://docs.openalex.org/

## Goal Mode Kickoff Prompt

```text
You are continuing the Sagan / EPS Research Dashboard rescue in goal mode.

First, read docs/exec-plans/sagan-rescue-plan.md completely. Treat it as the source of truth for product goals, constraints, milestone order, acceptance criteria, and safety gates.

Follow the plan milestone by milestone. Keep docs/exec-plans/sagan-rescue-plan.md current as you work:
- update Progress Log after meaningful work;
- update Discoveries Log when repo evidence changes the plan;
- update Decision Log when you make or confirm an architectural/product decision;
- record safe-to-defer questions instead of blocking unless the answer materially affects the current milestone.

Preserve unrelated dirty work. Before edits, inspect git status and the specific files you will touch. Do not revert, overwrite, or delete user changes unless explicitly instructed.

Do not rotate secrets. The currently configured `.env` database is approved as a disposable/dev QA target: load `.env`, run migrations, and run mutating QA against it when useful. Do not run destructive operations against any important production data, deploy, push, delete important data, or terminate RunPod volumes without explicit approval. UI/API compatibility may break during the refactor, but important production research data must be protected.

Run relevant checks for each milestone. At minimum use pnpm typecheck for code changes, package-specific typecheck/build where relevant, and dev DB migration checks before any schema work. Use mocked/dry-run paths before live RunPod work. Real RunPod launches are allowed only inside an approved experiment plan.

Continue autonomously until the current milestone is complete or genuinely blocked. If blocked, report the blocker with concrete evidence: command output, file paths, DB/API state, and the smallest decision needed from the user.
```

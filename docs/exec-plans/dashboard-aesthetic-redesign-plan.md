# Dashboard Aesthetic Redesign Plan

## Product Intent

Sagan should feel like a polished Linear/Raycast-style research productivity
dashboard. The interface should be approval-focused first, while also making
it easy to see where active research work sits in a GitHub-like pipeline
kanban.

Primary users are the owner, mentors, and advisors. The owner is the daily
power user; mentors and advisors need a clear review surface.

## Target Outcome

Within five seconds, a user should understand:

- what needs approval;
- what active work is running and what stage it is in;
- what changed recently;
- what can be acted on next;
- where they are in the product.

The light-mode web dashboard should feel spacious, refined, and operationally
clear. Mobile is a real daily use case, not just a secondary viewer.

## Locked Decisions

- Style direction: Linear/Raycast-style productivity app.
- Light mode is the primary design target.
- Dark mode must remain functional, but can be visually secondary.
- Icons are allowed and should be polished, consistent, and purposeful.
- Prefer spacious/polished views with progressive disclosure for more detail.
- Approval visibility is the main UX priority.
- Do not change backend behavior or data contracts unless strictly necessary.
- Work within the existing Next 16 + Tailwind 4 stack.
- Build reusable UI primitives before page-by-page polish.
- Keep keyboard navigation, focus states, contrast, and mobile touch targets
  first-class.
- Primary navigation should center on Approvals, Pipeline, Results,
  Literature, Log, and Ideation.
- Projects are mainly for shareable project ideas/context, not project
  management.
- Agent should be demoted to Automation/Admin. Agent activity should surface
  in Approvals, Pipeline, and Log instead of requiring a primary Agent view.
- Results should include Daily, Weekly, and Findings views.

## Main Information Architecture

Primary views:

- `Approvals`: global decision inbox for items needing approval, review,
  defer/block decisions, or owner attention.
- `Pipeline`: kanban board for active research work and results, similar to
  the current GitHub project-board mental model.
- `Results`: curated reporting layer with Daily, Weekly, and Findings tabs.
- `Literature`: papers/items to read, triage, summarize, cite, or connect to
  research.
- `Log`: full chronological research/audit log of actions, agent events,
  approvals, state changes, and notes.
- `Ideation`: idea sessions, prompts, generated cards, promoted ideas, and
  deferred/rejected ideas.

Secondary views:

- `Projects`: shareable project idea/context pages for mentors, advisors, and
  collaborators.
- `Automation`: agent runs, dispatch, failures, operational debugging, and
  admin-only automation detail.
- `Settings/Admin`: health, theme, access, and lower-frequency tools.

Pipeline stages should be easy to adjust, but the first pass should support:

- Idea / Proposed
- Planning
- Awaiting approval
- Approved / Queued
- Running
- Interpreting
- Clean result review
- Shared / Done
- Blocked

Results should be the place for polished reporting:

- `Daily`: what happened today, things done, next steps, blockers, and
  approvals needed.
- `Weekly`: mentor/advisor-facing digest across the week, including findings,
  open questions, next experiments, and literature read.
- `Findings`: durable clean-result archive grouped by project, topic, status,
  and share state.

## Current Repo Map

Sagan repo: `/home/thomasjiralerspong/sagan`

Key web dashboard files:

- `apps/web/app/(app)/layout.tsx`: authenticated app shell.
- `apps/web/src/components/AppNav.tsx`: main navigation.
- `apps/web/app/globals.css`: Tailwind 4 import and design tokens.
- `apps/web/app/(app)/today/page.tsx`: main Today dashboard.
- `apps/web/app/(app)/today/ResearchLog.tsx`: daily log UI.
- `apps/web/src/components/today/CleanResultAssistant.tsx`: clean result
  assistant panel.
- `apps/web/app/(app)/work/page.tsx`: work overview.
- `apps/web/app/(app)/tasks/page.tsx`: tasks route.
- `apps/web/app/(app)/tasks/TasksBoard.tsx`: kanban board.
- `apps/web/app/(app)/digests/page.tsx`: weekly digest list.
- `apps/web/app/(app)/digests/[id]/page.tsx`: weekly digest detail.
- `apps/web/app/(app)/projects/page.tsx`: project list.
- `apps/web/app/(app)/experiments/page.tsx`: experiment queue and timeline.
- `apps/web/app/(app)/knowledge/page.tsx`: knowledge overview.
- `apps/web/app/(app)/beliefs/page.tsx`: belief list.
- `apps/web/app/(app)/library/page.tsx`: library list.
- `apps/web/app/(app)/agent/page.tsx`: agent dispatch and run list.
- `apps/web/app/(app)/more/page.tsx`: lower-frequency tools.
- `apps/web/src/components/CommandPalette.tsx`: global search palette.
- `apps/web/src/components/ThemeControl.tsx`: theme selector.

## Current UX Problems

- Approval work is visible on Today, but not globally available.
- There is no single approval inbox as a first-class destination.
- There is no unified Pipeline kanban for active research work and results.
- Today mixes approval, daily update, log, and result-assistant concerns.
- Most pages share the same plain bordered-list/card pattern.
- Navigation labels are broad and do not communicate task state or urgency.
- The hierarchy between urgent actions, reference data, and historical context
  is weak.
- Agent is too prominent for a debugging/automation surface.
- Results are spread across clean results, daily logs, digests, and review
  queues instead of living in one curated reporting layer.
- Important actions often rely on small text buttons.
- Several action controls are hover-only, which is poor for mobile.
- Status colors are hardcoded in multiple files instead of semantic tokens.
- Mobile navigation is functional but not designed as a daily-use workflow.
- Empty states are plain text rather than useful product surfaces.
- Pages feel like database lists rather than a research operating system.

## Design Principles

- Approval-first hierarchy: the most important pending decision should be the
  most visually obvious thing.
- Recognition over recall: users should not need to remember where approvals,
  blockers, runs, or drafts live.
- Progressive disclosure: show the next useful layer by default; reveal detail
  through expansion, filters, drawers, tabs, or detail pages.
- Consistent spatial rhythm: use a clear spacing scale, fewer divider lines,
  and stronger grouping by proximity.
- Color as information: reserve accent and status colors for state, urgency,
  and action. Do not use decoration-only color.
- Mobile parity: approval, review, daily log entry, and navigation flows must
  be comfortable on mobile.
- Accessible polish: visible focus, non-color status cues, readable contrast,
  and large enough touch targets.

Reference guidance:

- NN/g aesthetic-usability effect: attractive interfaces increase perceived
  usability when aesthetics support function.
- NN/g usability heuristics: keep content focused on essentials, show system
  status, support recognition over recall, and use plain-language errors.
- Material responsive/navigation guidance: use predictable navigation, grids,
  responsive behavior, and adequate touch targets.
- USWDS data visualization guidance: keep visualizations simple, use color
  carefully, and provide accessible alternatives where needed.

## Phase 1: Design Foundation

Create or consolidate reusable UI primitives, likely under
`apps/web/src/components/ui` or `packages/ui` depending on existing project
conventions.

Suggested primitives:

- `PageHeader`: title, description, primary action, secondary actions, counts.
- `Panel`: soft surface with variants for default, subtle, elevated, urgent.
- `Button`: primary, secondary, tertiary, danger, icon+label variants.
- `IconButton`: compact command with accessible label and tooltip/title.
- `StatusBadge`: semantic status, tone, icon, and label.
- `MetricTile`: compact KPI/count with label, value, trend/state.
- `ListRow`: consistent clickable row with leading icon/status, body, meta,
  trailing actions.
- `EmptyState`: title, message, optional action, contextual icon.
- `SegmentedControl`: tabs/filters with counts.
- `ApprovalQueue`: reusable approval list/rail for global and page surfaces.

Token work:

- Add semantic tokens for approval, warning, blocked, running, success, info,
  neutral, and muted surfaces.
- Replace duplicated hardcoded `oklch(...)` status maps with centralized
  semantic status configuration.
- Add polished shadow tokens and subtle surface/background tokens.
- Keep the existing CSS variable approach in `globals.css`.
- Consider a stronger app font such as Geist if dependency/network setup is
  acceptable. If not, use the best system stack available.

## Phase 2: App Shell And Global Approval Visibility

Redesign `apps/web/app/(app)/layout.tsx` and `AppNav`.

Desktop shell:

- Keep a left navigation shell, but make it feel like a product sidebar.
- Add polished icons next to navigation labels.
- Show active state clearly with background, accent bar, or filled nav item.
- Add global approval visibility in the sidebar or a right-side approval rail.
- Surface counts for approvals, blockers, active runs, or review items.
- Make the primary nav: Approvals, Pipeline, Results, Literature, Log,
  Ideation.
- Put Projects, Automation, Settings/Admin, and lower-frequency tools in a
  secondary section.
- Keep command palette and theme control, but make them visually integrated.

Mobile shell:

- Treat mobile as first-class.
- Provide a sticky approval entry point with a visible badge.
- Consider a bottom navigation or compact top navigation with the core
  destinations: Approvals, Pipeline, Results, Literature, Log, Ideation.
- Ensure sign out/theme controls do not compete with primary workflow actions.

Global approval rail/entry should answer:

- how many items need approval/review;
- what the highest-priority item is;
- where to act on it;
- how to jump to the full approval inbox.

## Phase 3: Approval Inbox

Create or redesign the primary `Approvals` view.

The Approval Inbox should include:

- all pending approval requests;
- experiments awaiting plan approval;
- clean results awaiting review or polish;
- blockers needing an owner decision;
- agent runs awaiting approval;
- mentor/advisor-facing review items where applicable.

Each approval item should show:

- entity type and status;
- title and concise context;
- requested action;
- age/last-updated time;
- direct actions where safe, such as approve, defer, block, open detail;
- source links to pipeline card, result, experiment, or agent run.

Acceptance criteria:

- Approval count is visible globally on desktop and mobile.
- The full Approval Inbox is one click/tap away from the shell.
- Approval items are grouped by urgency and action type, not only by table
  order.
- Empty state clearly says there is nothing waiting and suggests the next
  useful place to go.

## Phase 4: Pipeline Kanban

Create or redesign the primary `Pipeline` view as the GitHub-like kanban for
active research work.

The Pipeline should include running things and stage-based work:

- ideation cards promoted to research work;
- experiment proposals and plans;
- approval-pending experiments;
- queued/running experiments;
- interpreting/reviewing work;
- clean results in review;
- blockers;
- completed/shared findings.

Recommended columns:

- Idea / Proposed
- Planning
- Awaiting approval
- Approved / Queued
- Running
- Interpreting
- Clean result review
- Shared / Done
- Blocked

Card requirements:

- title;
- entity type icon;
- current status;
- project/topic if available;
- owner action needed, if any;
- last updated;
- direct link to detail;
- compact status/approval badge.

Implementation notes:

- Reuse and improve the existing `TasksBoard` patterns where useful, but this
  board is not just todos.
- Use responsive horizontal scrolling or stacked columns on mobile.
- Make blocked and awaiting-approval states visually distinct.
- Consider filters for project, entity type, status, and owner action.

Acceptance criteria:

- A user can immediately see what is running and what stage each item is in.
- Items needing approval are obvious from the board and also appear in
  Approvals.
- The board remains usable on mobile.

## Phase 5: Results

Create or redesign the primary `Results` view as the curated reporting layer.

Results should have tabs or segmented views:

- `Daily`
- `Weekly`
- `Findings`

Daily:

- Show things done today, next steps, blockers, approvals needed, and clean
  results drafted/reviewed.
- This replaces the idea of a standalone top-level Today view.
- It can still use existing daily-log data and clean-result assistant flows.

Weekly:

- Show weekly digests in a mentor/advisor-readable format.
- Surface major findings, open questions, next experiments, literature read,
  and approval/review needs.
- Reuse existing digest routes where possible.

Findings:

- Show durable clean results.
- Group or filter by project, topic, status, date, and share state.
- Make share/read review workflows clear for mentors and advisors.

Acceptance criteria:

- Results feels like the place to understand what was learned, not just what
  moved.
- Daily and Weekly views are polished enough to show to mentors/advisors.
- Clean results are easy to browse and share.

## Phase 6: Literature, Log, And Ideation

Literature:

- Make literature items easier to scan.
- Prioritize things to read, triage, summarize, cite, or connect to research.
- Use clear type/source/status labels.
- Provide helpful empty/loading states where applicable.

Log:

- Create or redesign a primary chronological Research Log view.
- Include actions, daily entries, agent events, approvals, state changes,
  comments, clean-result updates, and notable system events.
- Provide filters for entity type, project/topic, actor, date, and event type.
- Keep it audit-grade but readable.

Ideation:

- Make idea sessions, prompts, generated cards, promoted ideas, and deferred
  ideas easy to understand.
- Show which ideas have been promoted into Pipeline.
- Provide clear paths from idea card to proposed experiment, project page, or
  literature follow-up.

## Phase 7: Projects, Automation, And Secondary Surfaces

Projects:

- Treat Projects as shareable project idea/context pages.
- Do not make Projects the main project-management surface.
- Improve project pages for sharing with mentors, advisors, and collaborators:
  context, hypothesis, relevant findings, open questions, literature, and
  next possible experiments.

Automation:

- Demote the current Agent page to Automation/Admin.
- Make dispatch and run inspection available for the owner, but do not require
  ordinary users to visit it to understand research progress.
- Agent activity should appear in Approvals, Pipeline, and Log when relevant.
- Improve run list with status badges, timestamps, filters, and clear request
  text.

More/Admin:

- Redesign `apps/web/app/(app)/more/page.tsx` as a clean utility/settings area.
- Group lower-frequency tools by purpose.
- Use icons, concise descriptions, and clear labels.
- Avoid making it look like another generic data list.

Review modal/detail surfaces touched by the redesign for visual consistency,
especially entity detail pages and clean-result pages if they share the same
UI patterns.

## Phase 8: Interaction, States, And Accessibility

Apply consistently across all redesigned surfaces:

- hover, pressed, disabled, loading, success, error, and empty states;
- visible focus rings and logical focus order;
- non-color status indicators, such as icons or labels;
- mobile-friendly touch targets, aiming for 44-48px interactive areas;
- no essential action hidden only on hover;
- plain-language errors;
- no text overlap at mobile, tablet, desktop, or wide desktop widths.

## Phase 9: Verification

Run local checks:

- `pnpm --filter @sagan/web lint`
- `pnpm --filter @sagan/web typecheck`
- `pnpm --filter @sagan/web build` if feasible

Start the app:

- `pnpm --filter @sagan/web dev`

Review at minimum:

- mobile: around 390px wide;
- tablet: around 768px wide;
- desktop: around 1280px wide;
- wide desktop: around 1440px wide.

Apply a five-second test to every main page:

- Where am I?
- What needs approval?
- What changed recently?
- What can I do next?

Core mobile workflows to verify:

- see approval count;
- open an approval item;
- approve/defer/block where supported;
- view Pipeline kanban stages and open a card;
- switch Results between Daily, Weekly, and Findings;
- add or review a daily update/log entry;
- browse literature to read;
- inspect Research Log filters;
- open or promote an ideation card;
- open a shareable project context page;
- inspect automation detail only when needed;
- navigate between Approvals, Pipeline, Results, Literature, Log, and
  Ideation.

## Priority Order

1. Global approval visibility.
2. App shell and mobile navigation.
3. Reusable UI primitives and semantic tokens.
4. Approval Inbox.
5. Pipeline kanban.
6. Results with Daily, Weekly, and Findings tabs.
7. Literature, Log, and Ideation.
8. Projects as shareable context pages.
9. Automation/Admin as secondary surfaces.
10. Dark-mode cleanup.
11. Responsive and accessibility QA.

## Goal Mode Objective

Use this plan to improve the entire Sagan web dashboard's aesthetics and
intuitiveness without changing backend behavior. Work within the existing
Next 16 + Tailwind 4 stack. First create reusable UI primitives and semantic
design tokens, then redesign the shell around these primary views:
Approvals, Pipeline, Results, Literature, Log, and Ideation. Make Approvals
globally visible, make Pipeline the kanban for running things and research
stages, and make Results the curated reporting layer with Daily, Weekly, and
Findings views. Demote Agent to Automation/Admin and keep Projects focused on
shareable project ideas/context pages. Prioritize polished light-mode visual
hierarchy, mobile usability, accessible interaction states, and a
Linear/Raycast-style productivity feel. Verify with lint/typecheck and
responsive browser review.

# Mentor Snapshot And Clean Results Plan

## Product Intent

Sagan should turn daily research work into one mentor-readable snapshot with a
clear claim, a concrete hypothesis, the most important plot, and a small number
of qualitative examples. The mentor should not need to read a long report to
understand what happened.

The full evidence trail should still exist, but it should sit behind progressive
disclosure: details, artifacts, reviewer notes, agent transcripts, and daily log
trail remain accessible after the summary.

## Target Outcome

Within one viewport, a mentor can see:

- the one-sentence result;
- the hypothesis, prediction, and main caveat;
- the primary plot or artifact;
- two to four representative qualitative examples;
- the next decision or next test.

Within the owner dashboard, every meaningful action has a daily-log trail entry
with both `Action` and `Why`, so the work can be reconstructed later.

## Locked Decisions

- The default clean result is a snapshot, not a long report.
- Put TL;DR and plots before methodology.
- Keep full details, but collapse them under `<details>`.
- Generate at most one clean result per daily snapshot action.
- Ask the user one quick clarification question before drafting when the daily
  log is ambiguous.
- The quick question and clean-result draft use Haiku and only existing daily
  log entries. They should not search the codebase or web.
- Reviewers should be less strict and less noisy: only material blockers,
  capped output, and no random commentary.
- Claude/Anthropic stalls should trigger automatic continuation before the user
  has to intervene.
- If an agent stops before final result, a supervisor/continuation workflow
  should review the transcript and continue or produce a precise blocker.
- Every mutation, merge, review, continuation, and generated result should be
  recorded in the daily log with why it happened.
- Work within the existing Next 16, Tailwind 4, Drizzle, Claude Agent SDK, and
  runner architecture.

## Non-Goals

- Do not build a new generic report writer.
- Do not make mentor-facing pages more verbose.
- Do not automatically send anything to mentors.
- Do not add new charting dependencies unless plain HTML/CSS/SVG or existing
  markdown images are insufficient.
- Do not rely on an external X/Twitter post unless a specific URL is supplied.
  Treat the Karpathy note as product inspiration for automatic continuation and
  supervisor agents.

## Current Repo Anchors

Clean result generation:

- `apps/web/app/api/daily-log/clean-result/question/route.ts`
- `apps/web/app/api/daily-log/clean-result/draft/route.ts`
- `apps/web/src/components/today/CleanResultAssistant.tsx`

Mentor/result presentation:

- `apps/web/app/(app)/results/page.tsx`
- `apps/web/app/(app)/clean-results/[id]/page.tsx`
- `apps/web/app/mentor/daily/[date]/MentorDailyLogBoard.tsx`
- `apps/web/app/mentor/updates/MentorResultsBoard.tsx`

Agent continuation and review:

- `services/runner/src/lib/run-agent.ts`
- `services/runner/src/session.ts`
- `apps/web/app/(app)/agent/[id]/RunStream.tsx`
- `apps/web/app/api/agent-runs/[id]/codex-review/route.ts`

Audit trail:

- `apps/web/src/lib/daily-log-trail.ts`
- `services/runner/src/trail.ts`
- `apps/web/app/(app)/log/page.tsx`

## Snapshot Format

> **Two formats, two audiences.** The structure below is for the *daily
> Haiku-drafted snapshot* that lives on a `daily_log_entries` row (short
> markdown, generated quickly from existing log entries). For the *full
> HTML experiment write-up* on the `experiments.body` field (the artifact
> rendered at `/e/experiment/[id]` and shared with mentors), follow
> `docs/clean-result-guidelines.md` instead — that's a richer three-piece
> structure with an inline-SVG primary plot, a collapsible Experimental
> design dropdown, and a worked example.

Clean-result drafts (daily snapshot) should follow this structure:

```md
## TL;DR
One concrete result in one or two sentences.

## Hypothesis
- Hypothesis:
- Prediction:
- Caveat / kill criterion:

## Plot
Primary plot, image, or artifact link first. If no plot exists, say what plot is
missing and why.

## Qualitative examples
Two to four representative examples, outputs, rows, or cases.

## Next step
One next test, owner decision, or blocker.

<details>
<summary>Full evidence</summary>

Methodology, artifact links, reviewer notes, logs, and additional evidence.

</details>
```

Hard constraints:

- TL;DR should be less than 80 words.
- Hypothesis should be falsifiable.
- Plot comes before long methodology.
- Qualitative examples should be concrete, not generic summaries.
- If evidence is weak, say that in the caveat instead of adding more prose.

## Phase 1: Tighten Haiku Clean-Result Flow

Update `question/route.ts`:

- Keep using Haiku.
- Ask exactly one short question.
- Prefer questions that reveal one missing item: hypothesis, caveat, plot, or
  qualitative example.
- Add a daily-log trail entry when a question is generated, including why the
  question was asked.

Update `draft/route.ts`:

- Change prompt to emit the snapshot format above.
- Cap the draft to concise output.
- Require one primary claim and one primary hypothesis.
- Require a plot/artifact section even when missing.
- Require qualitative examples if daily-log entries contain examples or outputs.
- Keep the existing job run and trail behavior.

Update `CleanResultAssistant.tsx`:

- Make the quick-question flow the obvious first action.
- Show the generated question, answer box, and save action with clear loading and
  error states.
- Avoid long explanatory UI copy.

Acceptance checks:

- Drafted daily clean result starts with TL;DR.
- It contains `Hypothesis`, `Plot`, and `Qualitative examples`.
- It does not ask to inspect the codebase or search the web.
- The quick-question action and draft action both appear in the daily trail.

## Phase 2: Plot-First Mentor Surfaces

Update result and mentor surfaces:

- In `/results?view=daily`, show a snapshot strip above the full daily log when
  at least one clean result exists today.
- In `/mentor/daily/[date]`, cards should show the TL;DR and first plot/image
  before body text.
- In `/mentor/updates`, preserve the existing presentation/other grouping, but
  render cards as snapshot previews: title, claim, first image/artifact,
  confidence/caveat, and source.
- In clean-result detail, show claim, plot/artifacts, and qualitative examples
  before full markdown.

Implementation notes:

- Start with markdown parsing helpers that extract first heading, first image,
  TL;DR text, and examples section from `bodyMd`.
- Use existing markdown images and `run_artifacts` links before adding any chart
  package.
- If no image exists, render a compact "No plot linked" state with artifact
  links.

Acceptance checks:

- A mentor can understand a result from the first card/viewport.
- Plot or missing-plot state is visible before methodology.
- Full details remain accessible.
- Mobile layout does not overlap or hide text.

## Phase 3: Concrete Hypotheses In Agent Plans

Update `experimentPlanningInstructions()` in `services/runner/src/session.ts`:

- Require one primary hypothesis.
- Require a measurable prediction.
- Require a kill criterion or caveat.
- Require the expected primary plot/artifact.
- Require the likely clean-result snapshot shape.

Update `RunStream.tsx`:

- Surface `Hypothesis`, `Prediction`, `Kill Criterion`, `Artifacts`, and
  `Likely Clean Result` prominently in structured plan cards.
- Keep the raw markdown plan below.

Acceptance checks:

- Experiment plans have structured, parseable hypothesis sections.
- The approval screen makes the concrete hypothesis visible without scrolling
  through a long plan.

## Phase 4: Less Noisy Reviewers

Retune reviewer prompts across agent review paths:

- Reviewers should only report material blockers.
- Cap findings to three.
- Require each finding to state the consequence and evidence.
- Allow "No blocking concerns" when appropriate.
- Do not produce speculative style comments or random suggestions.

Likely targets:

- `apps/web/app/api/agent-runs/[id]/codex-review/route.ts`
- Comment responder prompt sections in `services/runner/src/session.ts`
- Pipeline review prompt generation in `apps/web/app/api/pipeline/advance/route.ts`
- Any reviewer job prompts in `services/runner/src/jobs/*`

Acceptance checks:

- Codex review prompts ask for bugs, missed requirements, unsafe assumptions,
  and incomplete final state only.
- Reviewer output is capped and actionable.
- No review path creates broad, random commentary by default.

## Phase 5: Automatic Continue And Supervisor Follow-Through

The repo already has continuation behavior in `run-agent.ts` and one retry in
`session.ts`. Harden it:

- Emit visible `auto_continue_sent` events when the helper sends `Continue`.
- Handle idle stalls, empty final response, stream ended without result,
  max-token-like stops, and transient Anthropic/API errors.
- Add bounded retry with backoff for transient SDK/API failures.
- Preserve and display continuation source and continuation run links.
- When a run stops early, queue or prepare a supervisor continuation that reads
  the transcript, avoids repeating completed work, and either continues or
  states the exact blocker.

Implementation notes:

- Keep continuation bounded. Avoid infinite chains.
- Prefer one automatic continuation run after a failed/incomplete run.
- If full Codex execution is not wired into Sagan, make
  `codex-review/route.ts` produce an exact continuation prompt for Codex goal
  mode.

Acceptance checks:

- Stalled runs show `auto_continue_sent` events in the agent event stream.
- Early-stop failures produce a continuation run or a precise continuation
  prompt.
- The daily log records the continuation and why it was queued.

## Phase 6: Daily Log Trail Coverage

Audit mutation paths and add missing trail writes:

- quick question generated;
- clean result draft saved;
- clean result approved/shared/updated;
- clean results merged or consolidated;
- artifact published or linked;
- reviewer prompt prepared;
- continuation sent or queued;
- pipeline movement;
- agent failure/blocker state.

Trail entry standard:

```md
**Action:** What changed

**Why:** Why this action was taken

**Detail:** Short evidence, input, or correlation id
```

Acceptance checks:

- `/log` and the daily log show a coherent trail for a clean result from daily
  notes through mentor snapshot.
- Entries include why, not just what.
- Trail failures stay best-effort and do not block user workflow.

## Phase 7: UI Polish

Use the existing Tailwind 4 and Geist setup. Apply the local frontend redesign
guidance, but keep the app operational and dense:

- No decorative landing page.
- Fewer nested cards.
- Compact snapshot cards.
- Clear icon/button states.
- Better mobile touch targets.
- Better empty, loading, and error states.
- Plot/image surfaces should have stable dimensions.
- Avoid long instructional text in the app.

Primary UI targets:

- `Results` daily view.
- Mentor daily result cards.
- Mentor updates cards and overlay.
- Clean-result detail page.
- Agent run continuation/review panel.

Acceptance checks:

- `pnpm --filter @sagan/web lint`
- `pnpm --filter @sagan/web typecheck`
- Manual browser check of `/results?view=daily`, `/mentor/daily/<today>`,
  `/mentor/updates`, and one clean-result detail.

## Suggested Implementation Order

1. Haiku prompt and daily-result snapshot format.
2. Snapshot extraction helpers and mentor/result UI.
3. Concrete hypothesis requirements in agent plans.
4. Reviewer prompt caps.
5. Continuation event visibility and supervisor prompt.
6. Daily trail audit and missing trail entries.
7. Visual polish and final browser verification.

## Goal Mode Prompt

Use this as the objective for Codex goal mode:

```text
Implement docs/exec-plans/mentor-snapshot-clean-results-plan.md end to end.

Prioritize the core outcome: daily clean results should become plot-first,
mentor-readable snapshots with one concrete hypothesis, TL;DR, qualitative
examples, and a clear next step. Make reviewer/agent behavior less noisy, make
automatic continuation visible and bounded, and ensure every meaningful action
is recorded in the daily log with Action and Why.

Work in small phases. Preserve existing data and app behavior. Use the existing
Next 16, Tailwind 4, Drizzle, and Claude Agent SDK patterns. Run relevant lint
and typecheck commands before finishing, and report any checks that cannot run.
```

If goal mode supports a token budget, start with a generous budget because this
crosses web UI, API prompts, runner behavior, and audit trail coverage.

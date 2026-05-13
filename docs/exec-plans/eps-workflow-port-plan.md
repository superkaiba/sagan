# EPS Workflow Port Plan

## Goal

Make Sagan's experiment workflow match the Explore Persona Space workflow in
stages, reviewer roles, reviewer loops, marker discipline, and promotion
behavior, while keeping Sagan as the only workflow control plane.

Explore Persona Space remains a client project. It may run domain-specific
experiment code and prompts, but it must read and mutate workflow state only
through Sagan's HTTP API.

## Target Architecture

```text
EPS agents / experiment code
        |
        | Sagan HTTP API only
        v
Sagan experiments, workflow_events, agent_runs, runs, pod_lifecycle, artifacts
```

Sagan owns:

- experiment statuses;
- workflow events and `epm:*` markers;
- approval state;
- reviewer rounds and reconciler outcomes;
- RunPod lifecycle, time remaining, cost, progress, and artifacts;
- clean-result state and promotion;
- dashboard stage mapping.

EPS owns:

- project-specific experiment code;
- project-specific hypotheses, prompts, and analysis scripts;
- compatibility client scripts that call Sagan APIs.

EPS must not own or mutate workflow state through GitHub issues, GitHub labels,
project board columns, local files, or direct Sagan database writes.

## Locked Decisions

- Sagan is canonical. GitHub issues in EPS are historical evidence only.
- `/issue <N>` means Sagan `experiments.number`, not a GitHub issue number.
- GitHub issue comments become Sagan `workflow_events`.
- GitHub labels/project columns become Sagan `experiments.status` and dashboard
  stages.
- EPS interacts with Sagan only through HTTP APIs and API-token authenticated
  client scripts.
- Sagan keeps its RunPod-native runtime model rather than adopting EPS pod
  lifecycle scripts as the primary mechanism.
- Add a lightweight `clarifying` step before full planning.
- Reviewer-pair critique loops are preserved but capped at three rounds.
- After three critique rounds, unresolved reviewer disagreement must not create
  an indefinite gate. The reconciler records the final critique, applies or
  requests only the necessary final fix, and the workflow continues unless
  there is a true user-decision blocker.

## Workflow Shape

The Sagan workflow should preserve the EPS lifecycle, with one added
clarification step:

```text
proposed
  -> clarifying
  -> planning
  -> plan_pending
  -> approved
  -> queued
  -> implementing
  -> code_reviewing
  -> testing
  -> running
  -> uploading / verifying
  -> interpreting
  -> reviewing
  -> awaiting_promotion
  -> completed
```

Exceptional and auxiliary states:

```text
gate_pending
awaiting_approval
blocked
followups_running
shared
failed
cancelled
archived
done_experiment
done_impl
```

Status reconciliation rules:

- Add `clarifying` to Sagan's durable status enum and dashboard mappings.
- Remove or legacy-map EPS `under_review` to Sagan `reviewing`.
- Treat `completed` as the canonical Sagan success terminal.
- Keep `done_experiment` and `done_impl` only if needed for EPS compatibility or
  audit history; otherwise map them to `completed`.
- Keep `uploading` for the EPS-style stage and `verifying` for Sagan-native
  artifact/runtime verification. Both must map deterministically in the
  dashboard.

## Clarification Step

`clarifying` sits between `proposed` and `planning`. It should be light, not a
new heavy approval gate.

The clarification step must establish:

- the specific hypothesis being tested;
- the expected information gain;
- what result would change the next action or belief;
- any missing constraint that would make planning invalid.

Clarifying questions should be few and targeted. If the hypothesis and
information gain are already clear, the workflow should advance to `planning`
without asking extra questions.

Critics and reviewers may only request additions that are necessary to
understand, test, or interpret the stated hypothesis and information gain. They
should not add broad nice-to-have requirements, extra literature work, or
unrelated methodological gates.

## Reviewer Pair Loops

Sagan must preserve EPS's repeated reviewer-pair behavior. A reviewer stage is
not a single pass; each pair can run up to three critique rounds.

Reviewer pairs:

- Claude code reviewer + Codex code reviewer;
- Claude interpretation critic + Codex interpretation critic;
- Claude clean-result critic + Codex clean-result critic.

Each round records:

- reviewer pair name;
- round number, starting at 1;
- reviewer identity;
- verdict;
- required targeted fix, if any;
- reconciler decision;
- next workflow status.

Allowed verdicts:

- `pass`;
- `needs_targeted_fix`;
- `blocked_needs_user_decision`;
- `fail_not_worth_continuing`.

Loop behavior:

```text
review pair round 1
  -> reconciler
  -> targeted fix if needed
review pair round 2
  -> reconciler
  -> targeted fix if needed
review pair round 3
  -> reconciler
  -> final targeted fix if needed
  -> continue unless a real user-decision blocker remains
```

After round 3, lack of reviewer consensus alone is not enough to block. The
reconciler should write the final critique, choose the minimal necessary fix,
and advance the experiment after that fix is handled. Only missing user input,
unsafe execution, invalid artifacts, or an untestable hypothesis should move the
experiment to `blocked`.

## Markers And Events

Use Sagan `workflow_events` for all workflow markers.

Examples:

- `epm:clarify`
- `epm:plan`
- `epm:code-review`
- `epm:code-review-codex`
- `epm:review-reconcile`
- `epm:preflight`
- `epm:launch`
- `epm:progress`
- `epm:results`
- `epm:upload-verification`
- `epm:interpretation`
- `epm:interp-critique`
- `epm:interp-critique-codex`
- `epm:clean-result-critique`
- `epm:clean-result-critique-codex`
- `epm:completion-audit`
- `epm:done`
- `epm:failure`

Reviewer-loop metadata should stay compact:

```json
{
  "review_pair": "interpretation",
  "round": 2,
  "reviewer": "codex-interpretation-critic",
  "verdict": "needs_targeted_fix",
  "required_fix": "Clarify whether the result supports the stated hypothesis."
}
```

## Implementation Phases

### Phase 1: Canonical Workflow Spec

- Add `.claude/workflow.yaml` to Sagan, derived from EPS but reconciled with
  Sagan statuses.
- Add `.claude/skills/issue/markers.md`.
- Add tests that fail if workflow YAML statuses diverge from the Sagan DB enum
  or dashboard status list.
- Add `clarifying` to the Sagan enum, API validation, dashboard mapping, and
  pipeline movement logic.

### Phase 2: Sagan API Client

- Port or rewrite EPS `scripts/sagan_state.py` inside Sagan as the official
  API client for agent workflows.
- Ensure it supports viewing experiments, setting status, posting markers,
  updating title/body/kind/tags, setting clean-result state, and promoting
  results.
- Fix the current EPS doc mismatch around a referenced `patch` command by
  either implementing it or replacing the instruction.
- Keep all mutations behind HTTP API calls.

### Phase 3: `/issue` Skill And Agents

- Port EPS `.claude/skills/issue/SKILL.md` into Sagan.
- Replace all active GitHub workflow language with Sagan-native terms.
- Port the reviewer, critic, analyzer, reconciler, planner, implementer, and
  follow-up proposer agents.
- Update every active agent instruction to use `experiment_number`.
- Replace GitHub marker posting with Sagan workflow-event posting.
- Add explicit reviewer-loop cap and round-3 continuation rule.

### Phase 4: RunPod And Artifact Integration

- Keep Sagan's existing `runpod-spec` planning contract.
- Keep Sagan dispatcher as the pod launcher.
- Ensure workflow stages update around queued, running, uploading, verifying,
  interpreting, and awaiting promotion.
- Preserve progress reporting through `SAGAN_PROGRESS_URL`.
- Preserve RunPod time remaining, uptime, adjusted cost, and artifact tracking.

### Phase 5: EPS Client Cleanup

- Add top-level EPS instructions that Sagan is canonical.
- Remove or rewrite active EPS instructions that use GitHub issues, labels,
  comments, or project board columns as workflow state.
- Keep EPS domain code and prompts.
- Keep EPS compatibility scripts only if they call Sagan APIs.

### Phase 6: Verification

- Test status coverage across DB enum, API schemas, dashboard mapping, and
  workflow YAML.
- Test `/api/experiments/by-number/:number`.
- Test workflow-event marker creation.
- Test `clarifying -> planning` movement.
- Test three-round reviewer-loop metadata and round-3 continuation behavior.
- Test clean-result promotion.
- Test RunPod progress and cost metadata preservation.
- Static-check EPS active agent docs for forbidden GitHub workflow mutations.

## Acceptance Criteria

- A Sagan experiment can run through the EPS-style lifecycle without relying on
  GitHub issue state.
- Clarification happens before planning and focuses on hypothesis and
  information gain.
- Reviewer pairs can loop up to three rounds.
- After three rounds, reviewer disagreement is reconciled and the workflow
  continues unless there is a true user-decision blocker.
- All reviewer rounds and reconciler decisions are visible in Sagan
  `workflow_events`.
- RunPod status, progress, estimated time remaining, cost, and artifacts remain
  Sagan-native and visible in the dashboard.
- EPS agents know Sagan is canonical and use only the Sagan API for workflow
  state.

## Goal-Mode Prompt

Use this prompt to start goal mode:

```text
Implement the saved plan in /home/thomasjiralerspong/sagan/docs/exec-plans/eps-workflow-port-plan.md.

The goal is to make Sagan's experiment workflow match Explore Persona Space's
workflow, including stages, markers, reviewer roles, and reviewer-pair critique
loops, while making Sagan the only workflow control plane. EPS must interact
with workflow state only through Sagan HTTP APIs.

Important requirements:
- Add the lightweight clarifying step before planning.
- Clarification must establish the specific hypothesis and expected information
  gain.
- Critics may only request additions necessary to understand, test, or interpret
  that hypothesis/information gain.
- Preserve reviewer-pair loops with a hard cap of 3 critique rounds.
- If reviewers still do not agree after round 3, the reconciler records the
  final critique, applies or requests only the minimal necessary final fix, and
  the workflow continues unless a real user-decision blocker remains.
- Preserve Sagan's RunPod-native status, progress, time remaining, cost, and
  artifact tracking.
- Do not reintroduce GitHub issues, labels, comments, or project boards as
  workflow state.

Implement this end to end: workflow spec, statuses, API/client scripts, agents,
dashboard mappings, tests, and EPS-facing cleanup instructions. Run the relevant
checks and report exactly what changed and what remains.
```

# /issue

Use this skill when the user says `/issue <N>` or asks an agent to work an
experiment workflow item by number.

`<N>` is `experiments.number` in Sagan. It is not a GitHub issue number.
GitHub issues, labels, comments, and project-board columns are historical
evidence only and must not be used as workflow state.

## Required Setup

Read workflow state through:

```bash
python scripts/sagan_state.py view <N>
```

Mutate workflow state only through `scripts/sagan_state.py`, which calls the
Sagan HTTP API with `Authorization: Bearer $SAGAN_API_TOKEN`.

## Workflow

1. Load the Sagan experiment by number.
2. If the status is `proposed`, move to `clarifying` or record why
   clarification is unnecessary.
3. During `clarifying`, establish only:
   - the specific hypothesis;
   - expected information gain;
   - what result would change the next action or belief;
   - any missing constraint that would make planning invalid.
4. If those points are already clear, move to `planning`.
5. Use `plan_pending` for owner approval, `approved`/`queued` for launch,
   `running`/`uploading`/`verifying` for runtime and artifact handling,
   `interpreting`/`reviewing` for analysis and critique, and
   `awaiting_promotion` before final promotion to `completed`.

## Commands

Set status:

```bash
python scripts/sagan_state.py status <N> clarifying --note "Need hypothesis and information gain."
```

Patch metadata:

```bash
python scripts/sagan_state.py patch <N> --title "..." --hypothesis-file /tmp/hypothesis.md --tags "eps,geometry"
```

Post marker:

```bash
python scripts/sagan_state.py marker <N> epm:clarify --to-status planning --note "Hypothesis and information gain are clear."
```

Promote result:

```bash
python scripts/sagan_state.py promote <N> useful --note "Clean result accepted."
```

Patch a clean result:

```bash
python scripts/sagan_state.py clean-result <uuid> --status reviewing
```

## Reviewer Loop

For code review, interpretation critique, and clean-result critique, run the
Claude/Codex pair for at most three rounds. Post every reviewer verdict and
reconciler decision as `workflow_events` with reviewer metadata.

Round-3 rule: if reviewers still disagree after round 3, the reconciler writes
the final critique, applies or requests only the minimal necessary fix, and the
workflow continues unless there is a true user-decision blocker such as missing
owner input, unsafe execution, invalid artifacts, or an untestable hypothesis.

See `markers.md` for marker names and metadata shape.

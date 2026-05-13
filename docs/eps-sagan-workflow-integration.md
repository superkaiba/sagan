# EPS Sagan Workflow Integration

Sagan is the workflow control plane for Explore Persona Space experiment
state. EPS remains the project repo for domain code, prompts, analysis scripts,
and artifacts, but active workflow state lives in Sagan.

EPS agents and scripts must:

- read experiments through Sagan HTTP APIs;
- treat `/issue <N>` as Sagan `experiments.number`;
- set status through Sagan APIs;
- post `epm:*` markers as Sagan `workflow_events`;
- preserve RunPod progress reporting through `SAGAN_PROGRESS_URL`;
- promote clean results through Sagan APIs.

EPS agents and scripts must not:

- mutate GitHub issues, labels, comments, or project board columns as workflow
  state;
- use local files as canonical workflow state;
- write directly to the Sagan database;
- treat old GitHub issue numbers as authoritative identifiers.

Use `scripts/sagan_state.py` from this repo as the compatibility client. It
implements `view`, `status`, `marker`, `patch`, `clean-result`, and `promote`
commands using API-token-authenticated HTTP calls.

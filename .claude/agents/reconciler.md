---
name: review-reconciler
description: Reconcile Claude/Codex reviewer-pair disagreements for Sagan workflows.
---

Reconcile only the reviewer reports supplied for the same `review_pair` and
round. Do not review from scratch and do not add new findings.

Record `epm:review-reconcile` with the reviewer pair, round, reconciler
decision, minimal required fix if any, and next workflow status.

After round 3, reviewer disagreement alone cannot block. Continue after the
minimal necessary final fix unless a real user-decision blocker remains:
missing owner input, unsafe execution, invalid artifacts, or an untestable
hypothesis.

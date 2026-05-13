---
name: result-analyzer
description: Analyze Sagan experiment artifacts and prepare interpretation markers.
---

Analyze artifacts for one Sagan `experiment_number`. Preserve the stated
hypothesis and expected information gain. Record `epm:results`,
`epm:upload-verification`, and `epm:interpretation` as workflow events.

If artifacts are invalid or missing, move to `blocked` only when the result
cannot be interpreted without a real user or artifact fix. Otherwise prepare
the smallest clean-result draft that the reviewer pair can critique.

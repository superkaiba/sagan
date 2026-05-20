export const MAX_REVIEW_ROUNDS = 3;

export const REVIEW_PAIRS = [
  'code_review',
  'interpretation',
  'clean_result',
] as const;

export const REVIEW_VERDICTS = [
  'pass',
  'needs_targeted_fix',
  'blocked_needs_user_decision',
  'fail_not_worth_continuing',
] as const;

export const REVIEWER_LOOP_MARKERS = [
  'epm:code-review',
  'epm:code-review-codex',
  'epm:review-reconcile',
  'epm:interp-critique',
  'epm:interp-critique-codex',
  'epm:clean-result-critique',
  'epm:clean-result-critique-codex',
] as const;

/**
 * Canonical Sagan workflow markers, mirroring `.claude/workflow.yaml`'s
 * `markers.names` list. New marker types should be added here (and to the
 * workflow YAML) before the runner or orchestrator posts them. Unknown marker
 * types are rejected at the API surface so we don't accumulate typos.
 */
export const KNOWN_MARKER_TYPES = [
  'epm:clarify',
  'epm:clarify-answers',
  'epm:plan',
  'epm:consistency',
  'epm:experiment-implementation',
  'epm:code-review',
  'epm:code-review-codex',
  'epm:code-review-reconcile',
  'epm:review-reconcile',
  'epm:reviewer-verdict',
  'epm:reviewer-verdict-codex',
  'epm:textbox-answers',
  'epm:reviewer-pass',
  'epm:reviewer-decision',
  'epm:reviewer-ensemble-final',
  'epm:test-verdict',
  'epm:preflight',
  'epm:launch',
  'epm:progress',
  'epm:results',
  'epm:upload-verification',
  'epm:interpretation',
  'epm:interp-critique',
  'epm:interp-critique-codex',
  'epm:interp-revision',
  'epm:clean-result',
  'epm:clean-result-critique',
  'epm:clean-result-critique-codex',
  'epm:clean-result-critique-reconcile',
  'epm:clean-result-lint',
  'epm:follow-ups',
  'epm:owner-review',
  'epm:awaiting-promotion',
  'epm:promoted',
  'epm:done',
  'epm:failure',
  'epm:failure-classify',
  'epm:failure-superseded',
  'epm:hot-fix',
  'epm:hot-fix-needed',
  'epm:pod-pending',
  'epm:pod-terminated',
  'epm:pod-kept-stopped',
  'epm:dispatch',
  'epm:dispatch-blocked',
  'epm:experimenter-respawn',
  'epm:experimenter-status',
  'epm:gate',
  'epm:gate-verdict',
  'epm:gate-override',
  'epm:approval',
  'epm:approve',
  'epm:override',
  'epm:override-round-',
  'epm:user-decision',
  'epm:user-decision-n',
  'epm:user-feedback',
  'epm:auto-defaults',
  'epm:completion-audit',
  'epm:consistency',
  'epm:original-body',
  'epm:body-backup',
  'epm:analysis',
  'epm:step',
  'epm:step-completed',
  'epm:phase',
  'epm:note',
  'epm:correction',
  'epm:revise',
  'epm:fact-check-v',
  'epm:smoke-test',
  'epm:scope-amendment',
  'epm:scope-change',
  'epm:scope-update',
  'epm:amendment',
  'epm:type-relabel',
  'epm:absorbed',
  'epm:merged',
  'epm:closed',
  'epm:stale',
  'epm:abort',
  'epm:blocked',
  'epm:rebase',
  'epm:cleanresult-update',
  'epm:cleanup-done',
  'epm:upload-fix',
  'epm:gha-fix',
  'epm:hub-upload-issue',
  'epm:investigation',
  'epm:lit-review',
  'epm:lw-register-critique',
  'epm:plan-cont',
  'epm:plan-detail',
  'epm:plan-superseded',
  'epm:launch-prep',
  'epm:routing-note',
  'epm:followup-results',
  'epm:worktree-cleanup-deferred',
  'epm:gcg-debug',
  'epm:gcg-halt',
  'epm:code-review-fix',
  'epm:upload-verification-fix',
] as const;

export function isKnownMarkerType(value: string): boolean {
  return KNOWN_MARKER_TYPES.includes(value as (typeof KNOWN_MARKER_TYPES)[number]);
}

type ReviewerLoopMetadata = Record<string, unknown>;

export function validateReviewerLoopEvent(input: {
  markerType?: string;
  metadata?: ReviewerLoopMetadata;
  toStatus?: string | null;
}): { ok: true; metadata?: ReviewerLoopMetadata } | { ok: false; error: string; message: string } {
  const metadata = input.metadata;
  const markerIsReviewerLoop = input.markerType ? REVIEWER_LOOP_MARKERS.includes(input.markerType as (typeof REVIEWER_LOOP_MARKERS)[number]) : false;
  const hasReviewerLoopFields = metadata
    ? ['review_pair', 'round', 'reviewer', 'verdict', 'required_fix', 'reconciler_decision', 'next_workflow_status'].some((key) => key in metadata)
    : false;
  if (!markerIsReviewerLoop && !hasReviewerLoopFields) return { ok: true, metadata };

  const next = metadata ? { ...metadata } : {};
  const pair = next.review_pair;
  if (pair !== undefined && !REVIEW_PAIRS.includes(pair as (typeof REVIEW_PAIRS)[number])) {
    return {
      ok: false,
      error: 'invalid_review_pair',
      message: `review_pair must be one of ${REVIEW_PAIRS.join(', ')}.`,
    };
  }

  const round = next.round;
  if (round !== undefined && (!Number.isInteger(round) || (round as number) < 1 || (round as number) > MAX_REVIEW_ROUNDS)) {
    return {
      ok: false,
      error: 'invalid_review_round',
      message: `reviewer-loop round must be an integer from 1 to ${MAX_REVIEW_ROUNDS}.`,
    };
  }

  const verdict = next.verdict;
  if (verdict !== undefined && !REVIEW_VERDICTS.includes(verdict as (typeof REVIEW_VERDICTS)[number])) {
    return {
      ok: false,
      error: 'invalid_review_verdict',
      message: `verdict must be one of ${REVIEW_VERDICTS.join(', ')}.`,
    };
  }

  if (
    round === MAX_REVIEW_ROUNDS &&
    input.toStatus === 'blocked' &&
    verdict !== 'blocked_needs_user_decision'
  ) {
    return {
      ok: false,
      error: 'round_three_disagreement_cannot_block',
      message:
        'After reviewer round 3, disagreement alone cannot move the experiment to blocked. Use blocked only for a real user-decision blocker.',
    };
  }

  if (round === MAX_REVIEW_ROUNDS && verdict === 'needs_targeted_fix') {
    next.round3_continuation_required = true;
  }

  return { ok: true, metadata: next };
}

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

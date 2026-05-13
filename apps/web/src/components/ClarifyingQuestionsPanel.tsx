import { ClarifyingQuestionsForm } from '@/components/ClarifyingQuestionsForm';
import { findClarifyingSection, readAnswers } from '@/lib/clarifying-questions';

type Mode = 'active' | 'pending' | 'feedback' | 'readonly';

// plan_pending and awaiting_approval intentionally omitted — those states
// use anchored comments on the plan body (PlanWithComments) instead of
// reopening the clarifying form. Past rounds still surface in the History
// section.
const MODE_BY_STATUS: Record<string, Mode> = {
  awaiting_clarifications: 'active',
  clarifying: 'pending',
  planning: 'pending',
};

// awaiting_clarifications is the only status that still needs a fallback
// textbox when the planner emits no recognisable "Clarifying questions"
// section. plan_pending / awaiting_approval are handled by inline
// anchored comments on the plan body (see PlanWithComments).
const ANSWER_REQUIRED_STATUSES = new Set(['awaiting_clarifications']);

export function ClarifyingQuestionsPanel({
  experimentId,
  status,
  planJson,
  canDispatch,
}: {
  experimentId: string;
  status: string | null | undefined;
  planJson: unknown;
  canDispatch: boolean;
}) {
  const mode: Mode = status && MODE_BY_STATUS[status] ? MODE_BY_STATUS[status] : 'readonly';
  const section = findClarifyingSection(planJson);
  const initialAnswers = readAnswers(planJson);

  if (!section) {
    if (status && ANSWER_REQUIRED_STATUSES.has(status)) {
      return (
        <ClarifyingQuestionsForm
          experimentId={experimentId}
          body="**1. Your answer.**\n\nWrite a free-form response for Sagan below."
          initialAnswers={initialAnswers}
          mode={mode}
          canDispatch={canDispatch}
        />
      );
    }
    return null;
  }

  return (
    <ClarifyingQuestionsForm
      experimentId={experimentId}
      body={section.body}
      initialAnswers={initialAnswers}
      mode={mode}
      canDispatch={canDispatch}
    />
  );
}

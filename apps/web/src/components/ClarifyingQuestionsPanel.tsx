import { ClarifyingQuestionsForm } from '@/components/ClarifyingQuestionsForm';
import { findClarifyingSection, readAnswers } from '@/lib/clarifying-questions';

type Mode = 'active' | 'pending' | 'feedback' | 'readonly';

const MODE_BY_STATUS: Record<string, Mode> = {
  awaiting_clarifications: 'active',
  clarifying: 'pending',
  planning: 'pending',
  plan_pending: 'feedback',
  awaiting_approval: 'feedback',
};

// Statuses where the owner is expected to provide an answer. When the panel
// renders for these but the planner's JSON has no recognisable "Clarifying
// questions" section, fall back to a single open textbox so the owner is
// never stranded with no place to type.
const ANSWER_REQUIRED_STATUSES = new Set(['awaiting_clarifications', 'plan_pending', 'awaiting_approval']);

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

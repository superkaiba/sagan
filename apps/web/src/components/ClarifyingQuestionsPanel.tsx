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
  const section = findClarifyingSection(planJson);
  if (!section) return null;

  // Show the panel for any status where the planner workflow is in play
  // (Sagan asked questions, owner is answering, Sagan is reading, or a plan
  // is drafted). For terminal states we still show it as read-only history
  // so the owner can see what was asked and answered.
  const mode: Mode = status && MODE_BY_STATUS[status] ? MODE_BY_STATUS[status] : 'readonly';

  return (
    <ClarifyingQuestionsForm
      experimentId={experimentId}
      body={section.body}
      initialAnswers={readAnswers(planJson)}
      mode={mode}
      canDispatch={canDispatch}
    />
  );
}

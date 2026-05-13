import { Markdown } from '@/components/Markdown';
import { DispatchPlannerButton } from '@/components/DispatchPlannerButton';

interface StructuredPlanSection {
  title: string;
  body: string;
}

interface StructuredPlan {
  sections?: StructuredPlanSection[];
}

function coerce(value: unknown): StructuredPlan | null {
  if (!value || typeof value !== 'object') return null;
  const plan = value as StructuredPlan;
  if (!Array.isArray(plan.sections)) return null;
  const sections = plan.sections.filter(
    (s): s is StructuredPlanSection =>
      Boolean(s) && typeof s.title === 'string' && typeof s.body === 'string',
  );
  if (sections.length === 0) return null;
  return { sections };
}

const HEADING_BY_STATUS: Record<string, { title: string; intro: string; dispatchLabel: string }> = {
  awaiting_clarifications: {
    title: 'Clarifying questions',
    intro:
      'Sagan paused to ask the questions below. Answer in the comments, then re-dispatch the planner — it will read the comments and either ask follow-ups or move on to drafting a plan.',
    dispatchLabel: 'Dispatch planner with answers',
  },
  plan_pending: {
    title: 'Plan awaiting approval',
    intro:
      'Sagan drafted a plan and is waiting for approval. Approve from the dashboard, or use the button below to send the planner back with any new comments as feedback.',
    dispatchLabel: 'Re-dispatch planner with feedback',
  },
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
  if (!status) return null;
  const heading = HEADING_BY_STATUS[status];
  if (!heading) return null;
  const plan = coerce(planJson);
  if (!plan) return null;

  return (
    <section className="rounded-lg border border-[--color-warning-border] bg-[--color-warning-bg] p-4">
      <header className="mb-3 space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[--color-warning]">
          {heading.title}
        </h2>
        <p className="text-xs text-[--color-muted]">{heading.intro}</p>
      </header>

      <div className="space-y-3">
        {plan.sections!.map((section) => (
          <div
            key={section.title}
            className="rounded-md border border-[--color-border] bg-[--color-bg] p-3"
          >
            <h3 className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">
              {section.title}
            </h3>
            <div className="mt-2 text-sm">
              <Markdown>{section.body}</Markdown>
            </div>
          </div>
        ))}
      </div>

      {canDispatch ? (
        <div className="mt-3">
          <DispatchPlannerButton experimentId={experimentId} label={heading.dispatchLabel} />
        </div>
      ) : null}
    </section>
  );
}

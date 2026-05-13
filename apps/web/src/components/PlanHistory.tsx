import { and, asc, eq } from 'drizzle-orm';
import { agentRuns } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { Markdown } from '@/components/Markdown';
import {
  findClarifyingSection,
  parseClarifyingQuestions,
  readAnswers,
} from '@/lib/clarifying-questions';

// Collapsible history of every planner round for an experiment: the questions
// Sagan asked, the answers the owner gave, and the plan revisions. Newest at
// top; each round is one <details> block (collapsed by default).
//
// Sourced from agent_runs (one row per planner round, with its own planMd and
// planJson). We render every non-failed experiment-kind run that produced
// some content — clarifying questions, an owner-answers snapshot, or a plan.
export async function PlanHistory({ experimentId }: { experimentId: string }) {
  const runs = await db()
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      planMd: agentRuns.planMd,
      planJson: agentRuns.planJson,
      createdAt: agentRuns.createdAt,
      completedAt: agentRuns.completedAt,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.scopeEntityKind, 'experiment'),
        eq(agentRuns.scopeEntityId, experimentId),
        eq(agentRuns.kind, 'experiment'),
      ),
    )
    .orderBy(asc(agentRuns.createdAt));

  // Only keep rounds that produced something readable (a clarifying section,
  // a plan, or a non-empty body). Roundnumbers count chronologically so the
  // owner sees a stable "Round 1, Round 2, …" labelling regardless of how we
  // display them.
  type Round = {
    id: string;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
    round: number;
    kind: 'clarifications' | 'plan';
    clarifyingBody: string | null;
    answers: Record<string, string>;
    planMd: string | null;
  };
  const rounds: Round[] = [];
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i]!;
    const section = findClarifyingSection(run.planJson);
    const answers = readAnswers(run.planJson);
    const hasPlan = Boolean(run.planMd?.trim());
    const hasClarifying = Boolean(section);
    if (!hasPlan && !hasClarifying) continue;
    rounds.push({
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      round: rounds.length + 1,
      kind: hasPlan ? 'plan' : 'clarifications',
      clarifyingBody: section?.body ?? null,
      answers,
      planMd: hasPlan ? run.planMd : null,
    });
  }

  if (rounds.length <= 1) return null;

  // Show the most recent round at the top so older rounds are easier to skip.
  const newestFirst = [...rounds].sort((a, b) => b.round - a.round);

  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-panel]">
      <header className="border-b border-[--color-border] px-4 py-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">History</h2>
      </header>
      <div className="divide-y divide-[--color-border]">
        {newestFirst.map((round) => {
          const questions = round.clarifyingBody
            ? parseClarifyingQuestions(round.clarifyingBody)
            : [];
          const label =
            round.kind === 'plan'
              ? `Round ${round.round} — plan version`
              : `Round ${round.round} — clarifying questions`;
          const subtitle = formatRange(round.createdAt, round.completedAt);
          return (
            <details key={round.id} className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-[--color-hover]">
                <span className="font-medium">{label}</span>
                <span className="text-xs text-[--color-muted]">{subtitle}</span>
              </summary>
              <div className="space-y-3 px-4 py-3 text-sm">
                {questions.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[--color-muted]">
                      Clarifying questions
                    </h3>
                    {questions.map((q) => {
                      const answer = round.answers[String(q.index)]?.trim();
                      return (
                        <div key={q.index} className="rounded-md border border-[--color-border] bg-[--color-bg] p-3">
                          <p className="text-sm font-semibold">
                            <span className="mr-1 font-mono text-xs text-[--color-muted]">{q.index}.</span>
                            {q.heading}
                          </p>
                          {q.detail ? (
                            <div className="mt-1 text-xs text-[--color-muted]">
                              <Markdown>{q.detail}</Markdown>
                            </div>
                          ) : null}
                          {answer ? (
                            <div className="mt-2 rounded border border-[--color-border] bg-[--color-panel] px-3 py-2 text-xs">
                              <div className="mb-1 text-[10px] uppercase tracking-wide text-[--color-muted]">Owner answer</div>
                              <Markdown>{answer}</Markdown>
                            </div>
                          ) : (
                            <p className="mt-2 text-xs italic text-[--color-muted]">(no answer recorded)</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {round.planMd ? (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[--color-muted]">
                      Plan markdown
                    </h3>
                    <div className="rounded-md border border-[--color-border] bg-[--color-bg] p-3">
                      <Markdown>{round.planMd}</Markdown>
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function formatRange(start: Date, end: Date | null) {
  const startStr = start.toISOString().replace('T', ' ').slice(0, 16);
  if (!end) return startStr;
  const endStr = end.toISOString().replace('T', ' ').slice(0, 16);
  return `${startStr} → ${endStr}`;
}

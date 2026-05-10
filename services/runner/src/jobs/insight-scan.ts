/**
 * Weekly cross-project insight scan. Sunday 18:00 server time, runs before
 * the digest so the digest can mention any accepted edges.
 *
 * Reads the active beliefs across projects and asks Claude to propose
 * cross-project edges (supports / contradicts / cites / inspiration / …).
 * Proposed edges insert into `edges` with a tag in the note field so the
 * UI can distinguish them. Existing edges are skipped via the unique
 * constraint.
 */
import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { beliefs, edges, projects } from '@sagan/db/schema';
import { db } from '../db.js';
import { env, requireEnv } from '../env.js';
import { log } from '../log.js';

const ALLOWED_TYPES = [
  'supports',
  'contradicts',
  'derives_from',
  'cites',
  'method',
  'baseline',
  'background',
  'threat',
  'inspiration',
] as const;
type ProposedType = (typeof ALLOWED_TYPES)[number];
const ALLOWED_TYPE_SET = new Set<string>(ALLOWED_TYPES);

interface Proposal {
  fromBeliefId: string;
  toBeliefId: string;
  type: ProposedType;
  rationale: string;
}

function tag(): string {
  const d = new Date();
  // ISO week-ish tag
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `[insight-scan-${year}-W${String(week).padStart(2, '0')}]`;
}

export async function runInsightScan() {
  requireEnv('ANTHROPIC_API_KEY');

  const beliefRows = await db()
    .select()
    .from(beliefs)
    .where(eq(beliefs.status, 'active'));

  if (beliefRows.length < 2) {
    log.info('insight-scan: too few active beliefs to scan', { count: beliefRows.length });
    return [];
  }

  // Group by project for the prompt; only run when there are at least two projects.
  const projectsById = new Map<string, string>();
  for (const p of await db()
    .select({ id: projects.id, title: projects.title })
    .from(projects)) {
    projectsById.set(p.id, p.title);
  }

  const grouped = new Map<string | null, typeof beliefRows>();
  for (const b of beliefRows) {
    const key = b.projectId;
    const arr = grouped.get(key) ?? [];
    arr.push(b);
    grouped.set(key, arr);
  }
  if (grouped.size < 2) {
    log.info('insight-scan: only one project has active beliefs; nothing to cross-link');
    return [];
  }

  const summary = Array.from(grouped.entries())
    .map(([projectId, list]) => {
      const projectTitle = projectId
        ? projectsById.get(projectId) ?? 'unknown'
        : '(no project)';
      const items = list.map((b) => `  - ${b.id} :: ${b.title}${b.topic ? ` (${b.topic})` : ''}`).join('\n');
      return `### ${projectTitle}\n${items}`;
    })
    .join('\n\n');

  const prompt = `You are scanning a researcher's active beliefs across projects to propose **cross-project** semantic edges that would be valuable to make explicit. Only propose edges between beliefs that belong to DIFFERENT projects (a project is a top-level group; two beliefs in the same project should never be linked here).

Active beliefs grouped by project:

${summary}

Propose 0–5 edges. For each, output a JSON object with these fields:
- "fromBeliefId": uuid of the source belief
- "toBeliefId": uuid of the target belief (must be in a different project)
- "type": one of ${ALLOWED_TYPES.join(', ')}
- "rationale": one short sentence (≤30 words) explaining the connection

Return only a JSON array. No prose, no preamble. If you have no good proposals, return [].`;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const completion = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = completion.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  // Strip markdown code fences if present.
  const jsonText = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();

  let proposals: Proposal[];
  try {
    const raw = JSON.parse(jsonText);
    if (!Array.isArray(raw)) throw new Error('not an array');
    proposals = raw.filter((p) => typeof p === 'object' && p !== null) as Proposal[];
  } catch (err) {
    log.error('insight-scan: bad model output', {
      err: String(err),
      preview: text.slice(0, 200),
    });
    return [];
  }

  const beliefById = new Map(beliefRows.map((b) => [b.id, b]));
  const tagStr = tag();
  let inserted = 0;
  const accepted: Proposal[] = [];
  for (const p of proposals) {
    const from = beliefById.get(p.fromBeliefId);
    const to = beliefById.get(p.toBeliefId);
    if (!from || !to) continue;
    if (from.projectId === to.projectId) continue;
    if (!ALLOWED_TYPE_SET.has(p.type)) continue;
    try {
      const ins = await db()
        .insert(edges)
        .values({
          fromKind: 'belief',
          fromId: from.id,
          toKind: 'belief',
          toId: to.id,
          type: p.type,
          note: `${tagStr} ${(p.rationale ?? '').slice(0, 1000)}`,
        })
        .onConflictDoNothing()
        .returning({ id: edges.id });
      if (ins[0]) {
        inserted++;
        accepted.push(p);
      }
    } catch (err) {
      log.warn('insight-scan: edge insert failed', { err: String(err) });
    }
  }
  log.info('insight-scan done', { proposals: proposals.length, inserted });
  return accepted;
}

/**
 * One-off script: apply revisions to a project narrative and resolve the
 * comments that drove them. Invoked from an `apply` agent run.
 *
 * Current occupant: agent run d80b786e — fold former Q1 (persona privilege)
 * into Q2 (binding dynamics) as a sub-axis, renumber the questions to
 * three, and rewrite the Q2 (composition) multi-hop example to the form
 * "install A->B, then B->C, then C->D — does presenting A at test fire
 * the full chain A->B->C->D?". The hand-edited body lives at
 * services/runner/scripts/narrative-revised-d80b786e.html and is treated
 * as the source of truth; this script just swaps it in and resolves the
 * three driving comments.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/env.js';
import { eq } from 'drizzle-orm';
import { db, schema, close } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NARRATIVE_ID = 'f8cf6090-a1a1-4596-a146-50970fa1946a';
const RUN_ID = 'd80b786e-ddde-4f48-80c2-1556bab49697';

const COMMENT_FOLD_Q1_INTO_Q2 = '2b37a59e-b8ec-4012-a7dc-04b9a87d9350';
const COMMENT_NAME_PERSONA_PRIVILEGE = '22c53ef0-87d5-4675-8976-859e5d6d5732';
const COMMENT_CHAIN_EXAMPLE = '126d3ecf-affc-4eb4-a2f1-51330d2788db';

const newBody = fs.readFileSync(
  path.join(__dirname, 'narrative-revised-d80b786e.html'),
  'utf-8',
);

async function main() {
  const rows = await db()
    .select({
      id: schema.projectNarratives.id,
      status: schema.projectNarratives.status,
      bodyMd: schema.projectNarratives.bodyMd,
    })
    .from(schema.projectNarratives)
    .where(eq(schema.projectNarratives.id, NARRATIVE_ID))
    .limit(1);
  const narrative = rows[0];
  if (!narrative) throw new Error(`narrative not found: ${NARRATIVE_ID}`);

  if (narrative.status === 'published') {
    throw new Error('refusing to overwrite a published narrative without explicit confirmation');
  }

  const before = narrative.bodyMd;
  const mustExistBefore = [
    'Four research questions',
    'Q1. Are personas mechanistically privileged',
    'Q2. Do different kinds of bindings behave differently?',
    'Q3. How do bindings compose',
    'Q4. How do more specific condition classes',
  ];
  for (const needle of mustExistBefore) {
    if (!before.includes(needle)) {
      throw new Error(`pre-write sanity check failed: existing body missing anchor "${needle}"`);
    }
  }
  const mustExistAfter = [
    'Three research questions',
    'Q1. Do different kinds of bindings behave differently?',
    'Q2. How do bindings compose',
    'Q3. How do more specific condition classes',
    'A &rarr; B &rarr; C &rarr; D',
    'persona-privilege',
  ];
  for (const needle of mustExistAfter) {
    if (!newBody.includes(needle)) {
      throw new Error(`pre-write sanity check failed: new body missing anchor "${needle}"`);
    }
  }
  if (newBody.includes('Are personas mechanistically privileged &mdash; whether installed via prompt or via midtraining?')) {
    throw new Error('pre-write sanity check failed: new body still contains old Q1 heading');
  }

  const now = new Date();
  await db()
    .update(schema.projectNarratives)
    .set({ bodyMd: newBody, updatedAt: now })
    .where(eq(schema.projectNarratives.id, NARRATIVE_ID));

  const summaryFold =
    'Folded the former Q1 (persona-privilege) into Q2 (binding dynamics) as a sub-axis, ' +
    'renamed the section "Three research questions", and renumbered the remaining questions. ' +
    'The new Q1 intro explicitly names that a lot of prior work (Lu, Wang, Chen) treats ' +
    'personas as mechanistically privileged, with Murray et al. as the contrasting view; ' +
    'the former Q1 findings are preserved under a "persona-as-privileged" findings sub-list ' +
    'inside Q1, and the persona-privilege follow-up is preserved in the Q1 "Next" paragraph.';

  const summaryChain =
    'Rewrote the multi-hop chain example in the new Q2 (composition) intro to the form ' +
    'the reviewer asked for: install (A -> B), then (B -> C), then (C -> D), and ask ' +
    'whether presenting A at test fires the full chain A -> B -> C -> D. The same form ' +
    'is now mirrored in the "Next" paragraph.';

  await db()
    .update(schema.comments)
    .set({
      resolvedAt: now,
      resolvedBy: null,
      resolvedSummaryMd: summaryFold,
      agentRunId: RUN_ID,
      updatedAt: now,
    })
    .where(eq(schema.comments.id, COMMENT_FOLD_Q1_INTO_Q2));

  await db()
    .update(schema.comments)
    .set({
      resolvedAt: now,
      resolvedBy: null,
      resolvedSummaryMd: summaryFold,
      agentRunId: RUN_ID,
      updatedAt: now,
    })
    .where(eq(schema.comments.id, COMMENT_NAME_PERSONA_PRIVILEGE));

  await db()
    .update(schema.comments)
    .set({
      resolvedAt: now,
      resolvedBy: null,
      resolvedSummaryMd: summaryChain,
      agentRunId: RUN_ID,
      updatedAt: now,
    })
    .where(eq(schema.comments.id, COMMENT_CHAIN_EXAMPLE));

  const verify = await db()
    .select({
      id: schema.comments.id,
      resolvedAt: schema.comments.resolvedAt,
      agentRunId: schema.comments.agentRunId,
    })
    .from(schema.comments)
    .where(eq(schema.comments.entityId, NARRATIVE_ID));
  console.log(
    JSON.stringify(
      {
        narrativeBytes: newBody.length,
        narrativeBefore: before.length,
        diff: newBody.length - before.length,
        comments: verify,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => close())
  .catch(async (err) => {
    console.error(err);
    await close();
    process.exit(1);
  });

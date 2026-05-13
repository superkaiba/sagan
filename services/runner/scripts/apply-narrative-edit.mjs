#!/usr/bin/env node
// One-off script: apply revisions to a project narrative and resolve the
// comments that drove them. Plain ESM JS so we don't need tsx.
//
// Current target: agent run d80b786e — fold former Q1 (persona privilege)
// into Q2 (binding dynamics) as a sub-axis, renumber to three questions,
// rewrite the Q2 (composition) multi-hop example to A->B / B->C / C->D /
// generalize to A->B->C->D. See narrative-revised-d80b786e.html for the
// full new body. Each agent_run that uses this script overwrites the
// constants below before invoking; the previous occupant lived at b1c10e64
// and edited two comments.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Load .env from repo root.
const envPath = path.join(REPO_ROOT, '.env');
const envText = fs.readFileSync(envPath, 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
  if (!m) continue;
  let [, k, v] = m;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!(k in process.env)) process.env[k] = v;
}

const NARRATIVE_ID = 'f8cf6090-a1a1-4596-a146-50970fa1946a';
const RUN_ID = 'd80b786e-ddde-4f48-80c2-1556bab49697';

const COMMENT_FOLD_Q1_INTO_Q2 = '2b37a59e-b8ec-4012-a7dc-04b9a87d9350';
const COMMENT_NAME_PERSONA_PRIVILEGE = '22c53ef0-87d5-4675-8976-859e5d6d5732';
const COMMENT_CHAIN_EXAMPLE = '126d3ecf-affc-4eb4-a2f1-51330d2788db';

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL_DIRECT or DATABASE_URL');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

const newBody = fs.readFileSync(
  path.join(__dirname, 'narrative-revised-d80b786e.html'),
  'utf-8',
);

try {
  const rows = await sql`
    select id, status, body_md
    from project_narratives
    where id = ${NARRATIVE_ID}
    limit 1
  `;
  if (rows.length === 0) throw new Error(`narrative not found: ${NARRATIVE_ID}`);
  const before = rows[0].body_md;

  if (rows[0].status === 'published') {
    throw new Error('refusing to overwrite a published narrative without explicit confirmation');
  }
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

  await sql`
    update project_narratives
    set body_md = ${newBody}, updated_at = ${now}
    where id = ${NARRATIVE_ID}
  `;

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

  await sql`
    update comments
    set resolved_at = ${now}, resolved_by = null, resolved_summary_md = ${summaryFold},
        agent_run_id = ${RUN_ID}, updated_at = ${now}
    where id = ${COMMENT_FOLD_Q1_INTO_Q2}
  `;
  await sql`
    update comments
    set resolved_at = ${now}, resolved_by = null, resolved_summary_md = ${summaryFold},
        agent_run_id = ${RUN_ID}, updated_at = ${now}
    where id = ${COMMENT_NAME_PERSONA_PRIVILEGE}
  `;
  await sql`
    update comments
    set resolved_at = ${now}, resolved_by = null, resolved_summary_md = ${summaryChain},
        agent_run_id = ${RUN_ID}, updated_at = ${now}
    where id = ${COMMENT_CHAIN_EXAMPLE}
  `;

  const verify = await sql`
    select id, resolved_at, agent_run_id, length(resolved_summary_md) as summary_len
    from comments
    where entity_id = ${NARRATIVE_ID}
    order by created_at asc
  `;
  console.log(
    JSON.stringify(
      {
        narrativeBefore: before.length,
        narrativeAfter: newBody.length,
        diff: newBody.length - before.length,
        comments: verify,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

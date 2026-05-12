#!/usr/bin/env node
// One-off script: apply revisions to a project narrative and resolve the
// comments that drove them. Plain ESM JS so we don't need tsx.
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

const NARRATIVE_ID = 'b1c10e64-8b98-4f65-b127-55267de1f526';
const RUN_ID = '257ff27b-ef3c-4ff2-9207-833c99f66dff';
const COMMENT_1_ID = '7a158a32-9e17-490e-8bce-085ed9d97ff1';
const COMMENT_2_ID = 'f7afc9e9-83a8-4999-a0ab-510396e25507';

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL_DIRECT or DATABASE_URL');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

function removeFirst(body, needle) {
  const idx = body.indexOf(needle);
  if (idx === -1) return { out: body, hit: false };
  return { out: body.slice(0, idx) + body.slice(idx + needle.length), hit: true };
}
function removeRegex(body, re) {
  const m = body.match(re);
  if (!m) return { out: body, hit: false };
  return { out: body.replace(re, ''), hit: true };
}

try {
  const rows = await sql`
    select id, body_md
    from project_narratives
    where id = ${NARRATIVE_ID}
    limit 1
  `;
  if (rows.length === 0) throw new Error(`narrative not found: ${NARRATIVE_ID}`);
  const before = rows[0].body_md;
  let body = before;

  // Comment 1: remove the EM-content-axis sentence (leading space included so
  // we don't leave a double-space gap).
  const c1Needle =
    ' Some are bound to a content axis by training distributions that happen to be narrow (emergent misalignment).';
  const r1 = removeFirst(body, c1Needle);
  if (!r1.hit) throw new Error('comment 1 target string not found');
  body = r1.out;

  // Comment 2a: remove the "Every citation is an inline link" sentence.
  const c2aNeedle =
    ' Every citation is an inline link — click the author/title to open the paper on arXiv.';
  const r2a = removeFirst(body, c2aNeedle);
  if (!r2a.hit) throw new Error('comment 2 inline-link sentence not found');
  body = r2a.out;

  // Comment 2b: remove the Q1..Q5 SVG diagram.
  const svgRe = /<svg class="diagram"[\s\S]*?<\/svg>\s*/;
  const r2b = removeRegex(body, svgRe);
  if (!r2b.hit) throw new Error('Q1..Q5 SVG diagram not found');
  body = r2b.out;

  const now = new Date();

  await sql`
    update project_narratives
    set body_md = ${body}, updated_at = ${now}
    where id = ${NARRATIVE_ID}
  `;

  const summary1 =
    'Removed the sentence "Some are bound to a content axis by training distributions that happen to be narrow (emergent misalignment)." from the lede of the "What we\'re studying" section, per the reviewer request.';
  const summary2 =
    'Removed the sentence "Every citation is an inline link — click the author/title to open the paper on arXiv." from the Prior work intro, and removed the inline SVG Q1–Q5 relationship diagram from the "What we\'re studying" section, per the reviewer request.';

  await sql`
    update comments
    set resolved_at = ${now}, resolved_by = null, resolved_summary_md = ${summary1},
        agent_run_id = ${RUN_ID}, updated_at = ${now}
    where id = ${COMMENT_1_ID}
  `;
  await sql`
    update comments
    set resolved_at = ${now}, resolved_by = null, resolved_summary_md = ${summary2},
        agent_run_id = ${RUN_ID}, updated_at = ${now}
    where id = ${COMMENT_2_ID}
  `;

  const verify = await sql`
    select id, resolved_at, agent_run_id
    from comments
    where entity_id = ${NARRATIVE_ID}
  `;
  console.log(
    JSON.stringify(
      {
        narrativeBefore: before.length,
        narrativeAfter: body.length,
        diff: before.length - body.length,
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

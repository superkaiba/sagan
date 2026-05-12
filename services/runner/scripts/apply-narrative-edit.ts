/**
 * One-off script: apply revisions to a project narrative and resolve the
 * comments that drove them. Invoked from an `apply` agent run.
 */
import '../src/env.js';
import { eq } from 'drizzle-orm';
import { db, schema, close } from '../src/db.js';

const NARRATIVE_ID = 'b1c10e64-8b98-4f65-b127-55267de1f526';
const RUN_ID = '257ff27b-ef3c-4ff2-9207-833c99f66dff';

const COMMENT_1_ID = '7a158a32-9e17-490e-8bce-085ed9d97ff1';
const COMMENT_2_ID = 'f7afc9e9-83a8-4999-a0ab-510396e25507';

// --- helpers ---------------------------------------------------------------

function removeFirst(body: string, needle: string): { out: string; hit: boolean } {
  const idx = body.indexOf(needle);
  if (idx === -1) return { out: body, hit: false };
  return { out: body.slice(0, idx) + body.slice(idx + needle.length), hit: true };
}

function removeRegex(body: string, re: RegExp): { out: string; hit: boolean } {
  const m = body.match(re);
  if (!m) return { out: body, hit: false };
  return { out: body.replace(re, ''), hit: true };
}

async function main() {
  const rows = await db()
    .select({
      id: schema.projectNarratives.id,
      bodyMd: schema.projectNarratives.bodyMd,
    })
    .from(schema.projectNarratives)
    .where(eq(schema.projectNarratives.id, NARRATIVE_ID))
    .limit(1);
  const narrative = rows[0];
  if (!narrative) throw new Error(`narrative not found: ${NARRATIVE_ID}`);

  let body = narrative.bodyMd;

  // Comment 1: remove the EM-content-axis sentence.
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

  // Comment 2b: remove the Q1..Q5 SVG diagram. The diagram starts with the
  // <svg class="diagram"> tag (the only one with that class in the body) and
  // ends at the next </svg>.
  const svgRe = /<svg class="diagram"[\s\S]*?<\/svg>\s*/;
  const r2b = removeRegex(body, svgRe);
  if (!r2b.hit) throw new Error('Q1..Q5 SVG diagram not found');
  body = r2b.out;

  // Persist narrative body + updated_at.
  const now = new Date();
  await db()
    .update(schema.projectNarratives)
    .set({ bodyMd: body, updatedAt: now })
    .where(eq(schema.projectNarratives.id, NARRATIVE_ID));

  // Resolve comments.
  const summary1 =
    'Removed the sentence "Some are bound to a content axis by training distributions that happen to be narrow (emergent misalignment)." from the lede of the "What we\'re studying" section, per the reviewer request.';
  const summary2 =
    'Removed the sentence "Every citation is an inline link — click the author/title to open the paper on arXiv." from the Prior work intro, and removed the inline SVG Q1–Q5 relationship diagram from the "What we\'re studying" section, per the reviewer request.';

  await db()
    .update(schema.comments)
    .set({
      resolvedAt: now,
      resolvedBy: null,
      resolvedSummaryMd: summary1,
      agentRunId: RUN_ID,
      updatedAt: now,
    })
    .where(eq(schema.comments.id, COMMENT_1_ID));

  await db()
    .update(schema.comments)
    .set({
      resolvedAt: now,
      resolvedBy: null,
      resolvedSummaryMd: summary2,
      agentRunId: RUN_ID,
      updatedAt: now,
    })
    .where(eq(schema.comments.id, COMMENT_2_ID));

  // Verify both comments are now resolved and report.
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
        narrativeBytes: body.length,
        narrativeBefore: narrative.bodyMd.length,
        diff: narrative.bodyMd.length - body.length,
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

import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { litItems } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await db().select().from(litItems).orderBy(desc(litItems.updatedAt)).limit(500);
  return NextResponse.json({ litItems: rows });
}

const createSchema = z.object({
  title: z.string().min(1).max(500),
  type: z
    .enum(['paper', 'blog_post', 'forum_post', 'newsletter', 'report', 'repo', 'video', 'other'])
    .default('paper'),
  url: z.string().url().optional(),
  pdfUrl: z.string().url().optional(),
  arxivId: z.string().max(64).optional(),
  doi: z.string().max(200).optional(),
  abstract: z.string().max(20_000).optional(),
  summaryMd: z.string().max(20_000).optional(),
  relevanceReasonMd: z.string().max(20_000).optional(),
  threatReasonMd: z.string().max(20_000).optional(),
});

const ARXIV_RE = /(?:arxiv\.org\/abs\/|arxiv\.org\/pdf\/)([0-9]{4}\.[0-9]+)/i;

function maybeArxivFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const m = url.match(ARXIV_RE);
  return m ? m[1] : undefined;
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const arxivId = parsed.data.arxivId ?? maybeArxivFromUrl(parsed.data.url);
  const inserted = await db()
    .insert(litItems)
    .values({
      title: parsed.data.title,
      type: parsed.data.type,
      url: parsed.data.url,
      pdfUrl: parsed.data.pdfUrl,
      arxivId,
      doi: parsed.data.doi,
      abstract: parsed.data.abstract,
      summaryMd: parsed.data.summaryMd,
      relevanceReasonMd: parsed.data.relevanceReasonMd,
      threatReasonMd: parsed.data.threatReasonMd,
      readState: 'unread',
    })
    .returning();
  const litItem = inserted[0]!;
  await appendDailyLogTrailBestEffort({
    action: `Added literature item ${litItem.title}`,
    why: 'A user added a source to the research library for later reading or citation.',
    entityKind: 'lit_item',
    entityId: litItem.id,
    detail: litItem.url ?? litItem.arxivId ?? litItem.doi ?? litItem.type,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: litItem.id,
  });
  return NextResponse.json({ litItem: inserted[0] });
}

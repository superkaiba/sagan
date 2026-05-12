import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publishedArtifacts } from '@sagan/db/schema';
import { db } from '@/lib/db';

const DEFAULT_SITE_URL = 'https://sagan.superkaiba.com';

const publishSchema = z.object({
  slug: z.string().min(1).max(220).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/),
  title: z.string().min(1).max(500),
  summary: z.string().max(1000).nullable().optional(),
  bodyMd: z.string().min(1).max(200_000),
  source: z.string().min(1).max(100).default('manual'),
  sourceId: z.string().max(300).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function siteUrl() {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
  if (configured.includes('localhost') || configured.includes('127.0.0.1')) {
    return DEFAULT_SITE_URL;
  }
  return configured;
}

export async function POST(req: Request) {
  const expected = process.env.SAGAN_ARTIFACT_TOKEN;
  const provided = req.headers.get('x-sagan-artifact-token') ?? '';
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const now = new Date();
  const rows = await db()
    .insert(publishedArtifacts)
    .values({
      slug: parsed.data.slug,
      title: parsed.data.title,
      summary: parsed.data.summary ?? null,
      bodyMd: parsed.data.bodyMd,
      source: parsed.data.source,
      sourceId: parsed.data.sourceId ?? null,
      metadata: parsed.data.metadata ?? {},
      public: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: publishedArtifacts.slug,
      set: {
        title: parsed.data.title,
        summary: parsed.data.summary ?? null,
        bodyMd: parsed.data.bodyMd,
        source: parsed.data.source,
        sourceId: parsed.data.sourceId ?? null,
        metadata: parsed.data.metadata ?? {},
        public: true,
        updatedAt: now,
      },
    })
    .returning({ id: publishedArtifacts.id, slug: publishedArtifacts.slug });

  const artifact = rows[0]!;
  return NextResponse.json({
    artifact,
    url: `${siteUrl()}/artifact/${artifact.slug}`,
  });
}

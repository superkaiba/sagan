import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { mobileBuilds } from '@sagan/db/schema';
import { db } from '@/lib/db';

const platformSchema = z.enum(['ios', 'android']);

const publishSchema = z.object({
  platform: platformSchema,
  profile: z.string().min(1).max(100).default('preview'),
  easBuildId: z.string().min(1).max(200),
  installUrl: z.string().url().max(800),
  artifactUrl: z.string().url().max(800).nullable().optional(),
  status: z.string().min(1).max(50),
  gitSha: z.string().min(1).max(80).nullable().optional(),
  builtAt: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const expected = process.env.SAGAN_MOBILE_BUILD_TOKEN;
  const provided = req.headers.get('x-sagan-mobile-build-token') ?? '';
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: parsed.error.flatten() }, { status: 400 });
  }
  const builtAt = parsed.data.builtAt ? new Date(parsed.data.builtAt) : new Date();
  const inserted = await db()
    .insert(mobileBuilds)
    .values({
      platform: parsed.data.platform,
      profile: parsed.data.profile,
      easBuildId: parsed.data.easBuildId,
      installUrl: parsed.data.installUrl,
      artifactUrl: parsed.data.artifactUrl ?? null,
      status: parsed.data.status,
      gitSha: parsed.data.gitSha ?? null,
      builtAt,
    })
    .onConflictDoUpdate({
      target: mobileBuilds.easBuildId,
      set: {
        platform: parsed.data.platform,
        profile: parsed.data.profile,
        installUrl: parsed.data.installUrl,
        artifactUrl: parsed.data.artifactUrl ?? null,
        status: parsed.data.status,
        gitSha: parsed.data.gitSha ?? null,
        builtAt,
      },
    })
    .returning();
  return NextResponse.json({ ok: true, build: inserted[0] });
}

export async function GET() {
  const platforms = ['ios', 'android'] as const;
  const latest = await Promise.all(
    platforms.map(async (platform) => {
      const rows = await db()
        .select()
        .from(mobileBuilds)
        .where(eq(mobileBuilds.platform, platform))
        .orderBy(desc(mobileBuilds.builtAt))
        .limit(1);
      return rows[0] ?? null;
    }),
  );
  return NextResponse.json({
    ios: latest[0],
    android: latest[1],
  });
}

import { desc, eq } from 'drizzle-orm';
import { mobileBuilds, type MobileBuild } from '@sagan/db/schema';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = {
  ios: 'iOS',
  android: 'Android',
};

const QR_BASE = 'https://api.qrserver.com/v1/create-qr-code/';

async function latestBuilds() {
  const platforms = ['ios', 'android'] as const;
  const rows = await Promise.all(
    platforms.map(async (platform) => {
      const r = await db()
        .select()
        .from(mobileBuilds)
        .where(eq(mobileBuilds.platform, platform))
        .orderBy(desc(mobileBuilds.builtAt))
        .limit(1);
      return r[0] ?? null;
    }),
  );
  return { ios: rows[0] ?? null, android: rows[1] ?? null } as const;
}

function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function qrUrl(target: string, size = 320) {
  return `${QR_BASE}?size=${size}x${size}&data=${encodeURIComponent(target)}`;
}

function BuildCard({ build }: { build: MobileBuild | null }) {
  if (!build) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <p className="text-sm text-zinc-500">No build yet. Trigger one from the GitHub Actions workflow.</p>
      </div>
    );
  }
  const label = PLATFORM_LABEL[build.platform] ?? build.platform;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col items-center gap-4">
      <div className="flex items-baseline justify-between w-full">
        <h2 className="text-xl font-semibold text-zinc-100">{label}</h2>
        <span className="text-xs text-zinc-500">
          built {relativeTime(build.builtAt)} · {build.profile}
        </span>
      </div>
      <a href={build.installUrl} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrUrl(build.installUrl, 320)}
          alt={`Install ${label} preview build`}
          width={320}
          height={320}
          className="rounded-lg bg-white p-2"
        />
      </a>
      <a
        href={build.installUrl}
        target="_blank"
        rel="noreferrer"
        className="w-full text-center rounded-lg bg-emerald-500 px-4 py-3 font-medium text-zinc-950 hover:bg-emerald-400"
      >
        Tap to install
      </a>
      <p className="text-xs text-zinc-500 break-all text-center">{build.installUrl}</p>
    </div>
  );
}

export default async function InstallPage() {
  const builds = await latestBuilds();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-10">
      <div className="mx-auto max-w-3xl flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Install Sagan mobile</h1>
          <p className="text-zinc-400 text-sm">
            Scan the QR with another phone, or tap <strong>Tap to install</strong> if you&rsquo;re already on
            the device. Open with your default browser and follow the prompts.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <BuildCard build={builds.android} />
          <BuildCard build={builds.ios} />
        </div>

        <footer className="text-xs text-zinc-600 pt-4 border-t border-zinc-900">
          <p>
            New builds appear automatically after the{' '}
            <a
              href="https://github.com/superkaiba/sagan/actions/workflows/mobile-build.yml"
              className="underline hover:text-zinc-400"
            >
              Mobile Build workflow
            </a>{' '}
            finishes.
          </p>
        </footer>
      </div>
    </main>
  );
}

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Command, Inbox, LogOut } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { CommandPalette } from '@/components/CommandPalette';
import { ApprovalTitleBadge } from '@/components/ApprovalTitleBadge';
import { AppNav } from '@/components/AppNav';
import { ThemeControl } from '@/components/ThemeControl';
import { ConversationDock } from '@/components/ConversationDock';
import { MathRenderer } from '@/components/MathRenderer';
import { hasFullDashboardAccess } from '@/lib/full-dashboard-access';
import { loadShellDashboardState } from '@/lib/dashboard';
import { buttonClassName, StatusBadge } from '@/components/ui';
import { formatRelativeTime } from '@/lib/status';

const LIMITED_ACCESS_PREFIXES = ['/e/', '/clean-results/', '/agent/'];

function canOpenLimitedDashboardPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return LIMITED_ACCESS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  const pathname = (await headers()).get('x-sagan-pathname');
  const fullDashboard = hasFullDashboardAccess(session);

  if (!fullDashboard && !canOpenLimitedDashboardPath(pathname)) {
    redirect('/mentor/updates');
  }

  const shellState = fullDashboard ? await loadShellDashboardState() : null;
  const navCounts = shellState
    ? {
        approvals: shellState.approvalCount,
        pipeline: shellState.activePipelineCount,
        literature: shellState.literatureQueueCount,
        log: shellState.recentLogCount,
      }
    : undefined;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[17rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[--color-accent] focus:px-3 focus:py-2 focus:text-sm focus:text-[--color-accent-fg]"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 flex min-h-14 items-center gap-3 border-b border-[--color-border] bg-[--color-panel]/95 px-4 shadow-[0_1px_0_rgba(255,255,255,0.45)_inset] backdrop-blur md:hidden">
        <Link href="/results" className="text-sm font-semibold tracking-tight">
          Sagan
        </Link>
        {fullDashboard ? (
          <Link
            href="/approvals"
            className="inline-flex min-h-9 items-center gap-2 rounded-[--radius-control] border border-[--color-border] bg-[--color-panel] px-3 text-xs font-semibold text-[--color-fg] shadow-[var(--shadow-inset)]"
          >
            <Inbox className="h-4 w-4 text-[--color-accent]" aria-hidden="true" />
            Approvals
            <span className="rounded-md bg-[--color-approval-bg] px-1.5 py-0.5 font-mono text-[11px] text-[--color-approval]">
              {shellState?.approvalCount ?? 0}
            </span>
          </Link>
        ) : (
          <a href="/mentor/updates" className="text-xs text-[--color-muted] hover:text-[--color-fg]">
            Mentor updates
          </a>
        )}
        <div className="ml-auto flex items-center gap-2">
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[--radius-control] border border-[--color-border] bg-[--color-panel] text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </header>

      {fullDashboard ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[--color-border] bg-[--color-panel]/95 shadow-[0_-10px_30px_rgba(67,58,42,0.08)] backdrop-blur md:hidden">
          <AppNav compact counts={navCounts} />
        </div>
      ) : null}

      <aside className="hidden border-r border-[--color-border] bg-[--color-panel] p-4 shadow-[1px_0_0_rgba(255,255,255,0.35)_inset] md:sticky md:top-0 md:z-30 md:flex md:h-screen md:flex-col md:gap-5">
        <div className="border-b border-[--color-border] pb-4">
          <Link href="/results" className="block text-lg font-bold tracking-[-0.025em]">
            Sagan
          </Link>
          <p className="mt-1 truncate text-xs text-[--color-muted]">{session.user.email}</p>
        </div>

        {fullDashboard && shellState ? (
          <Link
            href="/approvals"
            data-pending={shellState.approvalCount > 0 ? 'true' : 'false'}
            className={[
              'rounded-[--radius-panel] border bg-[--color-approval-bg] p-3 text-sm shadow-[var(--shadow-inset)] transition-colors hover:bg-[--color-panel]',
              shellState.approvalCount > 0
                ? 'border-[--color-approval] ring-2 ring-[--color-approval]/60 ring-offset-2 ring-offset-[--color-panel] animate-sagan-approval-pulse'
                : 'border-[--color-approval-border]',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 font-medium">
                <Inbox className="h-4 w-4 text-[--color-approval]" aria-hidden="true" />
                Approvals
              </span>
              <span
                className={[
                  'rounded-[--radius-control] px-2 py-0.5 font-mono text-xs',
                  shellState.approvalCount > 0
                    ? 'bg-[--color-approval] text-[--color-panel]'
                    : 'bg-[--color-panel] text-[--color-approval]',
                ].join(' ')}
              >
                {shellState.approvalCount}
              </span>
            </div>
            {shellState.topApproval ? (
              <div className="mt-3 space-y-1">
                <StatusBadge status={shellState.topApproval.status} />
                <p className="line-clamp-2 text-sm font-medium leading-5">{shellState.topApproval.title}</p>
                <p className="text-xs text-[--color-muted]">
                  Updated {formatRelativeTime(shellState.topApproval.updatedAt)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-[--color-muted]">No owner decisions are waiting.</p>
            )}
          </Link>
        ) : null}

        {fullDashboard ? (
          <AppNav counts={navCounts} />
        ) : (
          <nav className="space-y-1 text-sm">
            <a
              href="/mentor/updates"
              className="block rounded-md px-2 py-1.5 text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
            >
              Mentor updates
            </a>
          </nav>
        )}

        <div className="mt-auto space-y-3">
          {fullDashboard ? <ConversationDock /> : null}
          {fullDashboard ? (
            <div className="flex items-center gap-2 rounded-[--radius-control] border border-[--color-border] bg-[--color-bg] px-3 py-2 text-xs text-[--color-muted]">
              <Command className="h-4 w-4" aria-hidden="true" />
              <span>Command search</span>
              <span className="ml-auto font-mono">Cmd-K</span>
            </div>
          ) : null}
          <ThemeControl />
          <form action="/api/auth/logout" method="post">
            <button type="submit" className={buttonClassName({ variant: 'secondary', size: 'md', className: 'w-full' })}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main id="main-content" className="mx-auto w-full max-w-[94rem] p-4 pb-24 md:p-7">
        {children}
      </main>
      <MathRenderer />
      {modal}
      {fullDashboard ? (
        <>
          <CommandPalette />
          <ApprovalTitleBadge initialCount={shellState?.approvalCount ?? 0} />
        </>
      ) : null}
    </div>
  );
}

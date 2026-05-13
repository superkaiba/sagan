import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { AlertTriangle, ArrowUpCircle, ChevronDown, ClipboardCheck, Command, Inbox, LogOut, type LucideIcon } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { CommandPalette } from '@/components/CommandPalette';
import { ApprovalTitleBadge } from '@/components/ApprovalTitleBadge';
import { AppNav } from '@/components/AppNav';
import { ThemeControl } from '@/components/ThemeControl';
import { FontPicker } from '@/components/FontPicker';
import { ConversationDock } from '@/components/ConversationDock';
import { TocHighlighter } from '@/components/TocHighlighter';
import { DashboardLiveRefresh } from '@/components/DashboardLiveRefresh';
import { ActiveRunPodsPanel } from '@/components/ActiveRunPodsPanel';
import { ApprovalDispatchButton } from '@/components/ApprovalDispatchButton';
import { SuggestedPaper } from '@/components/SuggestedPaper';
import { hasFullDashboardAccess } from '@/lib/full-dashboard-access';
import { loadShellDashboardState, type DashboardApprovalBucketKey } from '@/lib/dashboard';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/status';
import { buttonClassName } from '@/components/ui';

const LIMITED_ACCESS_PREFIXES = ['/e/', '/clean-results/', '/agent/'];

function canOpenLimitedDashboardPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return LIMITED_ACCESS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const APPROVAL_BUCKETS: Array<{
  key: DashboardApprovalBucketKey;
  label: string;
  empty: string;
  icon: LucideIcon;
  iconClassName: string;
  countClassName: string;
}> = [
  {
    key: 'plan',
    label: 'Plan needs approval',
    empty: 'No plans waiting',
    icon: ClipboardCheck,
    iconClassName: 'text-[--color-approval]',
    countClassName: 'text-[--color-approval]',
  },
  {
    key: 'promotion',
    label: 'Promotion approval',
    empty: 'No promotions waiting',
    icon: ArrowUpCircle,
    iconClassName: 'text-[--color-info]',
    countClassName: 'text-[--color-info]',
  },
  {
    key: 'blocked',
    label: 'Blocked needs help',
    empty: 'No blockers',
    icon: AlertTriangle,
    iconClassName: 'text-[--color-danger]',
    countClassName: 'text-[--color-danger]',
  },
];

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
        runpods: shellState.activePods.length,
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
        <Link href="/pipeline" className="text-sm font-semibold tracking-tight">
          Sagan
        </Link>
        {!fullDashboard ? (
          <a href="/mentor/updates" className="text-xs text-[--color-muted] hover:text-[--color-fg]">
            Mentor updates
          </a>
        ) : null}
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

      <aside className="hidden border-r border-[--color-border] bg-[--color-panel] p-4 shadow-[1px_0_0_rgba(255,255,255,0.35)_inset] md:sticky md:top-0 md:z-30 md:flex md:h-screen md:flex-col md:gap-5 md:overflow-y-auto">
        <div className="border-b border-[--color-border] pb-4">
          <Link href="/pipeline" className="block text-lg font-bold tracking-[-0.025em]">
            Sagan
          </Link>
          <p className="mt-1 truncate text-xs text-[--color-muted]">{session.user.email}</p>
        </div>

        {fullDashboard ? (
          <>
            <AppNav counts={navCounts} />
            {shellState ? (
              <section className="border border-[--color-border] bg-[--color-bg] text-sm shadow-[var(--shadow-inset)]">
                <Link
                  href="/approvals"
                  className="flex items-center justify-between gap-2 border-b border-[--color-border] px-3 py-2 hover:bg-[--color-hover]"
                >
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <Inbox
                      className={cn('h-4 w-4', shellState.approvalCount > 0 ? 'text-[--color-approval]' : 'text-[--color-muted]')}
                      aria-hidden="true"
                    />
                    Approvals
                  </span>
                  <span
                    className={cn(
                      'border px-1.5 py-0.5 font-mono text-xs',
                      shellState.approvalCount > 0
                        ? 'border-[--color-approval-border] bg-[--color-panel] text-[--color-approval]'
                        : 'border-transparent text-[--color-muted]',
                    )}
                  >
                    {shellState.approvalCount}
                  </span>
                </Link>
                <div className="space-y-2 p-2 text-xs">
                  {APPROVAL_BUCKETS.map((bucket) => {
                    const summary = shellState.approvalBuckets.find((item) => item.key === bucket.key);
                    const items = summary?.items ?? [];
                    const count = summary?.count ?? 0;
                    const Icon = bucket.icon;

                    return (
                      <details
                        key={bucket.key}
                        className="sagan-approval-list"
                        data-tone={bucket.key}
                        data-active={count > 0 ? 'true' : undefined}
                        open={count > 0}
                      >
                        <summary className="sagan-approval-summary">
                          <Icon
                            className={cn('h-3.5 w-3.5 shrink-0', count > 0 ? bucket.iconClassName : 'text-[--color-muted]')}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate font-semibold leading-4 text-[--color-fg]">{bucket.label}</span>
                          <span className={cn('shrink-0 font-mono text-[11px]', count > 0 ? bucket.countClassName : 'text-[--color-muted]')}>
                            {count}
                          </span>
                          <ChevronDown className="sagan-approval-chevron h-3.5 w-3.5 shrink-0 text-[--color-muted]" aria-hidden="true" />
                        </summary>
                        <div className="sagan-approval-items">
                          {items.length === 0 ? (
                            <p className="px-2.5 py-2 leading-4 text-[--color-muted]">{bucket.empty}</p>
                          ) : (
                            <ul>
                              {items.map((item) => (
                                <li key={item.key}>
                                  <Link href={item.href} className="sagan-approval-item">
                                    <span className="line-clamp-2 font-medium leading-4 text-[--color-fg]">{item.title}</span>
                                    <span className="mt-1 block leading-4 text-[--color-muted]">{formatRelativeTime(item.updatedAt)}</span>
                                  </Link>
                                  {item.action && bucket.key !== 'blocked' ? (
                                    <div className="px-2.5 pb-2">
                                      <ApprovalDispatchButton action={item.action} />
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                              {count > items.length ? (
                                <li>
                                  <Link href="/approvals" className="sagan-approval-item text-[--color-muted] hover:text-[--color-fg]">
                                    +{count - items.length} more
                                  </Link>
                                </li>
                              ) : null}
                            </ul>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {shellState?.topSuggestion ? <SuggestedPaper suggestion={shellState.topSuggestion} /> : null}
            {shellState ? <ActiveRunPodsPanel initialPods={shellState.activePods} accounts={shellState.runpodAccounts} /> : null}
          </>
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
          <FontPicker />
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
      <TocHighlighter />
      {modal}
      {fullDashboard ? (
        <>
          <DashboardLiveRefresh />
          <CommandPalette />
          <ApprovalTitleBadge initialCount={shellState?.approvalCount ?? 0} />
        </>
      ) : null}
    </div>
  );
}

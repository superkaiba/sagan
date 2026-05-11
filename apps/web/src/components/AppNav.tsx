'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  Bot,
  FolderOpen,
  Inbox,
  Kanban,
  Lightbulb,
  ScrollText,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import styles from './AppNav.module.css';

export interface AppNavCounts {
  approvals?: number;
  pipeline?: number;
  literature?: number;
  log?: number;
}

interface NavItem {
  label: string;
  href: string;
  match: string[];
  icon: LucideIcon;
  countKey?: keyof AppNavCounts;
}

const PRIMARY: NavItem[] = [
  { label: 'Approvals', href: '/approvals', match: ['/approvals'], icon: Inbox, countKey: 'approvals' },
  {
    label: 'Pipeline',
    href: '/pipeline',
    match: ['/pipeline', '/tasks', '/experiments', '/e/experiment', '/e/todo'],
    icon: Kanban,
    countKey: 'pipeline',
  },
  {
    label: 'Results',
    href: '/results',
    match: ['/results', '/today', '/digests', '/clean-results', '/mentor/daily', '/e/clean_result', '/e/weekly_digest'],
    icon: BarChart3,
  },
  {
    label: 'Literature',
    href: '/literature',
    match: ['/literature', '/library', '/knowledge', '/beliefs', '/e/lit_item', '/e/belief'],
    icon: BookOpen,
    countKey: 'literature',
  },
  { label: 'Log', href: '/log', match: ['/log', '/e/daily_log_entry'], icon: ScrollText, countKey: 'log' },
  { label: 'Ideation', href: '/ideation', match: ['/ideation'], icon: Lightbulb },
];

const SECONDARY: NavItem[] = [
  { label: 'Projects', href: '/projects', match: ['/projects', '/e/project', '/e/project_narrative'], icon: FolderOpen },
  { label: 'Automation', href: '/automation', match: ['/automation', '/agent', '/e/run'], icon: Bot },
  { label: 'Admin', href: '/more', match: ['/more', '/admin/health', '/mentor/updates'], icon: Settings },
];

function isActive(pathname: string, item: NavItem) {
  return item.match.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

function CountBadge({ value, active }: { value?: number; active?: boolean }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        styles.countBadge,
        active ? styles.countBadgeActive : null,
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

function NavLink({
  item,
  active,
  compact,
  count,
}: {
  item: NavItem;
  active: boolean;
  compact: boolean;
  count?: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        styles.navLink,
        compact ? styles.navLinkCompact : styles.navLinkFull,
        active ? styles.navLinkActive : null,
      )}
    >
      <Icon className={cn(styles.navIcon, active ? styles.navIconActive : null)} aria-hidden="true" />
      <span className={styles.navLabel}>{item.label}</span>
      {!compact ? <CountBadge value={count} active={active} /> : null}
      {compact && count ? (
        <span className={styles.compactCount}>
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

function NavSection({
  title,
  items,
  compact,
  counts,
  pathname,
}: {
  title?: string;
  items: NavItem[];
  compact: boolean;
  counts?: AppNavCounts;
  pathname: string;
}) {
  if (compact) {
    return (
      <>
        {items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item)}
            compact
            count={item.countKey ? counts?.[item.countKey] : undefined}
          />
        ))}
      </>
    );
  }

  return (
    <div className={styles.navSection}>
      {title ? <p className={styles.navSectionTitle}>{title}</p> : null}
      {items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={isActive(pathname, item)}
          compact={false}
          count={item.countKey ? counts?.[item.countKey] : undefined}
        />
      ))}
    </div>
  );
}

export function AppNav({ compact = false, counts }: { compact?: boolean; counts?: AppNavCounts }) {
  const pathname = usePathname();

  if (compact) {
    return (
      <nav aria-label="Primary" className={styles.compactNav}>
        <NavSection items={PRIMARY} compact counts={counts} pathname={pathname} />
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className={styles.mainNav}>
      <NavSection title="Work" items={PRIMARY} compact={false} counts={counts} pathname={pathname} />
      <NavSection title="Manage" items={SECONDARY} compact={false} counts={counts} pathname={pathname} />
    </nav>
  );
}

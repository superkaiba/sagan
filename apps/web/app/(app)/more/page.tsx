import { HeartPulse, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { ThemeControl } from '@/components/ThemeControl';
import { ListRow, PageHeader, Panel, buttonClassName } from '@/components/ui';

const LINKS = [
  { title: 'Weekly digests', href: '/digests', detail: 'Draft, edit, and share advisor updates.', icon: Mail },
  { title: 'Health', href: '/admin/health', detail: 'Runner, notification, job, and pod status.', icon: HeartPulse },
  { title: 'Mentor updates', href: '/mentor/updates', detail: 'External mentor-facing result view.', icon: ShieldCheck },
];

export default function MorePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Admin" description="Lower-frequency tools, settings, health checks, and sharing surfaces." />

      <Panel className="overflow-hidden">
        <div className="divide-y divide-[--color-border]">
          {LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <ListRow
                key={item.href}
                href={item.href}
                leading={<Icon className="h-4 w-4" aria-hidden="true" />}
                title={item.title}
                detail={item.detail}
              />
            );
          })}
        </div>
      </Panel>

      <Panel className="space-y-4 p-4">
        <h2 className="text-sm font-semibold tracking-tight">Account</h2>
        <ThemeControl />
        <form action="/api/auth/logout" method="post">
          <button type="submit" className={buttonClassName({ variant: 'secondary', size: 'md' })}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </Panel>
    </div>
  );
}

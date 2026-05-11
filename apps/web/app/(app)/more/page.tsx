import Link from 'next/link';

const LINKS = [
  { title: 'Weekly digests', href: '/digests', detail: 'Draft, edit, and share advisor updates.' },
  { title: 'Health', href: '/admin/health', detail: 'Runner, notification, job, and pod status.' },
  { title: 'Mentor updates', href: '/mentor/updates', detail: 'Public scrape of the legacy mentor project view.' },
];

export default function MorePage() {
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between border-b border-[--color-border] pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">More</h1>
        <p className="text-sm text-[--color-muted]">Lower-frequency tools</p>
      </header>

      <div className="divide-y divide-[--color-border] rounded-lg border border-[--color-border] bg-[--color-panel]">
        {LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="block px-4 py-3 hover:bg-[--color-muted-bg]">
            <span className="text-sm font-medium">{item.title}</span>
            <span className="mt-1 block text-sm text-[--color-muted]">{item.detail}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

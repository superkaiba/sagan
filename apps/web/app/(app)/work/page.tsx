import Link from 'next/link';

const GROUPS = [
  {
    title: 'Run the work',
    items: [
      { title: 'Tasks', href: '/tasks', detail: 'Kanban over active todos.' },
      { title: 'Experiments', href: '/experiments', detail: 'Approval queue, state timeline, and experiment handoffs.' },
    ],
  },
  {
    title: 'Shape the work',
    items: [
      { title: 'Projects', href: '/projects', detail: 'Project list, creation, and project summaries.' },
      { title: 'Ideation', href: '/ideation', detail: 'Open ideation sessions and promoted cards.' },
      { title: 'Clean results', href: '/clean-results', detail: 'Mentor-facing results and review states.' },
    ],
  },
];

export default function WorkPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between border-b border-[--color-border] pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Work</h1>
        <p className="text-sm text-[--color-muted]">Projects, experiments, tasks, and results</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title} className="space-y-2">
            <h2 className="text-base font-semibold tracking-tight">{group.title}</h2>
            <div className="divide-y divide-[--color-border] rounded-lg border border-[--color-border] bg-[--color-panel]">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className="block px-4 py-3 hover:bg-[--color-muted-bg]">
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="mt-1 block text-sm text-[--color-muted]">{item.detail}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

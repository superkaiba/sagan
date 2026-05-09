export default function TodayPage() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-[--color-muted]">{today}</p>
      </header>

      <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Research log
        </h2>
        <p className="mt-2 text-sm text-[--color-muted]">
          Clean results land here as they come in. Hooked up in Phase 3 follow-up.
        </p>
      </section>

      <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Next steps Kanban
        </h2>
        <p className="mt-2 text-sm text-[--color-muted]">
          Drag-and-drop board over the kanban_cards table. Hooked up in Phase 3 follow-up.
        </p>
      </section>
    </div>
  );
}

import Link from 'next/link';

export function BeliefHistoryLink({ beliefId }: { beliefId: string }) {
  return (
    <Link
      href={`/e/belief/${beliefId}/history`}
      className="text-xs text-[--color-muted] hover:text-[--color-fg]"
    >
      View history →
    </Link>
  );
}

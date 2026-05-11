import Link from 'next/link';
import { loadPendingInviteByToken } from '@/lib/invites';
import { isEntityKind, loadEntity } from '@/lib/entity';
import { InviteAcceptForm } from './InviteAcceptForm';

export const dynamic = 'force-dynamic';

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, search] = await Promise.all([params, searchParams]);
  const invite = await loadPendingInviteByToken(token);

  if (!invite) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="w-full max-w-md rounded-lg border border-[--color-border] bg-[--color-panel] p-6">
          <h1 className="text-xl font-semibold tracking-tight">Invite unavailable</h1>
          <p className="mt-2 text-sm text-[--color-muted]">
            This invite is expired, revoked, or already accepted.
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  const entity = isEntityKind(invite.entityKind) ? await loadEntity(invite.entityKind, invite.entityId) : null;
  const redirectTo = `/e/${invite.entityKind}/${invite.entityId}`;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <InviteAcceptForm
        token={token}
        email={invite.email}
        role={invite.role}
        entityTitle={entity?.title ?? `${invite.entityKind} ${invite.entityId.slice(0, 8)}`}
        redirectTo={redirectTo}
        initialError={search.error}
      />
    </main>
  );
}

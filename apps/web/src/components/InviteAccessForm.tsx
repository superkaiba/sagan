'use client';

import { useState, type FormEvent } from 'react';
import { Check, Copy, Send, Users } from 'lucide-react';

type InviteRole = 'mentor' | 'collaborator';

interface InviteAccessFormProps {
  entityKind: string;
  entityId: string;
  defaultRole?: InviteRole;
}

export function InviteAccessForm({
  entityKind,
  entityId,
  defaultRole = 'mentor',
}: InviteAccessFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>(defaultRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch('/api/collaborators/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          role,
          entityKind,
          entityId,
          expiresInDays: 14,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        inviteUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.inviteUrl) {
        setError(data.error ?? 'Could not create invite.');
        return;
      }
      setInviteUrl(data.inviteUrl);
      setInvitedEmail(normalizedEmail);
      setEmail('');
    } finally {
      setBusy(false);
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Could not copy the invite link.');
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-[--color-border] bg-[--color-panel] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[--color-border] bg-[--color-bg] text-[--color-muted]">
            <Users aria-hidden="true" size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Invite access</h2>
            <p className="text-xs text-[--color-muted]">
              Generate an account invite for this item.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[--color-border] bg-[--color-muted-bg] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[--color-muted]">
          Owner
        </span>
      </div>

      <form onSubmit={onSubmit} className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_10rem_auto]">
        <label className="sr-only" htmlFor={`invite-email-${entityKind}-${entityId}`}>
          Email
        </label>
        <input
          id={`invite-email-${entityKind}-${entityId}`}
          type="email"
          autoComplete="email"
          placeholder="mentor@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-10 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
        <label className="sr-only" htmlFor={`invite-role-${entityKind}-${entityId}`}>
          Role
        </label>
        <select
          id={`invite-role-${entityKind}-${entityId}`}
          value={role}
          onChange={(e) => setRole(e.target.value as InviteRole)}
          className="min-h-10 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        >
          <option value="mentor">Mentor</option>
          <option value="collaborator">Collaborator</option>
        </select>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-[--color-accent-fg] hover:opacity-90 disabled:opacity-50"
        >
          <Send aria-hidden="true" size={15} />
          {busy ? 'Creating...' : 'Invite'}
        </button>
      </form>

      {inviteUrl ? (
        <div className="space-y-2 rounded-md border border-[--color-border] bg-[--color-muted-bg] p-3">
          <p className="text-xs text-[--color-muted]">
            Invite link for {invitedEmail}. It expires in 14 days.
          </p>
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              readOnly
              value={inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-10 flex-1 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
            />
            <button
              type="button"
              onClick={copyInviteUrl}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm font-medium hover:bg-[--color-hover]"
            >
              {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm text-[--color-danger]">{error}</p> : null}
    </section>
  );
}

'use client';

import { useState, type FormEvent } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  invite_expired: 'This invite is expired or has already been used.',
  google_email_mismatch: 'Use the Google account that received this invite.',
  google_not_configured: 'Google sign-in is not configured on this server yet.',
  google_state_invalid: 'The Google sign-in attempt expired. Try again.',
  google_token_failed: 'Google sign-in could not complete. Try again.',
  google_profile_failed: 'Google profile lookup failed. Try again.',
  google_email_unverified: 'Google did not return a verified email address.',
};

export function InviteAcceptForm({
  token,
  email,
  role,
  entityTitle,
  redirectTo,
  initialError,
}: {
  token: string;
  email: string;
  role: string;
  entityTitle: string;
  redirectTo: string;
  initialError?: string;
}) {
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? ERROR_MESSAGES[initialError] ?? 'Sign-up failed. Try again.' : null,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/collaborators/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password, displayName: displayName.trim() || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error === 'invalid_or_expired_invite'
            ? (ERROR_MESSAGES.invite_expired ?? 'This invite is no longer available.')
            : 'Could not accept invite.',
        );
        return;
      }
      window.location.assign(redirectTo);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md space-y-4 rounded-lg border border-[--color-border] bg-[--color-panel] p-6"
    >
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Accept invite</h1>
        <p className="text-sm text-[--color-muted]">
          {email} · {role} access to {entityTitle}
        </p>
      </header>

      <a
        href={`/api/auth/google/start?inviteToken=${encodeURIComponent(token)}&next=${encodeURIComponent(redirectTo)}`}
        className="block rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-center text-sm font-medium hover:bg-[--color-hover]"
      >
        Continue with Google
      </a>

      <div className="flex items-center gap-3 text-xs text-[--color-muted]">
        <span className="h-px flex-1 bg-[--color-border]" />
        or use a password
        <span className="h-px flex-1 bg-[--color-border]" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="displayName" className="block text-sm font-medium">Name</label>
        <input
          id="displayName"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">Password</label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
      </div>

      {error ? <p role="alert" className="text-sm text-[--color-danger]">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting || password.length < 8}
        className="w-full rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-[--color-accent-fg] disabled:opacity-50"
      >
        {submitting ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  );
}

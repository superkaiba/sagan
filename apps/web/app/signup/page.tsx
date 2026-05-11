'use client';

import Link from 'next/link';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ThemeControl } from '@/components/ThemeControl';

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const search = useSearchParams();
  const providerError = search.get('error');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => signupErrorMessage(providerError));
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error === 'account_exists'
            ? 'An account already exists for that email. Sign in instead.'
            : 'Could not create account.',
        );
        return;
      }
      window.location.assign('/mentor/updates');
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="fixed right-4 top-4">
        <ThemeControl compact />
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-6 shadow-sm"
      >
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
          <p className="text-sm text-[--color-muted]">Sagan mentor access</p>
        </header>

        <a
          href="/api/auth/google/start?signup=1&next=/mentor/updates"
          className="block rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-center text-sm font-medium hover:bg-[--color-hover]"
        >
          Continue with Google
        </a>

        <div className="flex items-center gap-3 text-xs text-[--color-muted]">
          <span className="h-px flex-1 bg-[--color-border]" />
          or use email
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
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {submitting ? 'Creating...' : 'Create account'}
        </button>

        <p className="text-center text-sm text-[--color-muted]">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[--color-accent] hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}

function signupErrorMessage(error: string | null) {
  switch (error) {
    case 'google_not_configured':
      return 'Google sign-up is not configured on this server yet.';
    case 'google_state_invalid':
      return 'The Google sign-up attempt expired. Try again.';
    case 'google_token_failed':
    case 'google_profile_failed':
      return 'Google sign-up could not complete. Try again.';
    case 'google_email_unverified':
      return 'Google did not return a verified email address.';
    default:
      return null;
  }
}

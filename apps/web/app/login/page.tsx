'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ThemeControl } from '@/components/ThemeControl';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const search = useSearchParams();
  const next = search.get('next') ?? '/today';
  const providerError = search.get('error');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => loginErrorMessage(providerError));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth/me')
      .then(async (res) => (res.ok ? ((await res.json()) as { user?: { role?: string } }) : null))
      .then((data) => {
        if (cancelled || !data?.user) return;
        window.location.replace(data.user.role === 'mentor' && next === '/today' ? '/mentor/updates' : next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error === 'invalid_credentials' ? 'Wrong email or password.' : 'Login failed.');
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { user?: { role?: string } };
      window.location.assign(data.user?.role === 'mentor' && next === '/today' ? '/mentor/updates' : next);
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="fixed right-4 top-4">
        <ThemeControl compact />
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-6 shadow-sm"
      >
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in with Google</h1>
          <p className="text-sm text-[--color-muted]">Sagan</p>
        </header>

        <a
          href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
          className="block rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-center text-sm font-medium hover:bg-[--color-hover]"
        >
          Continue with Google
        </a>

        <div className="flex items-center gap-3 text-xs text-[--color-muted]">
          <span className="h-px flex-1 bg-[--color-border]" />
          password fallback
          <span className="h-px flex-1 bg-[--color-border]" />
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-[--color-danger]">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-[--color-accent-fg] disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-sm text-[--color-muted]">
          Need an account?{' '}
          <Link href="/signup" className="font-medium text-[--color-accent] hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </main>
  );
}

function loginErrorMessage(error: string | null) {
  switch (error) {
    case 'google_not_configured':
      return 'Google sign-in is not configured on this server yet.';
    case 'google_no_account':
      return 'Google sign-in could not create an account. Try again.';
    case 'google_state_invalid':
      return 'The Google sign-in attempt expired. Try again.';
    case 'google_token_failed':
    case 'google_profile_failed':
      return 'Google sign-in could not complete. Try again.';
    case 'google_email_unverified':
      return 'Google did not return a verified email address.';
    default:
      return null;
  }
}

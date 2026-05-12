'use client';

import { useState } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';

export interface ListedApiToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

interface MintedToken {
  id: string;
  name: string;
  prefix: string;
  plaintext: string;
  createdAt: string;
  expiresAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function ApiTokensClient({ initialTokens }: { initialTokens: ListedApiToken[] }) {
  const [tokens, setTokens] = useState<ListedApiToken[]>(initialTokens);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justMinted, setJustMinted] = useState<MintedToken | null>(null);
  const [copied, setCopied] = useState(false);

  async function mint() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? 'mint_failed');
        return;
      }
      const { token } = (await res.json()) as { token: MintedToken };
      setJustMinted(token);
      setTokens((prev) => [
        ...prev,
        {
          id: token.id,
          name: token.name,
          prefix: token.prefix,
          createdAt: token.createdAt,
          lastUsedAt: null,
          expiresAt: token.expiresAt,
        },
      ]);
      setName('');
    } catch {
      setError('network_error');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this token? Any scripts using it will stop working.')) return;
    const res = await fetch(`/api/account/api-tokens/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('revoke_failed');
      return;
    }
    setTokens((prev) => prev.filter((t) => t.id !== id));
    if (justMinted?.id === id) setJustMinted(null);
  }

  async function copyToken() {
    if (!justMinted) return;
    await navigator.clipboard.writeText(justMinted.plaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mint();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. laptop-cli, github-actions"
            maxLength={120}
            className="min-h-11 rounded-[--radius-control] border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm text-[--color-fg] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[--color-focus]"
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Minting…' : 'Mint token'}
        </Button>
      </form>

      {error ? (
        <div className="rounded-[--radius-control] border border-[--color-danger] bg-[--color-danger-bg] px-3 py-2 text-sm text-[--color-danger]">
          {error}
        </div>
      ) : null}

      {justMinted ? (
        <div className="space-y-2 rounded-[--radius-control] border border-[--color-accent] bg-[--color-panel] p-4">
          <div className="text-sm font-semibold">Copy this token now — you won't see it again.</div>
          <div className="flex items-center gap-2">
            <code className="block min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-[--radius-control] border border-[--color-border] bg-[--color-bg] px-3 py-2 font-mono text-xs">
              {justMinted.plaintext}
            </code>
            <Button type="button" variant="secondary" onClick={copyToken}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-[--color-muted]">
            Replay as <code className="font-mono">Authorization: Bearer {justMinted.prefix}…</code>
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[--radius-control] border border-[--color-border]">
        <table className="w-full text-sm">
          <thead className="bg-[--color-bg] text-left text-xs uppercase tracking-wide text-[--color-muted]">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Prefix</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Last used</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[--color-border]">
            {tokens.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-[--color-muted]">
                  No tokens yet.
                </td>
              </tr>
            ) : (
              tokens.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[--color-muted]">{t.prefix}…</td>
                  <td className="px-3 py-2 text-xs text-[--color-muted]">{formatDate(t.createdAt)}</td>
                  <td className="px-3 py-2 text-xs text-[--color-muted]">{formatDate(t.lastUsedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" variant="danger" size="sm" onClick={() => void revoke(t.id)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

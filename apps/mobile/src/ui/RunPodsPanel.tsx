import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { spacing, useTheme } from '@/lib/theme';
import { Button, Card, HStack, Pill, type PillTone, SectionLabel, Text, VStack } from './index';

interface DashboardRunPod {
  id: string;
  podId: string;
  account: string;
  name: string | null;
  status: string;
  desiredStatus: string | null;
  gpuTypeId: string | null;
  gpuCount: number | null;
  costPerHr: number | null;
  adjustedCostPerHr: number | null;
  uptimeSeconds: number | null;
  agentRunId: string | null;
  experimentId: string | null;
  experimentMarker: string | null;
  experimentTitle: string | null;
  experimentEstimatedRemainingMinutes: number | null;
  experimentProgressPct: number | null;
  updatedAt: string;
  lastStartedAt: string | null;
  href: string;
}

interface RunPodAccountSummary {
  account: string;
  label: string;
  email: string | null;
  clientBalance: number | null;
  currentSpendPerHr: number | null;
  spendLimit: number | null;
  minBalance: number | null;
  underBalance: boolean | null;
  fetchedAt: string;
  error: string | null;
}

interface RunPodsResponse {
  pods: DashboardRunPod[];
  accounts: RunPodAccountSummary[];
  generatedAt: string;
}

const POD_STATUS_TONE: Record<string, PillTone> = {
  running: 'success',
  queued: 'info',
  deploying: 'info',
  retrying: 'warning',
  stop_requested: 'warning',
  blocked: 'danger',
  stopped: 'neutral',
};

function formatUsd(v: number | null): string {
  if (v == null) return '—';
  return `$${v.toFixed(2)}`;
}

function formatUsdHr(v: number | null): string {
  if (v == null) return '—';
  return `$${v.toFixed(2)}/hr`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function runway(balance: number | null, perHr: number | null): string {
  if (balance == null || perHr == null || perHr <= 0) return '—';
  const hrs = balance / perHr;
  if (hrs < 24) return `${hrs.toFixed(1)}h`;
  const days = hrs / 24;
  return `${days.toFixed(1)}d`;
}

interface RunPodsPanelProps {
  /** If true, renders compact (no SectionLabel). For inline use under another header. */
  inline?: boolean;
  pollMs?: number;
}

export function RunPodsPanel({ inline = false, pollMs = 30_000 }: RunPodsPanelProps) {
  const t = useTheme();
  const [data, setData] = useState<RunPodsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const r = await api<RunPodsResponse>('/api/runpods/active', { signal: controller.signal });
    if (controller.signal.aborted || !isMountedRef.current) return;
    if (r.ok && r.data) {
      setData(r.data);
      setError(null);
      setForbidden(false);
    } else if (r.status === 403) {
      setForbidden(true);
      setError(null);
    } else if (r.error !== 'aborted') {
      setError(r.error ?? `Refresh failed (${r.status})`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Stop polling once we know this account can't see pods — no point burning
  // a 403 round-trip every 30s for non-owners.
  useEffect(() => {
    if (pollMs <= 0 || forbidden) return;
    const handle = setInterval(() => void load(), pollMs);
    return () => clearInterval(handle);
  }, [load, pollMs, forbidden]);

  if (forbidden) {
    // Non-owner: render nothing.
    return null;
  }

  if (!data) {
    return inline ? null : (
      <VStack gap="sm">
        <SectionLabel>RunPods</SectionLabel>
        <Card pad="md">
          <Text variant="footnote" tone="muted">
            Loading…
          </Text>
        </Card>
      </VStack>
    );
  }

  const totalRate = data.pods
    .map((p) => p.adjustedCostPerHr ?? p.costPerHr)
    .filter((r): r is number => r != null)
    .reduce((a, b) => a + b, 0);

  return (
    <VStack gap="sm">
      {inline ? null : (
        <HStack justify="space-between">
          <SectionLabel>RunPods</SectionLabel>
          <Text variant="caption" tone="subtle">
            {data.pods.length} active · {formatUsdHr(totalRate)}
          </Text>
        </HStack>
      )}

      {error ? (
        <Card variant="outlined" style={{ borderColor: t.colors.danger }}>
          <Text variant="footnote" tone="danger">
            {error}
          </Text>
        </Card>
      ) : null}

      {data.accounts.length > 0 ? (
        <HStack gap="sm" wrap>
          {data.accounts.map((acc) => {
            const tone: PillTone =
              acc.error || acc.underBalance
                ? 'danger'
                : acc.clientBalance != null &&
                    acc.minBalance != null &&
                    acc.clientBalance <= acc.minBalance
                  ? 'warning'
                  : 'success';
            return (
              <Card
                key={acc.account}
                variant="outlined"
                pad="md"
                gap="xs"
                style={{ flex: 1, minWidth: 150 }}
              >
                <HStack justify="space-between">
                  <Text variant="footnote" tone="fg" style={{ fontWeight: '600' }}>
                    {acc.label}
                  </Text>
                  <Pill tone={tone}>
                    {acc.error ? 'error' : acc.underBalance ? 'low' : 'ok'}
                  </Pill>
                </HStack>
                {acc.error ? (
                  <Text variant="caption" tone="danger" numberOfLines={2}>
                    {acc.error}
                  </Text>
                ) : (
                  <>
                    <HStack justify="space-between">
                      <Text variant="caption" tone="muted">
                        balance
                      </Text>
                      <Text variant="caption">{formatUsd(acc.clientBalance)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text variant="caption" tone="muted">
                        rate
                      </Text>
                      <Text variant="caption">{formatUsdHr(acc.currentSpendPerHr)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text variant="caption" tone="muted">
                        runway
                      </Text>
                      <Text variant="caption">{runway(acc.clientBalance, acc.currentSpendPerHr)}</Text>
                    </HStack>
                  </>
                )}
              </Card>
            );
          })}
        </HStack>
      ) : null}

      {data.pods.length === 0 ? (
        <Card pad="md">
          <Text variant="footnote" tone="muted">
            No active pods.
          </Text>
        </Card>
      ) : (
        data.pods.map((pod) => (
          <Card key={pod.id} pad="md" gap="xs">
            <HStack justify="space-between">
              <HStack gap="sm">
                <Pill tone={POD_STATUS_TONE[pod.status] ?? 'neutral'}>{pod.status}</Pill>
                <Text variant="caption" tone="muted">
                  {pod.account}
                </Text>
              </HStack>
              <Text variant="caption" tone="subtle">
                {pod.gpuTypeId ?? '—'}
                {pod.gpuCount && pod.gpuCount > 1 ? ` ×${pod.gpuCount}` : ''}
              </Text>
            </HStack>
            <Text variant="bodyEmph" numberOfLines={1}>
              {pod.experimentTitle ?? pod.name ?? pod.podId}
            </Text>
            {pod.experimentMarker ? (
              <Text variant="caption" tone="muted">
                #{pod.experimentMarker}
              </Text>
            ) : null}
            <HStack gap="sm" wrap>
              <Text variant="caption" tone="muted">
                {formatUsdHr(pod.adjustedCostPerHr ?? pod.costPerHr)}
              </Text>
              <Text variant="caption" tone="muted">
                up {formatDuration(pod.uptimeSeconds)}
              </Text>
              {pod.experimentEstimatedRemainingMinutes != null ? (
                <Text variant="caption" tone="muted">
                  ~{pod.experimentEstimatedRemainingMinutes}m left
                </Text>
              ) : null}
              {pod.experimentProgressPct != null ? (
                <Text variant="caption" tone="accent">
                  {Math.round(pod.experimentProgressPct)}%
                </Text>
              ) : null}
            </HStack>
          </Card>
        ))
      )}

      <Button
        label="Billing console"
        variant="ghost"
        size="sm"
        icon="open-outline"
        onPress={() => Linking.openURL('https://console.runpod.io/billing')}
      />
    </VStack>
  );
}

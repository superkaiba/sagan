import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, RefreshControl } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, apiBase } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import {
  Button,
  Card,
  EmptyState,
  HStack,
  LoadingState,
  Pill,
  ScrollScreen,
  Text,
  VStack,
} from '@/ui';
import { AskClaudeAboutPaper, Comments } from '@/ui/Comments';
import { ExperimentReviewPanel, type ExperimentReviewStatus } from '@/ui/ExperimentReviewPanel';

type Kind =
  | 'project'
  | 'experiment'
  | 'belief'
  | 'lit_item'
  | 'clean_result'
  | 'project_narrative'
  | 'todo'
  | 'run'
  | 'daily_log_entry';

interface MetaEntry {
  label: string;
  value: string;
}

interface EntityRaw {
  url?: string | null;
  pdfUrl?: string | null;
  arxivId?: string | null;
  doi?: string | null;
  readState?: string | null;
  topic?: string | null;
  slug?: string | null;
  [k: string]: unknown;
}

interface EntityRow {
  id: string;
  title: string;
  status?: string | null;
  body?: string | null;
  meta?: MetaEntry[];
  raw?: EntityRaw;
}

interface EntityResponse {
  entity: EntityRow;
}

const KIND_TITLES: Record<Kind, string> = {
  project: 'Project',
  experiment: 'Experiment',
  belief: 'Belief',
  lit_item: 'Paper',
  clean_result: 'Clean result',
  project_narrative: 'Narrative',
  todo: 'Todo',
  run: 'Run',
  daily_log_entry: 'Daily-log entry',
};

const VALID_KINDS = new Set<Kind>([
  'project',
  'experiment',
  'belief',
  'lit_item',
  'clean_result',
  'project_narrative',
  'todo',
  'run',
  'daily_log_entry',
]);

const READ_STATE_OPTIONS: Array<{
  value: 'unread' | 'summary_read' | 'saved_for_later' | 'reading' | 'read' | 'read_deeply';
  label: string;
}> = [
  { value: 'unread', label: 'Unread' },
  { value: 'summary_read', label: 'Summary' },
  { value: 'saved_for_later', label: 'Saved' },
  { value: 'reading', label: 'Reading' },
  { value: 'read', label: 'Read' },
  { value: 'read_deeply', label: 'Read deeply' },
];

function webPathFor(kind: Kind, id: string, row: EntityRow | null): string {
  if (kind === 'project' && row?.raw?.slug) return `/projects/${row.raw.slug}`;
  if (kind === 'clean_result') return `/clean-results/${id}`;
  return `/e/${kind}/${id}`;
}

function isReviewStatus(s: string | null | undefined): s is ExperimentReviewStatus {
  return s === 'reviewing' || s === 'followups_running';
}

export default function EntityDetailScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const kind = params.kind as Kind;
  const id = params.id;
  const validKind = VALID_KINDS.has(kind);

  const [row, setRow] = useState<EntityRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingReadState, setUpdatingReadState] = useState(false);

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
    if (!validKind || !id) {
      setError('Unknown entity');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    const r = await api<EntityResponse>(`/api/entity/${kind}/${id}`, {
      signal: controller.signal,
    });
    if (controller.signal.aborted || !isMountedRef.current) return;
    if (r.ok && r.data?.entity) {
      setRow(r.data.entity);
    } else if (r.error !== 'aborted') {
      setError(r.error ?? `Failed to load (${r.status})`);
    }
    setLoading(false);
    setRefreshing(false);
  }, [validKind, kind, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  async function updateReadState(next: (typeof READ_STATE_OPTIONS)[number]['value']) {
    if (kind !== 'lit_item' || !id) return;
    setUpdatingReadState(true);
    const r = await api(`/api/lit-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ readState: next }),
    });
    setUpdatingReadState(false);
    if (!r.ok) {
      Alert.alert('Could not update', r.error ?? 'Try again in a moment.');
      return;
    }
    void load();
  }

  // Separate meta entries by treatment: long-form blocks render as Cards,
  // short attributes get a chip row.
  const longFormLabels = useMemo(() => new Set(['summary', 'read next', 'threat/caveat']), []);
  const attrEntries = useMemo(
    () => row?.meta?.filter((m) => !longFormLabels.has(m.label)) ?? [],
    [row, longFormLabels],
  );
  const blockEntries = useMemo(
    () => row?.meta?.filter((m) => longFormLabels.has(m.label)) ?? [],
    [row, longFormLabels],
  );

  if (!validKind) {
    return (
      <ScrollScreen>
        <EmptyState icon="alert-circle-outline" title="Unknown" message={`No view for "${kind}".`} />
      </ScrollScreen>
    );
  }

  if (loading && !row) {
    return (
      <>
        <Stack.Screen options={{ title: KIND_TITLES[kind] }} />
        <LoadingState />
      </>
    );
  }

  const externalUrl =
    row?.raw?.url ?? (row?.raw?.arxivId ? `https://arxiv.org/abs/${row.raw.arxivId}` : null);
  const pdfUrl = row?.raw?.pdfUrl ?? null;
  const reviewStatus = kind === 'experiment' ? row?.status : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <Stack.Screen options={{ title: KIND_TITLES[kind] }} />
      <ScrollScreen
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.colors.accent}
          />
        }
      >
        {error ? (
          <Card variant="outlined" style={{ borderColor: t.colors.danger }}>
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          </Card>
        ) : null}

        {row ? (
          <>
            <VStack gap="md">
              <Text variant="title">{row.title ?? '(untitled)'}</Text>
              <HStack gap="sm" wrap>
                {row.status ? <Pill tone="neutral">{row.status}</Pill> : null}
                {attrEntries.map((m) => (
                  <Pill key={`${m.label}-${m.value}`} tone="info">
                    {m.label}: {m.value}
                  </Pill>
                ))}
              </HStack>
            </VStack>

            {row.body ? (
              <Card pad="lg">
                <Text variant="body">{row.body}</Text>
              </Card>
            ) : null}

            {blockEntries.map((m) => (
              <Card key={m.label} pad="lg" gap="sm">
                <Text variant="micro" tone="muted">
                  {m.label.toUpperCase()}
                </Text>
                <Text variant="body">{m.value}</Text>
              </Card>
            ))}

            {kind === 'lit_item' ? (
              <>
                {externalUrl || pdfUrl ? (
                  <HStack gap="sm" wrap>
                    {externalUrl ? (
                      <Button
                        label="Open source"
                        icon="open-outline"
                        variant="secondary"
                        size="sm"
                        onPress={() => Linking.openURL(externalUrl)}
                      />
                    ) : null}
                    {pdfUrl ? (
                      <Button
                        label="PDF"
                        icon="document-outline"
                        variant="secondary"
                        size="sm"
                        onPress={() => Linking.openURL(pdfUrl)}
                      />
                    ) : null}
                  </HStack>
                ) : null}

                <Card pad="md" gap="sm">
                  <Text variant="micro" tone="muted">
                    READING STATE
                  </Text>
                  <HStack gap="xs" wrap>
                    {READ_STATE_OPTIONS.map((opt) => {
                      // For lit_item entity, both row.status and row.raw.readState
                      // are sourced from the same column; prefer raw for future-
                      // proofing in case the loader changes status semantics.
                      const current = (row.raw?.readState as string | undefined) ?? row.status;
                      const active = current === opt.value;
                      return (
                        <Button
                          key={opt.value}
                          label={opt.label}
                          variant={active ? 'primary' : 'secondary'}
                          size="sm"
                          disabled={updatingReadState || active}
                          onPress={() => void updateReadState(opt.value)}
                        />
                      );
                    })}
                  </HStack>
                </Card>

                <AskClaudeAboutPaper litItemId={id} paperTitle={row.title} onSent={() => void load()} />
              </>
            ) : null}

            {kind === 'experiment' && isReviewStatus(reviewStatus) ? (
              <ExperimentReviewPanel
                experimentId={id}
                status={reviewStatus}
                onChanged={() => void load()}
              />
            ) : null}

            <Comments entityKind={kind} entityId={id} />

            <Button
              label="Open on web"
              icon="open-outline"
              variant="secondary"
              fullWidth
              onPress={() => Linking.openURL(`${apiBase}${webPathFor(kind, id, row)}`)}
            />
          </>
        ) : null}
      </ScrollScreen>
    </KeyboardAvoidingView>
  );
}

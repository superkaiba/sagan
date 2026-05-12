import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { radius, spacing, useTheme } from '@/lib/theme';
import { Button, Card, Input, ScrollScreen, SectionLabel, Text, VStack } from '@/ui';

type Kind = 'plan' | 'apply' | 'qa' | 'experiment';

const KINDS: Array<{ id: Kind; label: string; hint: string }> = [
  { id: 'plan', label: 'Plan', hint: 'Claude writes a plan; nothing is edited until you approve.' },
  { id: 'apply', label: 'Apply', hint: 'Edits files directly. Use for safe, well-scoped changes.' },
  { id: 'qa', label: 'Q&A', hint: 'Read-only. Tools restricted to Read, Grep, Glob.' },
  { id: 'experiment', label: 'Experiment', hint: 'Approval triggers a RunPod dispatch.' },
];

export default function NewDispatch() {
  const t = useTheme();
  const [kind, setKind] = useState<Kind>('plan');
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function dispatch() {
    if (!request.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await api<{ runId: string }>('/api/agent-runs', {
      method: 'POST',
      body: JSON.stringify({ kind, request, approvalRequired: kind !== 'apply' }),
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr('Dispatch failed');
      return;
    }
    router.replace(`/agent/${r.data.runId}`);
  }

  const activeHint = KINDS.find((k) => k.id === kind)?.hint;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollScreen>
        <VStack gap="sm">
          <SectionLabel>Kind</SectionLabel>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: t.colors.sunken,
              borderRadius: radius.md,
              padding: 3,
              gap: 3,
            }}
          >
            {KINDS.map((k) => (
              <Pressable
                key={k.id}
                onPress={() => setKind(k.id)}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 9,
                  borderRadius: radius.sm,
                  backgroundColor: kind === k.id ? t.colors.surface : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  variant="footnote"
                  tone={kind === k.id ? 'fg' : 'muted'}
                  style={{ fontWeight: '600' }}
                >
                  {k.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text variant="footnote" tone="muted">
            {activeHint}
          </Text>
        </VStack>

        <Input
          label="Request"
          value={request}
          onChangeText={setRequest}
          multiline
          placeholder="What should the agent do?"
          error={err}
        />

        <Button
          label={busy ? 'Dispatching…' : 'Dispatch'}
          onPress={dispatch}
          loading={busy}
          disabled={!request.trim()}
          fullWidth
          size="lg"
          style={{ marginTop: spacing.sm }}
        />

        <Card variant="sunken" pad="md" gap="xs">
          <SectionLabel>Heads up</SectionLabel>
          <Text variant="footnote" tone="muted">
            Plan and Experiment runs require approval. Apply runs start immediately.
          </Text>
        </Card>
      </ScrollScreen>
    </KeyboardAvoidingView>
  );
}

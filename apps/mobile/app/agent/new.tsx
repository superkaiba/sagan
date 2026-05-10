import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';

type Kind = 'plan' | 'apply' | 'qa' | 'experiment';

const HINT: Record<Kind, string> = {
  plan: 'Plan-only. Claude writes a plan; nothing is edited until you approve.',
  apply: 'Edits files directly under auto-accept. Use for safe, well-scoped changes.',
  qa: 'Read-only Q&A. Tools restricted to Read/Grep/Glob.',
  experiment: 'Plan a RunPod experiment. Approval triggers pod dispatch.',
};

export default function NewDispatch() {
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
      setErr('dispatch failed');
      return;
    }
    router.replace(`/agent/${r.data.runId}`);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.root}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={s.label}>Kind</Text>
        <View style={s.kindRow}>
          {(['plan', 'apply', 'qa', 'experiment'] as Kind[]).map((k) => (
            <TouchableOpacity
              key={k}
              onPress={() => setKind(k)}
              style={[s.chip, kind === k && s.chipActive]}
            >
              <Text style={[s.chipText, kind === k && s.chipTextActive]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.hint}>{HINT[kind]}</Text>

        <Text style={[s.label, { marginTop: 8 }]}>Request</Text>
        <TextInput
          value={request}
          onChangeText={setRequest}
          multiline
          numberOfLines={6}
          placeholder="What should the agent do?"
          placeholderTextColor={C.muted}
          style={s.input}
          textAlignVertical="top"
        />

        {err ? <Text style={{ color: C.danger }}>{err}</Text> : null}

        <TouchableOpacity
          disabled={busy || !request.trim()}
          onPress={dispatch}
          style={[s.button, (busy || !request.trim()) && { opacity: 0.5 }]}
        >
          {busy ? (
            <ActivityIndicator color={C.accentFg} />
          ) : (
            <Text style={s.buttonText}>Dispatch</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  label: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  chipActive: { borderColor: C.accent, backgroundColor: C.accent },
  chipText: { fontSize: 12, color: C.fg, fontWeight: '500' },
  chipTextActive: { color: C.accentFg },
  hint: { color: C.muted, fontSize: 12 },
  input: {
    backgroundColor: C.mutedBg,
    borderRadius: 10,
    padding: 12,
    minHeight: 140,
    color: C.fg,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
  },
  button: {
    marginTop: 16,
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: C.accentFg, fontWeight: '700', fontSize: 15 },
});

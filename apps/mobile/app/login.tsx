import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '../src/api';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('thomasjiralerspong@gmail.com');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await api('/api/auth/login', { method: 'POST', json: { email, password } });
      router.replace('/(tabs)/today');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? 'wrong email or password' : `error ${err.status}`);
      } else {
        setError('network error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
    >
      <View style={styles.card}>
        <Text style={styles.title}>EPS Research</Text>
        <Text style={styles.subtitle}>Sign in</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholderTextColor="#666"
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor="#666"
          style={styles.input}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={submit}
          disabled={submitting || password.length < 8}
          style={({ pressed }) => [
            styles.button,
            (submitting || password.length < 8) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#0b0b0e" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b0b0e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 380, gap: 12 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#9ca3af', fontSize: 16, marginBottom: 12 },
  label: { color: '#9ca3af', fontSize: 13, marginTop: 8 },
  input: {
    color: '#fff',
    backgroundColor: '#1c1c22',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { color: '#f87171', marginTop: 8 },
  button: {
    backgroundColor: '#fafafa',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 18,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#0b0b0e', fontSize: 16, fontWeight: '600' },
});

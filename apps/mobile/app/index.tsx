import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { api, ApiError } from '../src/api';
import type { Me } from '../src/types';

export default function Gate() {
  const [route, setRoute] = useState<'login' | 'tabs' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api<Me>('/api/auth/me');
        if (!cancelled) setRoute('tabs');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setRoute('login');
        } else {
          setRoute('login');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (route === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0e' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  return <Redirect href={route === 'tabs' ? '/(tabs)/today' : '/login'} />;
}

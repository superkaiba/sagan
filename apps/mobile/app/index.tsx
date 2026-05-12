import { useEffect } from 'react';
import { router } from 'expo-router';
import { getToken } from '@/lib/api';
import { LoadingState, Screen } from '@/ui';

export default function Index() {
  useEffect(() => {
    void (async () => {
      const token = await getToken();
      router.replace(token ? '/(tabs)/today' : '/login');
    })();
  }, []);
  return (
    <Screen>
      <LoadingState />
    </Screen>
  );
}

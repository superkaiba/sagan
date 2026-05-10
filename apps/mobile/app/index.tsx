import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { getToken } from '@/lib/api';
import { C } from '@/lib/theme';

export default function Index() {
  useEffect(() => {
    void (async () => {
      const token = await getToken();
      router.replace(token ? '/(tabs)/today' : '/login');
    })();
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator color={C.accent} />
    </View>
  );
}

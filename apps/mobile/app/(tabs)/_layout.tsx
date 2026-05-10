import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0b0b0e' },
        headerTintColor: '#fff',
        tabBarStyle: {
          backgroundColor: '#0b0b0e',
          borderTopColor: '#1c1c22',
        },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#6b7280',
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="agent" options={{ title: 'Agent' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

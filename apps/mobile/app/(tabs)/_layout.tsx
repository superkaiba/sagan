import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IoniconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.border },
        headerStyle: { backgroundColor: C.bg },
        headerTitleStyle: { color: C.fg, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{ title: 'Today', tabBarIcon: tabIcon('today-outline') }}
      />
      <Tabs.Screen
        name="browse"
        options={{ title: 'Browse', tabBarIcon: tabIcon('albums-outline') }}
      />
      <Tabs.Screen
        name="agent"
        options={{ title: 'Agent', tabBarIcon: tabIcon('flash-outline') }}
      />
      <Tabs.Screen
        name="you"
        options={{ title: 'You', tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}

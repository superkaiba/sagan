import { Tabs } from 'expo-router';
import { Platform, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IoniconName, focusedName: IoniconName) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} color={color} size={size} />
  );
}

export default function TabsLayout() {
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? palette.dark : palette.light;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.subtleFg,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.hairline,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', letterSpacing: 0.1 },
        tabBarItemStyle: { paddingTop: 2 },
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: tabIcon('sunny-outline', 'sunny'),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: tabIcon('grid-outline', 'grid'),
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          title: 'Runs',
          tabBarIcon: tabIcon('flash-outline', 'flash'),
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: tabIcon('person-outline', 'person'),
        }}
      />
    </Tabs>
  );
}

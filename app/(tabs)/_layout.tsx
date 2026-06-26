import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { themeColors } from '@/src/theme/colors';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: Platform.OS === 'ios' ? 4 : 8,
          height: Platform.OS === 'ios' ? 88 : 64,
        },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home', headerTitle: 'Dashboard' }} />
      <Tabs.Screen name="expenses" options={{ title: 'Expenses', tabBarLabel: 'Exp' }} />
      <Tabs.Screen name="planner" options={{ title: 'Planner', tabBarLabel: 'Planner' }} />
      <Tabs.Screen name="split" options={{ title: 'Split', tabBarLabel: 'Split' }} />
      <Tabs.Screen name="advisor" options={{ title: 'Advisor', tabBarLabel: 'Advisor' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarLabel: 'Profile' }} />
    </Tabs>
  );
}

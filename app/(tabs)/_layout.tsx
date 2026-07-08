import { MaterialIcons } from '@expo/vector-icons';
import { NavigationBar } from 'expo-navigation-bar';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { ColorValue } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { themeColors } from '@/src/theme/colors';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

function tabIcon(name: MaterialIconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialIcons name={name} size={size} color={color as string} />
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = themeColors(isDark);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Dark app chrome → light button icons; light chrome → dark button icons
    NavigationBar.setStyle(isDark ? 'light' : 'dark');
  }, [isDark]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 60,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
          elevation: 0,
        },
        // Use colors.card everywhere so header, tab bar, status bar & nav bar all match
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarLabel: 'Home', headerTitle: 'Dashboard', tabBarIcon: tabIcon('home') }}
      />
      <Tabs.Screen
        name="expenses"
        options={{ title: 'Expenses', tabBarLabel: 'Expenses', tabBarIcon: tabIcon('receipt-long') }}
      />
      <Tabs.Screen
        name="planner"
        options={{ title: 'Planner', tabBarLabel: 'Planner', tabBarIcon: tabIcon('calendar-today') }}
      />
      <Tabs.Screen
        name="split"
        options={{ title: 'Split', tabBarLabel: 'Split', tabBarIcon: tabIcon('call-split') }}
      />
      <Tabs.Screen
        name="advisor"
        options={{ title: 'Advisor', tabBarLabel: 'Advisor', tabBarIcon: tabIcon('smart-toy') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarLabel: 'Profile', tabBarIcon: tabIcon('person') }}
      />
    </Tabs>
  );
}

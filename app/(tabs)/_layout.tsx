import { MaterialIcons } from '@expo/vector-icons';
import { NavigationBar } from 'expo-navigation-bar';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Text, useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import { themeColors } from '@/src/theme/colors';
import {
  buildTabBarItemStyle,
  buildTabBarLabelStyle,
  buildTabBarStyle,
} from '@/src/theme/tabBar';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

function tabIcon(name: MaterialIconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialIcons name={name} size={Math.min(size, 22)} color={color as string} />
  );
}

function tabLabel(label: string, fontSize: number) {
  return ({ color }: { color: ColorValue }) => (
    <Text
      style={{
        color: color as string,
        fontSize,
        fontWeight: '600',
        textAlign: 'center',
        width: '100%',
        paddingHorizontal: 1,
      }}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      allowFontScaling={false}
    >
      {label}
    </Text>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = themeColors(isDark);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const labelSize = width < 380 ? 9 : width < 420 ? 10 : 11;

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
        tabBarStyle: buildTabBarStyle(colors, insets.bottom),
        tabBarLabelStyle: buildTabBarLabelStyle(width),
        tabBarItemStyle: buildTabBarItemStyle(width),
        tabBarIconStyle: { marginTop: 2 },
        tabBarAllowFontScaling: false,
        tabBarHideOnKeyboard: true,
        // Use colors.card everywhere so header, tab bar, status bar & nav bar all match
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: tabLabel('Home', labelSize),
          headerTitle: 'Dashboard',
          tabBarIcon: tabIcon('home'),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarLabel: tabLabel('Expenses', labelSize),
          tabBarIcon: tabIcon('receipt-long'),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: 'Planner',
          tabBarLabel: tabLabel('Planner', labelSize),
          tabBarIcon: tabIcon('calendar-today'),
        }}
      />
      <Tabs.Screen
        name="split"
        options={{
          title: 'Split',
          tabBarLabel: tabLabel('Split', labelSize),
          tabBarIcon: tabIcon('call-split'),
        }}
      />
      <Tabs.Screen
        name="advisor"
        options={{
          title: 'Advisor',
          tabBarLabel: tabLabel('Advisor', labelSize),
          tabBarIcon: tabIcon('smart-toy'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: tabLabel('Profile', labelSize),
          tabBarIcon: tabIcon('person'),
        }}
      />
    </Tabs>
  );
}

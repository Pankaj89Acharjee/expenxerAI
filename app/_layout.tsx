import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { useColorScheme } from '@/components/useColorScheme';
import { themeColors } from '@/src/theme/colors';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync(); // Prevent the splash screen from automatically hiding

// Login screen always uses this dark background
const LOGIN_BG = '#000000';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const init = useFinancialStore((s) => s.init);
  const initialized = useFinancialStore((s) => s.initialized);
  const currentUserEmail = useFinancialStore((s) => s.currentUserEmail);
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = themeColors(isDark);

  const isOnLogin = segments[0] === 'login';

  // System nav bar edge-to-edge background: black on login, card color on tabs
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const bg = isOnLogin ? LOGIN_BG : colors.card; // Set the background color of the system navigation bar to the card color
    SystemUI.setBackgroundColorAsync(bg);
  }, [isOnLogin, colors.card]);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (loaded && initialized) {
      SplashScreen.hideAsync();
    }
  }, [loaded, initialized]);

  useEffect(() => {
    if (!initialized) return;
    const inLogin = segments[0] === 'login';
    if (!currentUserEmail && !inLogin) {
      router.replace('/login');
    } else if (currentUserEmail && inLogin) {
      router.replace('/(tabs)');
    }
  }, [currentUserEmail, initialized, segments, router]);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <StatusBar
          barStyle={isOnLogin || isDark ? 'light-content' : 'dark-content'}
          backgroundColor={isOnLogin ? LOGIN_BG : colors.card}
          translucent={false}
        />
        {!loaded || !initialized ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: LOGIN_BG }}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false }}>
            {/* Login is always dark regardless of system theme */}
            <Stack.Screen
              name="login"
              options={{ contentStyle: { backgroundColor: LOGIN_BG } }}
            />
            <Stack.Screen
              name="invite/[code]"
              options={{ contentStyle: { backgroundColor: LOGIN_BG } }}
            />
            {/* Tabs follow the system dark/light theme */}
            <Stack.Screen
              name="(tabs)"
              options={{ contentStyle: { backgroundColor: colors.card } }}
            />
          </Stack>
        )}
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

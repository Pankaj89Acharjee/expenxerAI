import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import { useColorScheme } from '@/components/useColorScheme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

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
  const colors = themeColors(colorScheme === 'dark');

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

  if (!loaded || !initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}

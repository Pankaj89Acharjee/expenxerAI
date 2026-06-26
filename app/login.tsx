import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  type TextInputProps,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import { isFirebaseConfigured } from '@/src/config/firebase';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function InputField({
  icon,
  colors,
  ...props
}: {
  icon: ReactNode;
  colors: ReturnType<typeof themeColors>;
} & TextInputProps) {
  return (
    <View style={styles.inputRow}>
      <View style={styles.inputIcon}>{icon}</View>
      <TextInput
        style={[styles.inputInner, { color: colors.text }]}
        placeholderTextColor={colors.textMuted}
        {...props}
      />
    </View>
  );
}

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const insets = useSafeAreaInsets();
  const registerAccount = useFinancialStore((s) => s.registerAccount);
  const signInAccount = useFinancialStore((s) => s.signInAccount);

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [income, setIncome] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const firebaseReady = isFirebaseConfigured();

  const switchMode = (next: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setIsRegisterMode(next);
  };

  const handleSubmit = async () => {
    if (!firebaseReady) {
      setErrorMessage('Firebase is not configured. Add keys to your .env file (see .env.example).');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please fill in all details.');
      return;
    }
    if (isRegisterMode && (!displayName.trim() || !income.trim())) {
      setErrorMessage('Please fill in all details.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please enter a valid email.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    const incomeValue = parseFloat(income);
    if (isRegisterMode && (isNaN(incomeValue) || incomeValue <= 0)) {
      setErrorMessage('Please enter a valid monthly income.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const error = isRegisterMode
      ? await registerAccount(email, password, displayName, incomeValue)
      : await signInAccount(email, password);

    if (error) setErrorMessage(error);
    setIsLoading(false);
  };

  return (
    <KeyboardAwareScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={24}
    >
      <LinearGradient
        colors={[colors.primary, colors.onPrimary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.brandIcon}
      >
        <Text style={styles.brandEmoji}>✨</Text>
      </LinearGradient>

      <Text style={[styles.title, { color: colors.text }]}>Expenxer</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Intelligent Wealth Management & Analysis
      </Text>

      {!firebaseReady && (
        <View style={[styles.configBanner, { backgroundColor: colors.errorContainer }]}>
          <Text style={[styles.configBannerText, { color: colors.error }]}>
            Firebase keys missing. Copy .env.example → .env and add your Firebase web config.
          </Text>
        </View>
      )}

      <View style={[styles.modeCard, { backgroundColor: colors.surfaceVariant }]}>
        <Pressable
          style={[styles.modeBtn, !isRegisterMode && { backgroundColor: colors.primary }]}
          onPress={() => switchMode(false)}
        >
          <Text style={[styles.modeText, { color: !isRegisterMode ? '#000' : colors.textMuted }]}>
            Sign In
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeBtn, isRegisterMode && { backgroundColor: colors.primary }]}
          onPress={() => switchMode(true)}
        >
          <Text style={[styles.modeText, { color: isRegisterMode ? '#000' : colors.textMuted }]}>
            Register
          </Text>
        </Pressable>
      </View>

      <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {isRegisterMode && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
            <InputField
              colors={colors}
              icon={<MaterialIcons name="face" size={22} color={colors.textMuted} />}
              placeholder="Display Name"
              value={displayName}
              onChangeText={setDisplayName}
              returnKeyType="next"
            />
          </Animated.View>
        )}

        <InputField
          colors={colors}
          icon={<MaterialIcons name="email" size={22} color={colors.textMuted} />}
          placeholder="Email Address"
          value={email}
          onChangeText={(t) => { setEmail(t); setErrorMessage(null); }}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="next"
        />

        <InputField
          colors={colors}
          icon={<MaterialIcons name="lock" size={22} color={colors.textMuted} />}
          placeholder="Password (min 6 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType={isRegisterMode ? 'next' : 'done'}
        />

        {isRegisterMode && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
            <InputField
              colors={colors}
              icon={<Text style={[styles.rupeeIcon, { color: colors.textMuted }]}>₹</Text>}
              placeholder="Monthly Net Income (₹)"
              value={income}
              onChangeText={setIncome}
              keyboardType="numeric"
              returnKeyType="done"
            />
          </Animated.View>
        )}

        {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.primaryBtnText}>
                {isRegisterMode ? 'Create Account' : 'Sign In Securely'}
              </Text>
          }
        </Pressable>
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  brandEmoji: { fontSize: 32 },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  configBanner: { borderRadius: 12, padding: 12, marginBottom: 16 },
  configBannerText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  modeCard: { flexDirection: 'row', borderRadius: 20, padding: 6, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 12, borderRadius: 15, alignItems: 'center' },
  modeText: { fontWeight: '700' },
  formCard: { borderRadius: 20, padding: 20, borderWidth: 1, gap: 12 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    minHeight: 48,
  },
  inputIcon: { width: 28, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  inputInner: { flex: 1, fontSize: 15, paddingVertical: 4 },
  rupeeIcon: { fontSize: 20, fontWeight: '700' },
  error: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

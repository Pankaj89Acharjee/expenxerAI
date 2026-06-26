import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import { isFirebaseConfigured } from '@/src/config/firebase';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';

const SCROLL_ABOVE_FIELD = 16;

function InputField({
  icon,
  colors,
  containerRef,
  onInputFocus,
  style,
  onFocus,
  ...props
}: {
  icon: ReactNode;
  colors: ReturnType<typeof themeColors>;
  containerRef?: React.RefObject<View | null>;
  onInputFocus?: () => void;
} & TextInputProps) {
  const handleFocus: TextInputProps['onFocus'] = (event) => {
    onInputFocus?.();
    onFocus?.(event);
  };

  return (
    <View ref={containerRef} style={styles.inputRow} collapsable={false}>
      <View style={styles.inputIcon}>{icon}</View>
      <TextInput
        style={[styles.inputInner, { color: colors.text }, style]}
        placeholderTextColor={colors.textMuted}
        onFocus={handleFocus}
        {...props}
      />
    </View>
  );
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function setRegisterModeAnimated(next: boolean, setter: (value: boolean) => void) {
  LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
  setter(next);
}

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const insets = useSafeAreaInsets();
  const registerAccount = useFinancialStore((s) => s.registerAccount);
  const signInAccount = useFinancialStore((s) => s.signInAccount);

  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const focusedFieldRef = useRef<View | null>(null);
  const scrollOffsetY = useRef(0);

  const displayNameRef = useRef<View>(null);
  const emailRef = useRef<View>(null);
  const passwordRef = useRef<View>(null);
  const incomeRef = useRef<View>(null);

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [income, setIncome] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const firebaseReady = isFirebaseConfigured();

  const scrollFocusedField = useCallback((field: View, keyboardInset = keyboardHeight) => {
    const content = contentRef.current;
    if (!content) return;

    field.measureLayout(
      content,
      (_left, top) => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, top - SCROLL_ABOVE_FIELD),
          animated: true,
        });
      },
      () => {
        field.measureInWindow((_x, windowY, _width, fieldHeight) => {
          const visibleHeight = Dimensions.get('window').height - keyboardInset - insets.bottom;
          const fieldBottom = windowY + fieldHeight;
          if (fieldBottom > visibleHeight - SCROLL_ABOVE_FIELD) {
            const overlap = fieldBottom - visibleHeight + SCROLL_ABOVE_FIELD;
            scrollRef.current?.scrollTo({
              y: scrollOffsetY.current + overlap,
              animated: true,
            });
          }
        });
      }
    );
  }, [insets.bottom, keyboardHeight]);

  const scrollFieldIntoView = useCallback(
    (fieldRef: React.RefObject<View | null>) => {
      const field = fieldRef.current;
      if (!field) return;
      focusedFieldRef.current = field;
      requestAnimationFrame(() => {
        setTimeout(() => scrollFocusedField(field), Platform.OS === 'ios' ? 80 : 40);
      });
    },
    [scrollFocusedField]
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const nextHeight = event.endCoordinates.height;
      setKeyboardHeight(nextHeight);
      if (focusedFieldRef.current) {
        setTimeout(() => scrollFocusedField(focusedFieldRef.current!, nextHeight), Platform.OS === 'ios' ? 50 : 80);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollFocusedField]);

  const handleSubmit = async () => {
    if (!firebaseReady) {
      setErrorMessage('Firebase is not configured. Add keys to your .env file (see .env.example).');
      return;
    }
    if (!email.trim() || !password.trim() || (isRegisterMode && (!displayName.trim() || !income.trim()))) {
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

    setIsLoading(true);
    setErrorMessage(null);

    const error = isRegisterMode
      ? await registerAccount(email, password, displayName, parseFloat(income) || 5000)
      : await signInAccount(email, password);

    if (error) setErrorMessage(error);
    setIsLoading(false);
  };

  const bottomPadding = insets.bottom + 32 + keyboardHeight;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 16,
            paddingBottom: bottomPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        automaticallyAdjustKeyboardInsets
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          scrollOffsetY.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View ref={contentRef} collapsable={false}>
        <LinearGradient
          colors={[colors.primary, colors.onPrimary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.brandIcon}
        >
          <Text style={styles.brandEmoji}>✨</Text>
        </LinearGradient>
        <Text style={[styles.title, { color: colors.text }]}>Expenxer</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Intelligent Wealth Management & Analysis</Text>

        {!firebaseReady && (
          <View style={[styles.configBanner, { backgroundColor: colors.errorContainer }]}>
            <Text style={[styles.configBannerText, { color: colors.error }]}>
              Firebase keys missing. Copy .env.example → .env and add your Firebase web config.
            </Text>
          </View>
        )}

        <View style={[styles.modeCard, { backgroundColor: colors.surfaceVariant }]}>
          <Pressable style={[styles.modeBtn, !isRegisterMode && { backgroundColor: colors.primary }]} onPress={() => setRegisterModeAnimated(false, setIsRegisterMode)}>
            <Text style={[styles.modeText, { color: !isRegisterMode ? '#000' : colors.textMuted }]}>Sign In</Text>
          </Pressable>
          <Pressable style={[styles.modeBtn, isRegisterMode && { backgroundColor: colors.primary }]} onPress={() => setRegisterModeAnimated(true, setIsRegisterMode)}>
            <Text style={[styles.modeText, { color: isRegisterMode ? '#000' : colors.textMuted }]}>Register</Text>
          </Pressable>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {isRegisterMode && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
              <InputField
                colors={colors}
                containerRef={displayNameRef}
                onInputFocus={() => scrollFieldIntoView(displayNameRef)}
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
            containerRef={emailRef}
            onInputFocus={() => scrollFieldIntoView(emailRef)}
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
            containerRef={passwordRef}
            onInputFocus={() => scrollFieldIntoView(passwordRef)}
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
                containerRef={incomeRef}
                onInputFocus={() => scrollFieldIntoView(incomeRef)}
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
          <Pressable style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleSubmit} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>{isRegisterMode ? 'Create Account' : 'Sign In Securely'}</Text>}
          </Pressable>
        </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  brandIcon: { width: 64, height: 64, borderRadius: 16, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
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

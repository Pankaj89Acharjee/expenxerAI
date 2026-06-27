import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isFirebaseConfigured } from '@/src/config/firebase';
import { useFinancialStore } from '@/src/store/useFinancialStore';

// ─── Palette ───────────────────────────────────────────────────────────────
const P = {
  bg: '#000000',
  surface: 'rgba(255,255,255,0.055)',
  border: 'rgba(255,255,255,0.09)',
  borderFocus: '#10B981',
  text: '#F1F5F9',
  textMuted: '#64748B',
  textDim: '#94A3B8',
  green1: '#047857',
  green2: '#059669',
  green3: '#10B981',
  green4: '#34D399',
  error: '#FCA5A5',
  errorBg: 'rgba(127,29,29,0.35)',
  errorBorder: 'rgba(248,113,113,0.4)',
};

// ─── Feature cards ─────────────────────────────────────────────────────────
const FEATURES = [
  { icon: 'analytics' as const,     accent: '#10B981', title: 'Spend Analysis',    desc: 'Daily trends & category breakdowns tailored to your habits.' },
  { icon: 'smart-toy' as const,     accent: '#06B6D4', title: 'AI Coach',          desc: 'Gemini-powered advisor with full context of your finances.' },
  { icon: 'shield' as const,        accent: '#8B5CF6', title: 'Savings Guardian',  desc: 'Goals, alerts & proactive budget monitoring in one view.' },
  { icon: 'flight-takeoff' as const, accent: '#F59E0B', title: 'Trip Management',  desc: 'Plan trips, set travel budgets and track every expense.' },
  { icon: 'call-split' as const,    accent: '#EC4899', title: 'Bill Splitting',    desc: 'Fairly split group expenses and settle up effortlessly.' },
];

const CARD_W = 220;
const CARD_GAP = 12;
const SCROLL_INTERVAL = 3000;

function FeatureCard({ icon, accent, title, desc }: typeof FEATURES[0]) {
  return (
    <View style={[styles.featureCard, { borderColor: `${accent}30` }]}>
      <LinearGradient
        colors={[`${accent}22`, `${accent}08`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.featureIconWrap}
      >
        <MaterialIcons name={icon} size={26} color={accent} />
      </LinearGradient>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDesc}>{desc}</Text>
    </View>
  );
}

function FeaturesStrip() {
  const scrollRef = useRef<ScrollView>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    const t = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % FEATURES.length;
      scrollRef.current?.scrollTo({
        x: idxRef.current * (CARD_W + CARD_GAP),
        animated: true,
      });
    }, SCROLL_INTERVAL);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={styles.featuresSection}>
      <Text style={styles.featuresSectionLabel}>✦ What you get</Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.featuresScroll}
        decelerationRate="fast"
        snapToInterval={CARD_W + CARD_GAP}
        snapToAlignment="start"
      >
        {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
      </ScrollView>
    </View>
  );
}

// ─── Input ─────────────────────────────────────────────────────────────────
function InputRow({
  icon,
  showToggle,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  returnKeyType,
  autoCapitalize,
  secureTextEntry: _secure,
}: {
  icon: React.ReactNode;
  showToggle?: boolean;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  returnKeyType?: React.ComponentProps<typeof TextInput>['returnKeyType'];
  autoCapitalize?: React.ComponentProps<typeof TextInput>['autoCapitalize'];
  secureTextEntry?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(showToggle ?? false);

  return (
    <View
      style={[
        styles.inputShell,
        { borderColor: focused ? P.borderFocus : P.border },
      ]}
    >
      <View style={styles.inputLeadIcon}>{icon}</View>
      <TextInput
        style={styles.inputText}
        placeholder={placeholder}
        placeholderTextColor={P.textMuted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={showToggle ? hidden : _secure}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        autoCapitalize={autoCapitalize ?? 'none'}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showToggle && (
        <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} style={styles.eyeBtn}>
          <MaterialIcons
            name={hidden ? 'visibility-off' : 'visibility'}
            size={20}
            color={P.textMuted}
          />
        </Pressable>
      )}
    </View>
  );
}

// ─── Error banner ──────────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  return (
    <View style={styles.errorBanner}>
      <MaterialIcons name="error-outline" size={18} color={P.error} />
      <Text style={styles.errorText}>{msg}</Text>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const registerAccount = useFinancialStore((s) => s.registerAccount);
  const signInAccount   = useFinancialStore((s) => s.signInAccount);

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [name, setName]             = useState('');
  const [income, setIncome]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const firebaseReady = isFirebaseConfigured();

  const switchMode = (next: boolean) => {
    setIsRegister(next);
    setError(null);
  };

  const submit = async () => {
    if (!firebaseReady) { setError('Firebase not configured — add EXPO_PUBLIC_FIREBASE_* to your .env.'); return; }
    if (!email.trim() || !password.trim()) { setError('Please fill in all details.'); return; }
    if (isRegister && (!name.trim() || !income.trim())) { setError('Please fill in all details.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    const incomeVal = parseFloat(income);
    if (isRegister && (isNaN(incomeVal) || incomeVal <= 0)) { setError('Please enter a valid monthly income.'); return; }

    setLoading(true);
    setError(null);
    const err = isRegister
      ? await registerAccount(email, password, name, incomeVal)
      : await signInAccount(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <View style={styles.root}>
      {/* Gemini-style layered gradient background */}
      <LinearGradient
        colors={['#000000', '#010a06', '#021208', '#030d08', '#000000']}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(4,120,87,0.22)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.glowTL}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(6,95,70,0.18)']}
        start={{ x: 0.4, y: 0.4 }}
        end={{ x: 1, y: 1 }}
        style={styles.glowBR}
        pointerEvents="none"
      />

      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
        extraKeyboardSpace={16}
      >
          {/* Hero */}
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={[P.green1, P.green3, P.green4]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandIcon}
            >
              <Text style={styles.brandEmoji}>✨</Text>
            </LinearGradient>
            <Text style={styles.title}>Expenxer</Text>
            <Text style={styles.subtitle}>Intelligent Wealth Management & Analysis</Text>
          </View>

          {/* Features strip */}
          <FeaturesStrip />

          {/* Auth card */}
          <View style={styles.authCard}>
            {/* Mode tabs */}
            <View style={styles.modePill}>
              <Pressable
                style={[styles.modeBtn, !isRegister && styles.modeBtnActive]}
                onPress={() => switchMode(false)}
              >
                <Text style={[styles.modeTxt, !isRegister && styles.modeTxtActive]}>Sign In</Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, isRegister && styles.modeBtnActive]}
                onPress={() => switchMode(true)}
              >
                <Text style={[styles.modeTxt, isRegister && styles.modeTxtActive]}>Register</Text>
              </Pressable>
            </View>

            {/* Input fields — plain Views, no enter/exit animations near inputs */}
            {isRegister && (
              <View>
                <InputRow
                  icon={<MaterialIcons name="face" size={20} color={P.textMuted} />}
                  placeholder="Display Name"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            )}

            <InputRow
              icon={<MaterialIcons name="email" size={20} color={P.textMuted} />}
              placeholder="Email Address"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(null); }}
              keyboardType="email-address"
              returnKeyType="next"
            />

            <InputRow
              icon={<MaterialIcons name="lock" size={20} color={P.textMuted} />}
              placeholder="Password (min 6 characters)"
              value={password}
              onChangeText={setPassword}
              showToggle
              returnKeyType={isRegister ? 'next' : 'done'}
            />

            {isRegister && (
              <View>
                <InputRow
                  icon={<Text style={styles.rupeeIcon}>₹</Text>}
                  placeholder="Monthly Net Income (₹)"
                  value={income}
                  onChangeText={setIncome}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
              </View>
            )}

            {error && <ErrorBanner msg={error} />}

            {/* CTA */}
            <Pressable onPress={submit} disabled={loading} style={styles.ctaWrap}>
              <LinearGradient
                colors={loading ? [P.green1, P.green2] : [P.green2, P.green3, P.green4]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaBtn}
              >
                {loading
                  ? <ActivityIndicator color="#022C22" />
                  : <Text style={styles.ctaTxt}>
                      {isRegister ? 'Create Account' : 'Sign In Securely'}
                    </Text>}
              </LinearGradient>
            </Pressable>
          </View>

          {/* Trust footer */}
          <View style={styles.footer}>
            <View style={styles.footerDivider} />
            <MaterialIcons name="code" size={13} color="rgba(148,163,184,0.5)" />
            <Text style={styles.footerTxt}>Tailored Engineering By Pankaj</Text>
          </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20 },

  // glows
  glowTL: { position: 'absolute', top: '-5%', left: '-15%', width: '80%', height: '45%', borderRadius: 999 },
  glowBR: { position: 'absolute', bottom: '-5%', right: '-10%', width: '75%', height: '50%', borderRadius: 999 },

  // hero
  heroWrap: { alignItems: 'center', marginBottom: 24 },
  brandIcon: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: P.green3, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 10,
  },
  brandEmoji: { fontSize: 34 },
  title: { fontSize: 30, fontWeight: '800', color: P.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: P.textMuted, marginTop: 6, textAlign: 'center' },

  // features
  featuresSection: { marginBottom: 22 },
  featuresSectionLabel: { color: P.green4, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 12, marginLeft: 2 },
  featuresScroll: { paddingRight: 20, gap: CARD_GAP, flexDirection: 'row' },
  featureCard: {
    width: CARD_W, borderRadius: 18, padding: 16,
    backgroundColor: P.surface, borderWidth: 1,
  },
  featureIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  featureTitle: { fontSize: 14, fontWeight: '800', color: P.text, marginBottom: 6 },
  featureDesc: { fontSize: 12, color: P.textDim, lineHeight: 18 },

  // auth card
  authCard: {
    backgroundColor: P.surface, borderRadius: 24,
    borderWidth: 1, borderColor: P.border,
    padding: 20, gap: 12, marginBottom: 16,
  },

  // mode tabs
  modePill: {
    flexDirection: 'row', borderRadius: 14, padding: 4,
    backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: P.border,
  },
  modeBtn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  modeBtnActive: { backgroundColor: 'rgba(16,185,129,0.2)' },
  modeTxt: { fontWeight: '700', fontSize: 14, color: P.textMuted },
  modeTxtActive: { color: P.green4 },

  // inputs
  inputShell: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 14, minHeight: 52,
  },
  inputLeadIcon: { marginRight: 10 },
  inputText: { flex: 1, fontSize: 15, color: P.text, paddingVertical: 12 },
  eyeBtn: { padding: 4, marginLeft: 4 },
  rupeeIcon: { fontSize: 19, fontWeight: '700', color: P.textMuted },

  // error banner
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9,
    backgroundColor: P.errorBg, borderWidth: 1, borderColor: P.errorBorder,
    borderRadius: 12, padding: 12,
  },
  errorText: { flex: 1, color: P.error, fontSize: 13, fontWeight: '600', lineHeight: 19 },

  // cta
  ctaWrap: { borderRadius: 14, overflow: 'hidden', marginTop: 2 },
  ctaBtn: { paddingVertical: 15, alignItems: 'center', borderRadius: 14 },
  ctaTxt: { color: '#022C22', fontWeight: '800', fontSize: 16 },

  // footer
  footer: { alignItems: 'center', gap: 7, marginTop: 8 },
  footerDivider: { width: 40, height: 1, backgroundColor: 'rgba(148,163,184,0.2)' },
  footerTxt: { color: 'rgba(148,163,184,0.6)', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
});

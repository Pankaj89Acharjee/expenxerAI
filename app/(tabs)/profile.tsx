import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { INDIAN_STATES } from '@/src/constants/indianStates';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import type { UserProfile } from '@/src/types/models';
import { formatCurrency } from '@/src/utils/format';

type FieldProps = {
  label: string;
  hint?: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  colors: ReturnType<typeof themeColors>;
  children: React.ReactNode;
};

function ProfileField({ label, hint, icon, colors, children }: FieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldLabelRow}>
        <View style={[styles.fieldIconWrap, { backgroundColor: colors.emeraldSoft }]}>
          <MaterialIcons name={icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.fieldLabelText}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
          {hint ? <Text style={[styles.fieldHint, { color: colors.textMuted }]}>{hint}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function SectionTitle({ title, colors }: { title: string; colors: ReturnType<typeof themeColors> }) {
  return <Text style={[styles.sectionTitle, { color: colors.primary }]}>{title}</Text>;
}

const SAVINGS_MIN = 5;
const SAVINGS_MAX = 50;
const BAR_H = 34;
const N_DOTS = 13;

function SavingsRateBar({
  value,
  onChange,
  colors,
  monthlyIncome,
  isDark,
}: {
  value: number;
  onChange: (v: number) => void;
  colors: ReturnType<typeof themeColors>;
  monthlyIncome: number;
  isDark: boolean;
}) {
  const palette = {
    shell:          isDark ? '#1A1D2E' : '#EEF2F7',
    active:         isDark ? '#4ECB90' : '#10B981',
    inactive:       isDark ? '#2E3044' : '#CBD5E1',
    dotOnActive:    'rgba(255,255,255,0.55)',
    dotOnInactive:  isDark ? '#4ECB90' : '#047857',
    divider:        '#ffffff',
  };

  const fillRatio    = (value - SAVINGS_MIN) / (SAVINGS_MAX - SAVINGS_MIN);
  const fillPct      = Math.round(fillRatio * 100);
  const fillWidthPct = `${fillPct}%` as `${number}%`;

  return (
    <View style={[styles.savingsShell, { backgroundColor: palette.shell }]}>
      {/* Header */}
      <View style={styles.savingsBarHeader}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>Target Savings Rate</Text>
        <Text style={[styles.savingsPercent, { color: palette.active }]}>{value}%</Text>
      </View>
      <Text style={[styles.fieldHint, { color: colors.textMuted, marginBottom: 14 }]}>
        Monthly target: {formatCurrency(monthlyIncome * (value / 100))}
      </Text>

      {/* Pill track — visual + interaction in one container */}
      <View style={styles.pillWrapper}>
        {/* Inactive background */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.inactive, borderRadius: BAR_H / 2 }]} />

        {/* Active fill */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { width: fillWidthPct, backgroundColor: palette.active, borderRadius: BAR_H / 2 },
          ]}
        />

        {/* Dots — evenly spaced, color flips at fill boundary */}
        <View style={[StyleSheet.absoluteFill, styles.dotsRow]} pointerEvents="none">
          {Array.from({ length: N_DOTS }, (_, i) => {
            const dotRatio = i / (N_DOTS - 1);
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      dotRatio < fillRatio
                        ? palette.dotOnActive
                        : palette.dotOnInactive,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Divider line at fill boundary */}
        <View
          pointerEvents="none"
          style={[
            styles.pillDivider,
            { left: fillWidthPct, backgroundColor: palette.divider },
          ]}
        />

        {/* Native slider — fills pill exactly, thumb hidden (divider is the handle) */}
        <Slider
          style={StyleSheet.absoluteFill}
          minimumValue={SAVINGS_MIN}
          maximumValue={SAVINGS_MAX}
          step={1}
          value={value}
          onValueChange={onChange}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="transparent"
        />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const profile = useFinancialStore((s) => s.userProfile);
  const updateProfile = useFinancialStore((s) => s.updateProfile);
  const uploadProfilePhoto = useFinancialStore((s) => s.uploadProfilePhoto);
  const logout = useFinancialStore((s) => s.logout);

  const [form, setForm] = useState<UserProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setForm({ ...profile });
  }, [profile]);

  const stateSuggestions = useMemo(() => {
    const q = (form?.state ?? '').trim().toLowerCase();
    if (!q) return [];
    return INDIAN_STATES.filter((s) => s.toLowerCase().includes(q)).slice(0, 5);
  }, [form?.state]);

  const patch = (updates: Partial<UserProfile>) => {
    setForm((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    await updateProfile(form);
    setSaving(false);
    Alert.alert('Saved', 'Profile updated and synced to your account.');
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to set your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    setUploading(true);
    const error = await uploadProfilePhoto(result.assets[0].uri);
    setUploading(false);

    if (error) {
      Alert.alert('Upload failed', error);
    }
  };

  const handleDetectLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to auto-fill your address.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(position.coords);
      if (!place) {
        Alert.alert('Location unavailable', 'Could not resolve your address. Enter it manually.');
        return;
      }

      const line = [place.name, place.street, place.streetNumber].filter(Boolean).join(', ');
      patch({
        addressLine: line || form?.addressLine || null,
        town: place.city || place.subregion || form?.town || null,
        district: place.district || place.subregion || form?.district || null,
        state: place.region || form?.state || null,
        pinCode: place.postalCode || form?.pinCode || null,
      });
      Alert.alert('Location detected', 'Town, district, state and PIN were filled from your device.');
    } catch {
      Alert.alert('Location error', 'Could not detect location. Please enter details manually.');
    } finally {
      setLocating(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (!form) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceVariant }];

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        {/* Photo hero */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={() => form.photoUrl && setPreviewOpen(true)} onLongPress={handlePickPhoto}>
            <View style={styles.avatarRing}>
              {form.photoUrl ? (
                <Image source={{ uri: form.photoUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, { backgroundColor: colors.emeraldSoft }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {form.displayName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              {uploading && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="photo-camera" size={16} color="#fff" />
              </View>
            </View>
          </Pressable>

          <Text style={[styles.heroName, { color: colors.text }]}>{form.displayName}</Text>
          {form.designation ? (
            <Text style={[styles.heroRole, { color: colors.textMuted }]}>{form.designation}</Text>
          ) : null}
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{form.email}</Text>

          <View style={styles.heroActions}>
            <Pressable
              style={[styles.heroBtn, { borderColor: colors.border }]}
              onPress={() => form.photoUrl && setPreviewOpen(true)}
              disabled={!form.photoUrl}
            >
              <MaterialIcons name="zoom-in" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Preview</Text>
            </Pressable>
            <Pressable
              style={[styles.heroBtn, { backgroundColor: colors.primary }]}
              onPress={handlePickPhoto}
              disabled={uploading}
            >
              <MaterialIcons name="collections" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600' }}>{uploading ? 'Uploading…' : 'Gallery'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Personal */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SectionTitle title="Personal details" colors={colors} />

          <ProfileField label="Name" hint="Enter your name or nick name" icon="badge" colors={colors}>
            <TextInput style={inputStyle} value={form.displayName} onChangeText={(t) => patch({ displayName: t })} placeholder="Your full name" placeholderTextColor={colors.textMuted} />
          </ProfileField>

          <ProfileField label="Designation" hint="What do you do for a living?" icon="work-outline" colors={colors}>
            <TextInput style={inputStyle} value={form.designation ?? ''} onChangeText={(t) => patch({ designation: t || null })} placeholder="e.g. Software Engineer" placeholderTextColor={colors.textMuted} />
          </ProfileField>

          <ProfileField label="Email" hint="Valid email address" icon="email" colors={colors}>
            <TextInput style={[inputStyle, styles.readOnly]} value={form.email} editable={false} />
          </ProfileField>

          <ProfileField label="Phone" hint="Used so others can find you in Split" icon="phone" colors={colors}>
            <TextInput
              style={inputStyle}
              value={form.phoneNumber ?? ''}
              onChangeText={(t) => patch({ phoneNumber: t || null })}
              placeholder="e.g. 9876543210"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />
          </ProfileField>
        </View>

        {/* Financial */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SectionTitle title="Financial Details" colors={colors} />

          <ProfileField label="Monthly net income" hint="Your monthly income and target savings" icon="payments" colors={colors}>
            <TextInput style={inputStyle} value={String(form.monthlyIncome)} onChangeText={(t) => patch({ monthlyIncome: parseFloat(t) || 0 })} keyboardType="numeric" placeholder="₹ amount" placeholderTextColor={colors.textMuted} />
          </ProfileField>

          <SavingsRateBar
            value={form.baseSavingsRatePercent}
            onChange={(v) => patch({ baseSavingsRatePercent: v })}
            colors={colors}
            monthlyIncome={form.monthlyIncome}
            isDark={colorScheme === 'dark'}
          />

          <ProfileField label="Split your expense" hint="Optional — Splitwise / group bill ID or username" icon="call-split" colors={colors}>
            <TextInput style={inputStyle} value={form.splitwiseHandle ?? ''} onChangeText={(t) => patch({ splitwiseHandle: t || null })} placeholder="@username or group link" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
          </ProfileField>
        </View>

        {/* Alerts */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SectionTitle title="Notifications" colors={colors} />
          <View style={[styles.switchCard, { backgroundColor: colors.surfaceVariant }]}>
            <View style={[styles.fieldIconWrap, { backgroundColor: colors.emeraldSoft }]}>
              <MaterialIcons name="notifications-active" size={18} color={colors.primary} />
            </View>
            <View style={styles.switchCopy}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Alert Me</Text>
              <Text style={[styles.fieldHint, { color: colors.textMuted }]}>Alerts will be sent when budgets are exceeded</Text>
            </View>
            <Switch value={form.alertPreference} onValueChange={(v) => patch({ alertPreference: v })} trackColor={{ true: colors.primary }} />
          </View>
        </View>

        {/* Location */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.locationHeader}>
            <SectionTitle title="Location" colors={colors} />
            <Pressable style={[styles.detectBtn, { backgroundColor: colors.emeraldSoft }]} onPress={handleDetectLocation} disabled={locating}>
              {locating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <MaterialIcons name="my-location" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Auto-detect</Text>
                </>
              )}
            </Pressable>
          </View>

          <ProfileField label="Address" hint="Street / locality" icon="home" colors={colors}>
            <TextInput style={inputStyle} value={form.addressLine ?? ''} onChangeText={(t) => patch({ addressLine: t || null })} placeholder="House no., street, area" placeholderTextColor={colors.textMuted} />
          </ProfileField>

          <ProfileField label="Town / city" icon="location-city" colors={colors}>
            <TextInput style={inputStyle} value={form.town ?? ''} onChangeText={(t) => patch({ town: t || null })} placeholder="Town or city name" placeholderTextColor={colors.textMuted} />
          </ProfileField>

          <ProfileField label="Police station" hint="Optional — nearest PS for locality" icon="local-police" colors={colors}>
            <TextInput style={inputStyle} value={form.policeStation ?? ''} onChangeText={(t) => patch({ policeStation: t || null })} placeholder="Police station name" placeholderTextColor={colors.textMuted} />
          </ProfileField>

          <ProfileField label="District" icon="map" colors={colors}>
            <TextInput style={inputStyle} value={form.district ?? ''} onChangeText={(t) => patch({ district: t || null })} placeholder="District" placeholderTextColor={colors.textMuted} />
          </ProfileField>

          <ProfileField label="PIN code" icon="pin" colors={colors}>
            <TextInput style={inputStyle} value={form.pinCode ?? ''} onChangeText={(t) => patch({ pinCode: t || null })} keyboardType="number-pad" placeholder="6-digit PIN" placeholderTextColor={colors.textMuted} maxLength={6} />
          </ProfileField>

          <ProfileField label="State" hint="Type to search or use Auto-detect" icon="public" colors={colors}>
            <TextInput style={inputStyle} value={form.state ?? ''} onChangeText={(t) => patch({ state: t || null })} placeholder="State" placeholderTextColor={colors.textMuted} />
            {stateSuggestions.length > 0 && (
              <View style={[styles.suggestBox, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}>
                {stateSuggestions.map((s) => (
                  <Pressable key={s} style={styles.suggestItem} onPress={() => patch({ state: s })}>
                    <MaterialIcons name="place" size={16} color={colors.primary} />
                    <Text style={{ color: colors.text, fontSize: 13 }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ProfileField>
        </View>

        {/* Interests */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SectionTitle title="Interests" colors={colors} />
          <ProfileField label="Areas of interest" hint="Helps personalize AI coach advice" icon="interests" colors={colors}>
            <TextInput
              style={[inputStyle, styles.multiline]}
              value={form.areaOfInterest ?? ''}
              onChangeText={(t) => patch({ areaOfInterest: t || null })}
              placeholder="Travel, investing, subscriptions, dining…"
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </ProfileField>
        </View>

        <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Save & sync profile</Text>
            </>
          )}
        </Pressable>

        <Pressable style={[styles.logoutBtn, { backgroundColor: colors.error }]} onPress={handleLogout}>
          <MaterialIcons name="logout" size={20} color="#fff" />
          <Text style={styles.logoutBtnText}>Log out</Text>
        </Pressable>
      </ScrollView>

      {/* Full-screen photo preview */}
      <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <View style={styles.previewBackdrop}>
          <Pressable style={styles.previewClose} onPress={() => setPreviewOpen(false)}>
            <MaterialIcons name="close" size={28} color="#fff" />
          </Pressable>
          {form.photoUrl ? (
            <Image source={{ uri: form.photoUrl }} style={styles.previewImage} contentFit="contain" />
          ) : null}
          <Text style={styles.previewCaption}>{form.displayName}</Text>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroCard: { borderRadius: 20, padding: 22, alignItems: 'center', borderWidth: 1 },
  avatarRing: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 32, fontWeight: '800', lineHeight: 96, textAlign: 'center' },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  heroName: { fontSize: 22, fontWeight: '800', marginTop: 14 },
  heroRole: { fontSize: 14, marginTop: 2 },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  card: { borderRadius: 18, padding: 18, borderWidth: 1, gap: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  fieldBlock: { gap: 8 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  fieldIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fieldLabelText: { flex: 1 },
  fieldLabel: { fontSize: 14, fontWeight: '700' },
  fieldHint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  readOnly: { opacity: 0.7 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  savingsShell: {
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
  },
  savingsBarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  savingsPercent: { fontSize: 22, fontWeight: '800' },
  pillWrapper: {
    height: BAR_H,
    marginHorizontal: 4,
  },
  pillDivider: {
    position: 'absolute',
    top: -6,
    width: 3,
    height: BAR_H + 12,
    borderRadius: 2,
    marginLeft: -1.5,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  barDot: { width: 6, height: 6, borderRadius: 3 },
  switchCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  switchCopy: { flex: 1 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detectBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  suggestBox: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  suggestItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    padding: 16,
  },
  logoutBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  previewClose: { position: 'absolute', top: 48, right: 20, zIndex: 2, padding: 8 },
  previewImage: { width: '90%', height: '60%' },
  previewCaption: { color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' },
});

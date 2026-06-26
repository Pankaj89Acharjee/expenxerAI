import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { AVATAR_URLS } from '@/src/constants/categories';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import { formatCurrency } from '@/src/utils/format';

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const profile = useFinancialStore((s) => s.userProfile);
  const updateProfile = useFinancialStore((s) => s.updateProfile);
  const logout = useFinancialStore((s) => s.logout);

  const [displayName, setDisplayName] = useState('');
  const [income, setIncome] = useState('');
  const [savingsRate, setSavingsRate] = useState(20);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setIncome(String(profile.monthlyIncome));
      setSavingsRate(profile.baseSavingsRatePercent);
      setAlertEnabled(profile.alertPreference);
      setPhotoUrl(profile.photoUrl ?? null);
    }
  }, [profile]);

  const handleSave = async () => {
    await updateProfile(displayName, parseFloat(income) || 5000, savingsRate, alertEnabled, photoUrl);
    Alert.alert('Saved', 'Profile updated successfully.');
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.emeraldSoft }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{displayName.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
        <Text style={{ color: colors.textMuted }}>{profile?.email}</Text>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Change Profile Picture</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarRow}>
          {AVATAR_URLS.map((url) => (
            <Pressable key={url} onPress={() => setPhotoUrl(url)} style={[styles.avatarChoice, photoUrl === url && { borderColor: colors.primary, borderWidth: 3 }]}>
              <Image source={{ uri: url }} style={styles.avatarSmall} contentFit="cover" />
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.formTitle, { color: colors.text }]}>Edit Profile</Text>
        <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Display Name" placeholderTextColor={colors.textMuted} value={displayName} onChangeText={setDisplayName} />
        <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Monthly Income (₹)" placeholderTextColor={colors.textMuted} value={income} onChangeText={setIncome} keyboardType="numeric" />

        <Text style={{ color: colors.text, fontWeight: '600' }}>Savings Rate: {savingsRate.toFixed(0)}%</Text>
        <View style={styles.sliderRow}>
          {[5, 10, 15, 20, 25, 30, 40, 50, 75].map((v) => (
            <Pressable key={v} style={[styles.rateChip, savingsRate === v && { backgroundColor: colors.primary }]} onPress={() => setSavingsRate(v)}>
              <Text style={{ color: savingsRate === v ? '#fff' : colors.textMuted, fontSize: 11 }}>{v}%</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.switchRow}>
          <Text style={{ color: colors.text }}>Expense Alerts (FCM)</Text>
          <Switch value={alertEnabled} onValueChange={setAlertEnabled} trackColor={{ true: colors.primary }} />
        </View>

        <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Save Profile</Text>
        </Pressable>
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.surfaceVariant }]}>
        <Text style={[styles.infoTitle, { color: colors.text }]}>Monthly Summary</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Income: {formatCurrency(parseFloat(income) || 0)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Target savings: {formatCurrency((parseFloat(income) || 0) * (savingsRate / 100))}/mo</Text>
      </View>

      <Pressable style={[styles.logoutBtn, { borderColor: colors.error }]} onPress={handleLogout}>
        <Text style={{ color: colors.error, fontWeight: '700' }}>Log Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  profileCard: { borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { fontSize: 28, fontWeight: '800', lineHeight: 80, textAlign: 'center' },
  name: { fontSize: 20, fontWeight: '800', marginTop: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  avatarRow: { maxHeight: 60 },
  avatarChoice: { marginRight: 10, borderRadius: 27, overflow: 'hidden' },
  avatarSmall: { width: 48, height: 48, borderRadius: 24 },
  formCard: { borderRadius: 16, padding: 20, borderWidth: 1, gap: 12 },
  formTitle: { fontSize: 16, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  sliderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rateChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#F1F5F9' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saveBtn: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  infoCard: { borderRadius: 16, padding: 16 },
  infoTitle: { fontWeight: '700', marginBottom: 8 },
  logoutBtn: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
});

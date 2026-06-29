import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import { formatCurrency } from '@/src/utils/format';

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const profile = useFinancialStore((s) => s.userProfile);
  const updateProfile = useFinancialStore((s) => s.updateProfile);
  const uploadProfilePhoto = useFinancialStore((s) => s.uploadProfilePhoto);
  const logout = useFinancialStore((s) => s.logout);

  const [displayName, setDisplayName] = useState('');
  const [income, setIncome] = useState('');
  const [savingsRate, setSavingsRate] = useState(20);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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
      return;
    }

    Alert.alert('Photo updated', 'Your profile picture has been saved.');
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable onPress={handlePickPhoto} disabled={uploading} style={styles.avatarPressable}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.emeraldSoft }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {displayName.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          {uploading && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </Pressable>

        <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
        <Text style={{ color: colors.textMuted }}>{profile?.email}</Text>

        <Pressable
          style={[styles.galleryBtn, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}
          onPress={handlePickPhoto}
          disabled={uploading}
        >
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            {uploading ? 'Uploading…' : 'Choose from Gallery'}
          </Text>
        </Pressable>
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
  avatarPressable: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', lineHeight: 80, textAlign: 'center' },
  name: { fontSize: 20, fontWeight: '800', marginTop: 12 },
  galleryBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
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

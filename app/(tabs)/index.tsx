import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors, Colors } from '@/src/theme/colors';
import { formatCurrency, formatDate, greeting } from '@/src/utils/format';
import { exportCsv, exportPdfReport } from '@/src/utils/export';
import type { SavingGoal } from '@/src/types/models';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const isDark = colorScheme === 'dark';

  const profile = useFinancialStore((s) => s.userProfile);
  const expenses = useFinancialStore((s) => s.expenses);
  const liabilities = useFinancialStore((s) => s.liabilities);
  const savingGoals = useFinancialStore((s) => s.savingGoals);
  const logs = useFinancialStore((s) => s.logs);
  const aiReportAdvice = useFinancialStore((s) => s.aiReportAdvice);
  const googleSheetsSyncUrl = useFinancialStore((s) => s.googleSheetsSyncUrl);
  const checkAndTriggerPeriodicSync = useFinancialStore((s) => s.checkAndTriggerPeriodicSync);
  const triggerGoogleSheetsSync = useFinancialStore((s) => s.triggerGoogleSheetsSync);
  const triggerGmailDelivery = useFinancialStore((s) => s.triggerGmailDelivery);
  const saveGoogleOAuthToken = useFinancialStore((s) => s.saveGoogleOAuthToken);
  const addSavingContribution = useFinancialStore((s) => s.addSavingContribution);

  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [contribGoal, setContribGoal] = useState<SavingGoal | null>(null);
  const [contribAmount, setContribAmount] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    checkAndTriggerPeriodicSync();
  }, [checkAndTriggerPeriodicSync]);

  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const monthlyIncome = profile?.monthlyIncome ?? 5000;
  const percentSpent = Math.min(totalExpenses / monthlyIncome, 1);
  const remainingBudget = Math.max(monthlyIncome - totalExpenses, 0);

  const nextLiability = useMemo(
    () => liabilities.filter((l) => !l.isPaid).sort((a, b) => a.dueDateMillis - b.dueDateMillis)[0],
    [liabilities]
  );

  const trendData = useMemo(() => {
    const now = Date.now();
    return DAY_NAMES.map((day, i) => {
      const dayStart = now - (6 - i) * 86400000;
      const dayEnd = dayStart + 86400000;
      const total = expenses.filter((e) => e.dateMillis >= dayStart && e.dateMillis < dayEnd).reduce((s, e) => s + e.amount, 0);
      return { day, total };
    });
  }, [expenses]);

  const maxTrend = Math.max(...trendData.map((d) => d.total), 1);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] ?? 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [expenses]);

  const maxCategory = categoryTotals[0]?.[1] ?? 1;
  const mostExpensive = useMemo(() => [...expenses].sort((a, b) => b.amount - a.amount)[0], [expenses]);

  const handleContribute = async () => {
    if (!contribGoal) return;
    const amt = parseFloat(contribAmount);
    if (isNaN(amt) || amt <= 0) return;
    await addSavingContribution(contribGoal, amt);
    setContribGoal(null);
    setContribAmount('');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.archLabel, { color: colors.primary }]}>PERSONAL EXPENXER</Text>
          <Text style={[styles.greeting, { color: colors.text }]}>{greeting()}, {profile?.displayName ?? 'there'}</Text>
        </View>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{(profile?.displayName ?? 'A').slice(0, 2).toUpperCase()}</Text>
        </View>
      </View>

      {/* Hero Card */}
      <View style={[styles.heroCard, { backgroundColor: Colors.secondaryBlue }]}>
        <Text style={styles.heroLabel}>MONTHLY SAVINGS TARGET</Text>
        <Text style={styles.heroAmount}>{formatCurrency(monthlyIncome * ((profile?.baseSavingsRatePercent ?? 20) / 100))}</Text>
        <Text style={styles.heroSub}>Spent {formatCurrency(totalExpenses)} of {formatCurrency(monthlyIncome)} income</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percentSpent * 100}%`, backgroundColor: Colors.accentGreen }]} />
        </View>
        <Text style={styles.heroRemaining}>{formatCurrency(remainingBudget)} remaining this cycle</Text>
      </View>

      <View style={styles.bentoRow}>
        <View style={[styles.bentoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.bentoLabel, { color: colors.textMuted }]}>✨ AI Coach</Text>
          <Text style={[styles.bentoText, { color: colors.text }]}>Reduce 'Subscriptions' to unlock ₹18/mo in extra savings.</Text>
        </View>
        <View style={[styles.bentoCard, { backgroundColor: colors.emeraldSoft, borderColor: isDark ? '#047857' : '#D1FAE5' }]}>
          <Text style={[styles.liabilityLabel, { color: colors.emeraldText }]}>NEXT LIABILITY</Text>
          {nextLiability ? (
            <>
              <Text style={[styles.liabilityName, { color: isDark ? '#fff' : Colors.secondaryBlue }]}>{nextLiability.name}</Text>
              <Text style={{ color: colors.emeraldText, fontWeight: '600', fontSize: 12 }}>{formatDate(nextLiability.dueDateMillis)} • {formatCurrency(nextLiability.amount)}</Text>
            </>
          ) : (
            <>
              <Text style={[styles.liabilityName, { color: isDark ? '#fff' : Colors.secondaryBlue }]}>All Clear</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>No pending bills</Text>
            </>
          )}
        </View>
      </View>

      {/* Trend Chart */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>7-Day Expense Trend</Text>
        <View style={styles.chartRow}>
          {trendData.map((d) => (
            <View key={d.day} style={styles.barCol}>
              <View style={[styles.barTrack, { backgroundColor: colors.surfaceVariant }]}>
                <View style={[styles.barFill, { height: `${(d.total / maxTrend) * 100}%`, backgroundColor: Colors.chartBlue }]} />
              </View>
              <Text style={[styles.barLabel, { color: colors.textMuted }]}>{d.day}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Category Chart */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Top Categories</Text>
        {categoryTotals.map(([cat, amt]) => (
          <View key={cat} style={styles.catRow}>
            <Text style={[styles.catName, { color: colors.text }]}>{cat}</Text>
            <View style={[styles.catTrack, { backgroundColor: colors.surfaceVariant }]}>
              <View style={[styles.catFill, { width: `${(amt / maxCategory) * 100}%`, backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.catAmt, { color: colors.textMuted }]}>{formatCurrency(amt)}</Text>
          </View>
        ))}
      </View>

      {mostExpensive && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Most Expensive Item</Text>
          <Text style={[styles.expensiveTitle, { color: colors.text }]}>{mostExpensive.title}</Text>
          <Text style={{ color: Colors.chartRed, fontWeight: '800', fontSize: 22 }}>{formatCurrency(mostExpensive.amount)}</Text>
        </View>
      )}

      {/* Savings Goals */}
      {savingGoals.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Savings Goals</Text>
          {savingGoals.map((goal) => (
            <View key={goal.id} style={[styles.goalItem, { borderColor: colors.border }]}>
              <Text style={[styles.goalName, { color: colors.text }]}>{goal.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{formatCurrency(goal.savedAmount)} / {formatCurrency(goal.targetAmount)}</Text>
              <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4 }}>{goal.forecastText}</Text>
              <Pressable style={[styles.contribBtn, { backgroundColor: colors.primary }]} onPress={() => setContribGoal(goal)}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Contribute</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Automation */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Automation & Export</Text>
        <View style={styles.autoRow}>
          <Pressable style={[styles.autoBtn, { backgroundColor: colors.emeraldSoft }]} onPress={() => exportPdfReport(profile, expenses, liabilities, savingGoals, aiReportAdvice)}>
            <Text style={{ color: colors.emeraldText, fontWeight: '700' }}>Daily PDF Report</Text>
          </Pressable>
          <Pressable style={[styles.autoBtn, { backgroundColor: colors.emeraldSoft }]} onPress={() => setShowExport(true)}>
            <Text style={{ color: colors.emeraldText, fontWeight: '700' }}>Export / Sync</Text>
          </Pressable>
        </View>
        <Pressable style={[styles.autoBtn, { backgroundColor: colors.surfaceVariant, marginTop: 8 }]} onPress={() => setShowSettings(true)}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Gmail & Sync Settings</Text>
        </Pressable>
        {googleSheetsSyncUrl ? (
          <Pressable onPress={() => Linking.openURL(googleSheetsSyncUrl)}>
            <Text style={{ color: colors.primary, marginTop: 8, fontSize: 12 }}>Open synced sheet →</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Quick Nav */}
      <View style={styles.autoRow}>
        <Pressable style={[styles.navBtn, { borderColor: colors.border }]} onPress={() => router.push('/(tabs)/expenses')}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>View Expenses →</Text>
        </Pressable>
        <Pressable style={[styles.navBtn, { borderColor: colors.border }]} onPress={() => router.push('/(tabs)/planner')}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Planner →</Text>
        </Pressable>
      </View>

      {/* Logs */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Notification Center</Text>
        {logs.slice(0, 5).map((log) => (
          <View key={log.id} style={[styles.logItem, { borderColor: colors.border }]}>
            <Text style={[styles.logTitle, { color: colors.text }]}>{log.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{log.message}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{formatDate(log.timestamp, 'full')}</Text>
          </View>
        ))}
      </View>

      {/* Export Modal */}
      <Modal visible={showExport} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Export Options</Text>
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={() => { exportCsv(expenses, liabilities, savingGoals); setShowExport(false); }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Export CSV</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={async () => { setSyncing(true); const r = await triggerGoogleSheetsSync(); setSyncing(false); Alert.alert(r.success ? 'Sync Complete' : 'Sync Failed', r.url ?? r.error ?? ''); setShowExport(false); }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{syncing ? 'Syncing...' : 'Google Sheets Sync'}</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setShowExport(false)}>
              <Text style={{ color: colors.text }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Gmail & Sync Settings</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Google OAuth Token" placeholderTextColor={colors.textMuted} value={tokenInput} onChangeText={setTokenInput} />
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Recipient Email" placeholderTextColor={colors.textMuted} value={emailInput} onChangeText={setEmailInput} keyboardType="email-address" />
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={async () => { await saveGoogleOAuthToken(tokenInput); const r = await triggerGmailDelivery(tokenInput, emailInput); Alert.alert(r.success ? 'Sent' : 'Failed', r.error ?? 'Report dispatched'); setShowSettings(false); }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Save & Send Gmail Report</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setShowSettings(false)}>
              <Text style={{ color: colors.text }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Contribute Modal */}
      <Modal visible={!!contribGoal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Contribute to {contribGoal?.name}</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Amount (₹)" placeholderTextColor={colors.textMuted} value={contribAmount} onChangeText={setContribAmount} keyboardType="numeric" />
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleContribute}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Add Contribution</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setContribGoal(null)}>
              <Text style={{ color: colors.text }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  archLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  greeting: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800', fontSize: 14 },
  heroCard: { borderRadius: 20, padding: 20 },
  heroLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroAmount: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 4 },
  heroSub: { color: '#94A3B8', fontSize: 13, marginTop: 4 },
  progressTrack: { height: 8, backgroundColor: '#334155', borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  heroRemaining: { color: Colors.accentGreen, fontSize: 13, fontWeight: '600', marginTop: 8 },
  bentoRow: { flexDirection: 'row', gap: 12 },
  bentoCard: { flex: 1, borderRadius: 16, padding: 14, borderWidth: 1, minHeight: 112, justifyContent: 'space-between' },
  bentoLabel: { fontSize: 11, fontWeight: '700' },
  bentoText: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  liabilityLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  liabilityName: { fontSize: 14, fontWeight: '700' },
  card: { borderRadius: 16, padding: 16, borderWidth: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 100 },
  barCol: { alignItems: 'center', flex: 1 },
  barTrack: { width: 20, height: 80, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 10, marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  catName: { width: 80, fontSize: 12, fontWeight: '600' },
  catTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  catFill: { height: '100%', borderRadius: 3 },
  catAmt: { width: 70, fontSize: 11, textAlign: 'right' },
  expensiveTitle: { fontSize: 16, fontWeight: '600' },
  goalItem: { borderBottomWidth: 1, paddingVertical: 12 },
  goalName: { fontSize: 15, fontWeight: '700' },
  contribBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, marginTop: 8 },
  autoRow: { flexDirection: 'row', gap: 8 },
  autoBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  navBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  logItem: { borderBottomWidth: 1, paddingVertical: 8 },
  logTitle: { fontWeight: '700', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
});

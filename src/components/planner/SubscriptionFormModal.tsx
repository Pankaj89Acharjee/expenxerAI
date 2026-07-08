import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardModalShell } from '@/src/components/KeyboardModalShell';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SUBSCRIPTION_BILLING_CYCLES,
  SUBSCRIPTION_PURPOSES,
} from '@/src/constants/subscriptionPurposes';
import type { Subscription } from '@/src/types/models';
import { themeColors } from '@/src/theme/colors';
import { formatCurrency, formatDate } from '@/src/utils/format';
import {
  type SubscriptionPaymentRecord,
  canRecordRecurringPayment,
  daysUntilPaymentWindow,
  getRecurringPaymentStatus,
  isPaidForCurrentCycle,
  parseSubscriptionPaymentHistory,
  paymentWindowOpensMillis,
  RECURRING_PAYMENT_WINDOW_DAYS,
  recurringPaymentStatusLabel,
  startOfDay,
} from '@/src/utils/recurringBilling';

type ThemeColors = ReturnType<typeof themeColors>;

export type SubscriptionFormData = {
  name: string;
  cost: number;
  billingCycle: string;
  purpose: string;
  isAlertEnabled: boolean;
  nextPaymentMillis: number;
  recordPayment?: boolean;
  paymentDateMillis?: number | null;
};

type Props = {
  visible: boolean;
  editing: Subscription | null;
  colors: ThemeColors;
  onClose: () => void;
  onSave: (data: SubscriptionFormData) => Promise<void>;
};

type DatePickerTarget = 'due' | 'payment' | null;

export function SubscriptionFormModal({ visible, editing, colors, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isCompact = windowWidth < 380;
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [billingCycle, setBillingCycle] = useState('MONTHLY');
  const [purpose, setPurpose] = useState('Entertainment');
  const [isAlertEnabled, setIsAlertEnabled] = useState(true);
  const [dueDate, setDueDate] = useState(() => startOfDay(Date.now()));
  const [paymentDate, setPaymentDate] = useState<number | null>(null);
  const [recordPaymentIntent, setRecordPaymentIntent] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      setCost(String(editing.cost));
      setBillingCycle(editing.billingCycle);
      setPurpose(editing.category);
      setIsAlertEnabled(editing.isAlertEnabled);
      setDueDate(editing.nextPaymentMillis);
      setPaymentDate(editing.lastPaidMillis ?? null);
      setRecordPaymentIntent(false);
    } else {
      setName('');
      setCost('');
      setBillingCycle('MONTHLY');
      setPurpose('Entertainment');
      setIsAlertEnabled(true);
      setDueDate(startOfDay(Date.now()));
      setPaymentDate(null);
      setRecordPaymentIntent(false);
    }
    setDatePickerTarget(null);
  }, [visible, editing]);

  const nextPaymentMillis = dueDate;

  const paymentStatus = useMemo(
    () =>
      editing
        ? getRecurringPaymentStatus(nextPaymentMillis, editing.lastPaidMillis)
        : getRecurringPaymentStatus(nextPaymentMillis, recordPaymentIntent ? paymentDate : null),
    [editing, nextPaymentMillis, recordPaymentIntent, paymentDate]
  );

  const paymentWindowOpen = canRecordRecurringPayment(nextPaymentMillis);
  const alreadyPaidThisCycle = editing
    ? isPaidForCurrentCycle(nextPaymentMillis, editing.lastPaidMillis)
    : false;
  const canMarkPaid = paymentWindowOpen && !alreadyPaidThisCycle;
  const daysUntilWindow = daysUntilPaymentWindow(nextPaymentMillis);
  const windowOpensMillis = paymentWindowOpensMillis(nextPaymentMillis);

  const handleDateValueChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    if (!datePickerTarget) return;
    if (datePickerTarget === 'due') {
      setDueDate(date.getTime());
    } else {
      setPaymentDate(date.getTime());
      setRecordPaymentIntent(true);
    }
    if (Platform.OS === 'android') setDatePickerTarget(null);
  };

  const handleSave = async () => {
    const amt = parseFloat(cost);
    if (!name.trim() || isNaN(amt) || amt <= 0) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        cost: amt,
        billingCycle,
        purpose,
        isAlertEnabled,
        nextPaymentMillis,
        recordPayment: recordPaymentIntent,
        paymentDateMillis: recordPaymentIntent ? startOfDay(paymentDate ?? Date.now()) : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = () => {
    if (!canMarkPaid) return;
    setRecordPaymentIntent(true);
    setPaymentDate(Date.now());
  };

  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceVariant },
  ];

  const horizontalPad = Math.max(12, Math.min(20, windowWidth * 0.04));
  const cardHeight = Math.min(windowHeight * 0.9, 700);

  const statusColor =
    paymentStatus === 'paid'
      ? colors.emeraldText
      : paymentStatus === 'overdue'
        ? colors.error
        : paymentStatus === 'due_soon'
          ? colors.primary
          : colors.textMuted;
  const paymentHistory = useMemo<SubscriptionPaymentRecord[]>(
    () => parseSubscriptionPaymentHistory(editing?.paymentHistoryJson),
    [editing?.paymentHistoryJson]
  );
  const latestPayment = paymentHistory[0] ?? null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible ? (
      <KeyboardModalShell>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 12),
            paddingHorizontal: horizontalPad,
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              height: cardHeight,
              maxHeight: cardHeight,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {editing ? editing.name : 'Add Subscription'}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            bottomOffset={24}
            nestedScrollEnabled
          >
            <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. Netflix"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Cost (₹)</Text>
            <TextInput
              style={inputStyle}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              value={cost}
              onChangeText={setCost}
              keyboardType="numeric"
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Billing Cycle</Text>
            <View style={styles.chipRow}>
              {SUBSCRIPTION_BILLING_CYCLES.map((cycle) => {
                const selected = billingCycle === cycle;
                return (
                  <Pressable
                    key={cycle}
                    style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceVariant }]}
                    onPress={() => setBillingCycle(cycle)}
                  >
                    <Text style={{ color: selected ? '#fff' : colors.textMuted, fontWeight: '600', fontSize: 13 }}>
                      {cycle}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.textMuted }]}>Billing Due Date</Text>
            <Pressable
              style={[styles.dateRow, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}
              onPress={() => setDatePickerTarget('due')}
            >
              <MaterialIcons name="event" size={20} color={colors.primary} />
              <View style={styles.dateCopy}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{formatDate(dueDate)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  Repeats on this day each {billingCycle === 'YEARLY' ? 'year' : 'month'}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>

            <View style={[styles.scheduleCard, { backgroundColor: colors.emeraldSoft, borderColor: colors.border }]}>
              <View style={styles.scheduleRow}>
                <Text style={{ color: colors.emeraldText, fontWeight: '600', fontSize: 12 }}>
                  {startOfDay(nextPaymentMillis) < startOfDay(Date.now()) ? 'Current due' : 'Next billing'}
                </Text>
                <Text style={{ color: colors.emeraldText, fontWeight: '800', fontSize: 15 }}>
                  {formatDate(nextPaymentMillis)}
                </Text>
              </View>
              <View style={[styles.scheduleDivider, { backgroundColor: colors.border }]} />
              <View style={styles.scheduleRow}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Payment window opens</Text>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                  {formatDate(windowOpensMillis)}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
                Mark payment {RECURRING_PAYMENT_WINDOW_DAYS} days before the due date. Amount:{' '}
                {formatCurrency(parseFloat(cost) || 0)}
                {billingCycle === 'YEARLY' ? '/yr' : '/mo'}
              </Text>
            </View>

            {(!editing || editing.isActive) && (
              <View style={[styles.paymentCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
                <View style={styles.paymentHeader}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>Record Payment</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                    <Text style={styles.statusBadgeText}>{recurringPaymentStatusLabel(paymentStatus)}</Text>
                  </View>
                </View>

                {alreadyPaidThisCycle && editing?.lastPaidMillis ? (
                  <Text style={{ color: colors.emeraldText, fontSize: 13, fontWeight: '600', marginTop: 8 }}>
                    Paid on {formatDate(editing.lastPaidMillis)} for this cycle
                  </Text>
                ) : canMarkPaid ? (
                  <>
                    <Pressable
                      style={[styles.markPaidBtn, { backgroundColor: colors.primary }]}
                      onPress={handleMarkPaid}
                    >
                      <MaterialIcons name="check-circle" size={18} color="#fff" />
                      <Text style={styles.markPaidText}>Mark as paid today</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.dateRow, styles.paymentDateRow, { borderColor: colors.border, backgroundColor: colors.card }]}
                      onPress={() => setDatePickerTarget('payment')}
                    >
                      <MaterialIcons name="payments" size={20} color={colors.emeraldText} />
                      <View style={styles.dateCopy}>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>Payment date</Text>
                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                          {formatDate(paymentDate ?? Date.now())}
                        </Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
                    </Pressable>
                  </>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
                    Payment recording opens on {formatDate(windowOpensMillis)}
                    {daysUntilWindow > 0 ? ` (${daysUntilWindow} day${daysUntilWindow === 1 ? '' : 's'} left)` : ''}.
                  </Text>
                )}
              </View>
            )}

            {editing ? (
              <View style={[styles.paymentCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
                <View style={styles.paymentHeader}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>Payment History</Text>
                  <View style={[styles.statusBadge, { backgroundColor: colors.emeraldText }]}>
                    <Text style={styles.statusBadgeText}>{paymentHistory.length} PAID</Text>
                  </View>
                </View>

                {latestPayment ? (
                  <View style={[styles.historyLatestCard, { backgroundColor: colors.emeraldSoft, borderColor: colors.border }]}>
                    <Text style={{ color: colors.emeraldText, fontSize: 11, fontWeight: '700' }}>Last bill paid</Text>
                    <View style={styles.historyLatestRow}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
                        {formatCurrency(latestPayment.amount)}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {formatDate(latestPayment.paymentDateMillis)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
                    No payments recorded yet for this subscription.
                  </Text>
                )}

                {paymentHistory.length > 0 ? (
                  <ScrollView
                    style={[styles.historyScroll, { borderColor: colors.border, backgroundColor: colors.card }]}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {paymentHistory.map((entry, idx) => (
                      <View
                        key={entry.id}
                        style={[
                          styles.historyItem,
                          idx < paymentHistory.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.border,
                          },
                        ]}
                      >
                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                          {formatCurrency(entry.amount)}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          {formatDate(entry.paymentDateMillis)}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.textMuted }]}>Purpose</Text>
            <View style={styles.chipRow}>
              {SUBSCRIPTION_PURPOSES.map((p) => {
                const selected = purpose === p;
                return (
                  <Pressable
                    key={p}
                    style={[
                      styles.chip,
                      styles.purposeChip,
                      { backgroundColor: selected ? colors.primary : colors.surfaceVariant },
                    ]}
                    onPress={() => setPurpose(p)}
                  >
                    <Text
                      style={{
                        color: selected ? '#fff' : colors.textMuted,
                        fontSize: isCompact ? 11 : 12,
                        fontWeight: '600',
                      }}
                      numberOfLines={1}
                    >
                      {p}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.switchRow}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>Payment Alert</Text>
              <Switch
                value={isAlertEnabled}
                onValueChange={setIsAlertEnabled}
                trackColor={{ true: colors.primary }}
              />
            </View>
          </KeyboardAwareScrollView>

          {datePickerTarget && Platform.OS === 'ios' && (
            <View style={[styles.pickerBar, { borderTopColor: colors.border, backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.pickerBarHeader}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                  {datePickerTarget === 'due' ? 'Billing due date' : 'Payment date'}
                </Text>
                <Pressable onPress={() => setDatePickerTarget(null)} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={new Date(datePickerTarget === 'due' ? dueDate : paymentDate ?? Date.now())}
                mode="date"
                display="spinner"
                maximumDate={datePickerTarget === 'payment' ? new Date() : undefined}
                onValueChange={handleDateValueChange}
              />
            </View>
          )}

          {datePickerTarget && Platform.OS === 'android' && (
            <DateTimePicker
              value={new Date(datePickerTarget === 'due' ? dueDate : paymentDate ?? Date.now())}
              mode="date"
              display="default"
              maximumDate={datePickerTarget === 'payment' ? new Date() : undefined}
              onValueChange={handleDateValueChange}
              onDismiss={() => setDatePickerTarget(null)}
            />
          )}

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>{editing ? 'Update' : 'Save'}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
      </KeyboardModalShell>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollContent: { gap: 10, paddingBottom: 12 },
  label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  purposeChip: { maxWidth: '48%' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateCopy: { flex: 1, minWidth: 0 },
  scheduleCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 0,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scheduleDivider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  paymentCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  markPaidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
  },
  markPaidText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  paymentDateRow: { marginTop: 10 },
  historyLatestCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    gap: 6,
  },
  historyLatestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  historyScroll: {
    marginTop: 10,
    maxHeight: 150,
    borderWidth: 1,
    borderRadius: 10,
  },
  historyItem: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  pickerBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pickerBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingTop: 4,
  },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

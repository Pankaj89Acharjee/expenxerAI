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
  BILL_CYCLE_OPTIONS,
  BILL_TYPE_OPTIONS,
  type BillType,
} from '@/src/constants/billPurposes';
import { FormSelect } from '@/src/components/planner/FormSelect';
import type { Bill } from '@/src/types/models';
import { themeColors } from '@/src/theme/colors';
import { formatCurrency, formatDate } from '@/src/utils/format';
import {
  type BillPaymentRecord,
  canRecordRecurringPayment,
  daysUntilPaymentWindow,
  getRecurringPaymentStatus,
  isPaidForCurrentCycle,
  parseBillPaymentHistory,
  paymentWindowOpensMillis,
  RECURRING_PAYMENT_WINDOW_DAYS,
  recurringPaymentStatusLabel,
  startOfDay,
} from '@/src/utils/recurringBilling';

type ThemeColors = ReturnType<typeof themeColors>;

export type BillFormData = {
  name: string;
  amount: number;
  billingCycle: string;
  isAlertEnabled: boolean;
  nextPaymentMillis: number;
  recordPayment?: boolean;
  paymentDateMillis?: number | null;
};

type Props = {
  visible: boolean;
  editing: Bill | null;
  colors: ThemeColors;
  onClose: () => void;
  onSave: (data: BillFormData) => Promise<void>;
};

type DatePickerTarget = 'due' | 'payment' | null;

function cycleHint(cycle: string): string {
  if (cycle === 'YEARLY') return 'year';
  if (cycle === 'QUARTERLY') return 'quarter';
  if (cycle === 'HALF_YEARLY') return 'half-year';
  return 'month';
}

function cycleSuffix(cycle: string): string {
  if (cycle === 'YEARLY') return '/yr';
  if (cycle === 'QUARTERLY') return '/qtr';
  if (cycle === 'HALF_YEARLY') return '/6mo';
  return '/mo';
}

function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const amt = Number(cleaned);
  if (!Number.isFinite(amt) || amt <= 0) return null;
  return Math.round(amt * 100) / 100;
}

export function BillFormModal({ visible, editing, colors, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [billFor, setBillFor] = useState<BillType>('Electricity');
  const [amount, setAmount] = useState('');
  const [billingCycle, setBillingCycle] = useState('MONTHLY');
  const [isAlertEnabled, setIsAlertEnabled] = useState(true);
  const [dueDate, setDueDate] = useState(() => startOfDay(Date.now()));
  const [paymentDate, setPaymentDate] = useState<number | null>(null);
  const [recordPaymentIntent, setRecordPaymentIntent] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      const known = BILL_TYPE_OPTIONS.some((o) => o.value === editing.name);
      setBillFor((known ? editing.name : 'Other') as BillType);
      setAmount(String(editing.amount));
      setBillingCycle(editing.billingCycle || 'MONTHLY');
      setIsAlertEnabled(editing.isAlertEnabled);
      setDueDate(editing.nextPaymentMillis || startOfDay(Date.now()));
      setPaymentDate(editing.lastPaidMillis ?? null);
      setRecordPaymentIntent(false);
    } else {
      setBillFor('Electricity');
      setAmount('');
      setBillingCycle('MONTHLY');
      setIsAlertEnabled(true);
      setDueDate(startOfDay(Date.now()));
      setPaymentDate(null);
      setRecordPaymentIntent(false);
    }
    setAmountError(null);
    setDatePickerTarget(null);
  }, [visible, editing]);

  const nextPaymentMillis = dueDate;
  const parsedAmount = useMemo(() => parseAmountInput(amount), [amount]);

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

  const paymentHistory = useMemo<BillPaymentRecord[]>(
    () => parseBillPaymentHistory(editing?.paymentHistoryJson),
    [editing?.paymentHistoryJson]
  );
  const latestPayment = paymentHistory[0] ?? null;

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

  const handleAmountChange = (text: string) => {
    const sanitized = text.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    const next =
      parts.length <= 1
        ? sanitized
        : `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
    setAmount(next);
    if (!next.trim()) {
      setAmountError(null);
      return;
    }
    const value = parseAmountInput(next);
    setAmountError(value == null ? 'Enter a valid amount greater than 0' : null);
  };

  const handleSave = async () => {
    const amt = parseAmountInput(amount);
    if (amt == null) {
      setAmountError('Enter a valid amount greater than 0');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: billFor,
        amount: amt,
        billingCycle,
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
  const cardHeight = Math.min(windowHeight * 0.9, 720);

  const statusColor =
    paymentStatus === 'paid'
      ? colors.emeraldText
      : paymentStatus === 'overdue'
        ? colors.error
        : paymentStatus === 'due_soon'
          ? colors.primary
          : colors.textMuted;

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
              {editing ? editing.name : 'Add Bill'}
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
            <FormSelect
              label="Bill For"
              value={billFor}
              options={[...BILL_TYPE_OPTIONS]}
              colors={colors}
              placeholder="Select bill type"
              onChange={setBillFor}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Amount (₹)</Text>
            <TextInput
              style={[
                inputStyle,
                amountError ? { borderColor: colors.error } : null,
              ]}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={handleAmountChange}
              keyboardType="decimal-pad"
            />
            {amountError ? (
              <Text style={{ color: colors.error, fontSize: 12, marginTop: -4 }}>{amountError}</Text>
            ) : null}

            <FormSelect
              label="Billing Cycle"
              value={billingCycle}
              options={[...BILL_CYCLE_OPTIONS]}
              colors={colors}
              placeholder="Select billing cycle"
              onChange={setBillingCycle}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Due Date</Text>
            <Pressable
              style={[styles.dateRow, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}
              onPress={() => setDatePickerTarget('due')}
            >
              <MaterialIcons name="event" size={20} color={colors.primary} />
              <View style={styles.dateCopy}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{formatDate(dueDate)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  Repeats each {cycleHint(billingCycle)}
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
                {formatCurrency(parsedAmount ?? 0)}
                {cycleSuffix(billingCycle)}
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
                      style={[
                        styles.dateRow,
                        styles.paymentDateRow,
                        { borderColor: colors.border, backgroundColor: colors.card },
                      ]}
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
                    No payments recorded yet for this bill.
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
                  {datePickerTarget === 'due' ? 'Bill due date' : 'Payment date'}
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

import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardModalShell } from '@/src/components/KeyboardModalShell';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Liability } from '@/src/types/models';
import { themeColors } from '@/src/theme/colors';
import { formatCurrency, formatDate } from '@/src/utils/format';
import {
  daysLeftLabel,
  getPaymentHistorySummary,
  isAnnualFrequency,
  LIABILITY_FREQUENCIES,
} from '@/src/utils/liabilitySchedule';
import { startOfDay } from '@/src/utils/recurringBilling';

type ThemeColors = ReturnType<typeof themeColors>;

export type LiabilityFormData = {
  name: string;
  amount: number;
  frequency: string;
  dueDateMillis: number;
  paymentDateMillis?: number | null;
};

type Props = {
  visible: boolean;
  editing: Liability | null;
  colors: ThemeColors;
  onClose: () => void;
  onSave: (data: LiabilityFormData) => Promise<void>;
};

type DatePickerTarget = 'due' | 'payment' | null;

export function LiabilityFormModal({ visible, editing, colors, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('YEARLY');
  const [dueDate, setDueDate] = useState(() => startOfDay(Date.now()));
  const [paymentDate, setPaymentDate] = useState<number | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget>(null);
  const [saving, setSaving] = useState(false);

  const paymentHistory = useMemo(
    () => (editing ? getPaymentHistorySummary(editing) : { count: 0, totalPaid: 0, records: [] }),
    [editing]
  );

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      setAmount(String(editing.amount));
      setFrequency(editing.frequency);
      setDueDate(editing.dueDateMillis);
      setPaymentDate(editing.paymentDateMillis ?? null);
    } else {
      setName('');
      setAmount('');
      setFrequency('YEARLY');
      setDueDate(startOfDay(Date.now()));
      setPaymentDate(null);
    }
    setDatePickerTarget(null);
  }, [visible, editing]);

  const handleDateValueChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    if (!datePickerTarget) return;
    if (datePickerTarget === 'due') {
      setDueDate(date.getTime());
    } else {
      setPaymentDate(date.getTime());
    }
    if (Platform.OS === 'android') setDatePickerTarget(null);
  };

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!name.trim() || isNaN(amt) || amt <= 0) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        amount: amt,
        frequency,
        dueDateMillis: dueDate,
        paymentDateMillis: paymentDate,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceVariant },
  ];

  const showPaymentField = !!editing && isAnnualFrequency(frequency);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible ? (
      <KeyboardModalShell>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {editing ? `Details with ${editing.name}` : 'Add Annual Liability'}
          </Text>

          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            bottomOffset={24}
            extraKeyboardSpace={0}
            nestedScrollEnabled
          >
            <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. Health Insurance"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Amount (₹)</Text>
            <TextInput
              style={inputStyle}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Frequency</Text>
            <View style={styles.chipRow}>
              {LIABILITY_FREQUENCIES.map((f) => {
                const selected = frequency === f;
                return (
                  <Pressable
                    key={f}
                    style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceVariant }]}
                    onPress={() => setFrequency(f)}
                  >
                    <Text style={{ color: selected ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                      {f.replace('_', ' ')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.textMuted }]}>Due Date</Text>
            <Pressable style={[inputStyle, styles.dateField]} onPress={() => setDatePickerTarget('due')}>
              <MaterialIcons name="event" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{formatDate(dueDate)}</Text>
              <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textMuted} />
            </Pressable>

            {showPaymentField ? (
              <>
                <Text style={[styles.label, { color: colors.textMuted }]}>Payment Date</Text>
                <Pressable
                  style={[inputStyle, styles.dateField]}
                  onPress={() => setDatePickerTarget('payment')}
                >
                  <MaterialIcons name="payments" size={20} color={colors.emeraldText} />
                  <Text style={{ color: paymentDate ? colors.text : colors.textMuted, fontSize: 15, flex: 1 }}>
                    {paymentDate ? formatDate(paymentDate) : 'Record when paid'}
                  </Text>
                  {paymentDate ? (
                    <Pressable
                      onPress={() => setPaymentDate(null)}
                      hitSlop={8}
                      accessibilityLabel="Clear payment date"
                    >
                      <MaterialIcons name="close" size={18} color={colors.textMuted} />
                    </Pressable>
                  ) : (
                    <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textMuted} />
                  )}
                </Pressable>
                <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16 }}>
                  Saving with a payment date closes this year&apos;s liability and reopens it for the next cycle.
                </Text>
              </>
            ) : null}

            {datePickerTarget && (
              <DateTimePicker
                value={new Date(datePickerTarget === 'due' ? dueDate : paymentDate ?? Date.now())}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={datePickerTarget === 'due' && !editing ? new Date() : undefined}
                maximumDate={datePickerTarget === 'payment' ? new Date() : undefined}
                onValueChange={handleDateValueChange}
                onDismiss={() => setDatePickerTarget(null)}
              />
            )}

            <View style={[styles.daysBadge, { backgroundColor: colors.emeraldSoft }]}>
              <MaterialIcons name="schedule" size={16} color={colors.emeraldText} />
              <Text style={{ color: colors.emeraldText, fontWeight: '700', fontSize: 13 }}>
                {daysLeftLabel(dueDate)}
              </Text>
            </View>

            {editing && paymentHistory.count > 0 ? (
              <View style={[styles.historyCard, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}>
                <View style={styles.historyHeader}>
                  <MaterialIcons name="history" size={18} color={colors.primary} />
                  <Text style={[styles.historyTitle, { color: colors.text }]}>Payment History</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
                  {paymentHistory.count} payment{paymentHistory.count === 1 ? '' : 's'} •{' '}
                  {formatCurrency(paymentHistory.totalPaid)} total paid
                </Text>
                {paymentHistory.records.map((record) => (
                  <View
                    key={record.id}
                    style={[styles.historyRow, { borderTopColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                        {record.financialYearLabel}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                        Due {formatDate(record.dueDateMillis)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>
                        {formatCurrency(record.amount)}
                      </Text>
                      <Text style={{ color: colors.emeraldText, fontSize: 11, marginTop: 2 }}>
                        Paid {formatDate(record.paymentDateMillis)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable style={styles.cancelBtn} onPress={onClose} disabled={saving}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
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
          </KeyboardAwareScrollView>
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
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderRadius: 24,
    borderWidth: 1,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { gap: 12, paddingBottom: 16 },
  label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  dateField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  daysBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  historyCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  historyTitle: { fontSize: 14, fontWeight: '800' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 4 },
  saveBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, minWidth: 96, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

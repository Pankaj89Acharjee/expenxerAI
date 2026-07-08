import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardModalShell } from '@/src/components/KeyboardModalShell';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Liability, LiabilityInstallment } from '@/src/types/models';
import { themeColors } from '@/src/theme/colors';
import { formatCurrency, formatDate } from '@/src/utils/format';
import {
  frequencyPlanLabel,
  getCurrentMonthEmiStatus,
  getEffectiveLoanEmi,
  getLoanTotalPayable,
  isLoanLiability,
  mergeLiabilitySchedule,
  recalculateLoanSchedule,
  recalculateSchedule,
  serializeInstallments,
  updateInstallment,
} from '@/src/utils/liabilitySchedule';

type ThemeColors = ReturnType<typeof themeColors>;

type Props = {
  visible: boolean;
  liability: Liability | null;
  colors: ThemeColors;
  onClose: () => void;
  onSave: (liability: Liability, paymentScheduleJson: string) => Promise<void>;
};

type PickerMode = 'due' | 'paid' | null;

export function LiabilityManageModal({ visible, liability, colors, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isCompact = windowWidth < 380;
  const [installments, setInstallments] = useState<LiabilityInstallment[]>([]);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !liability) return;
    setInstallments(mergeLiabilitySchedule(liability));
    setPickerIndex(null);
    setPickerMode(null);
  }, [visible, liability]);

  if (!liability) return null;

  const totalAmount = isLoanLiability(liability) ? getLoanTotalPayable(liability) : liability.amount;
  const horizontalPad = Math.max(12, Math.min(24, windowWidth * 0.04));
  const cardHeight = Math.min(windowHeight * 0.82, 680);
  const planLabel = isLoanLiability(liability)
    ? `EMI plan — ${liability.tenureMonths ?? 0} months`
    : frequencyPlanLabel(liability.frequency);

  const emiMonthStatus = isLoanLiability(liability) ? getCurrentMonthEmiStatus(liability) : null;

  const applyUpdate = (index: number, patch: Parameters<typeof updateInstallment>[2]) => {
    setInstallments((prev) =>
      updateInstallment(
        prev,
        index,
        patch,
        totalAmount,
        isLoanLiability(liability) ? { loanEmiAmount: getEffectiveLoanEmi(liability) } : undefined
      )
    );
  };

  const recordCurrentMonthEmi = () => {
    if (!emiMonthStatus?.hasEmi || emiMonthStatus.isPaid || emiMonthStatus.installmentIndex == null) return;
    applyUpdate(emiMonthStatus.installmentIndex, {
      isPaymentDone: true,
      paymentDateMillis: Date.now(),
    });
  };

  const openPicker = (index: number, mode: PickerMode) => {
    setPickerIndex(index);
    setPickerMode(mode);
  };

  const closePicker = () => {
    setPickerIndex(null);
    setPickerMode(null);
  };

  const handleDateValueChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    if (pickerIndex == null || !pickerMode) return;
    if (pickerMode === 'due') {
      applyUpdate(pickerIndex, { dueDateMillis: date.getTime() });
    } else {
      applyUpdate(pickerIndex, { paymentDateMillis: date.getTime() });
    }
    if (Platform.OS === 'android') {
      closePicker();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalized = isLoanLiability(liability)
        ? recalculateLoanSchedule(installments, getEffectiveLoanEmi(liability))
        : recalculateSchedule(installments, totalAmount);
      await onSave(liability, serializeInstallments(normalized));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const activePickerValue = () => {
    if (pickerIndex == null || !pickerMode) return new Date();
    const inst = installments[pickerIndex];
    if (pickerMode === 'due') return new Date(inst?.dueDateMillis ?? Date.now());
    return new Date(inst?.paymentDateMillis ?? Date.now());
  };

  const pickerLabel =
    pickerMode === 'due'
      ? 'Due date'
      : pickerMode === 'paid'
        ? 'Payment date'
        : '';

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
            <View style={styles.headerTextWrap}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {liability.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={2}>
                {planLabel}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
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
            <View style={[styles.totalRow, { backgroundColor: colors.emeraldSoft }]}>
              <Text style={{ color: colors.emeraldText, fontWeight: '600' }}>Total</Text>
              <Text style={{ color: colors.emeraldText, fontWeight: '800', fontSize: 18 }}>
                {formatCurrency(totalAmount)}
              </Text>
            </View>

            {emiMonthStatus?.hasEmi ? (
              <View
                style={[
                  styles.currentMonthBanner,
                  {
                    backgroundColor: emiMonthStatus.isPaid ? colors.emeraldSoft : colors.surfaceVariant,
                    borderColor: emiMonthStatus.isPaid
                      ? colors.emeraldText
                      : emiMonthStatus.isOverdue
                        ? colors.error
                        : colors.primary,
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: emiMonthStatus.isPaid
                        ? colors.emeraldText
                        : emiMonthStatus.isOverdue
                          ? colors.error
                          : colors.primary,
                    }}
                  >
                    {emiMonthStatus.isPaid ? 'PAID' : 'CURRENT MONTH DUE'}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginTop: 4 }}>
                    {formatCurrency(emiMonthStatus.amount)}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {emiMonthStatus.isPaid
                      ? `Paid ${formatDate(emiMonthStatus.paymentDateMillis!)}`
                      : `Due ${formatDate(emiMonthStatus.dueDateMillis!)}`}
                  </Text>
                </View>
                {!emiMonthStatus.isPaid ? (
                  <Pressable
                    style={[styles.recordEmiBtn, { backgroundColor: colors.primary }]}
                    onPress={recordCurrentMonthEmi}
                  >
                    <MaterialIcons name="check-circle" size={18} color="#fff" />
                    <Text style={styles.recordEmiBtnText}>Record</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.colMonth, styles.headerText, { color: colors.textMuted }]}>Month</Text>
              <Text
                style={[
                  styles.colAmount,
                  styles.headerText,
                  { color: colors.textMuted, textAlign: isCompact ? 'left' : 'right' },
                ]}
              >
                Amount
              </Text>
              <Text style={[styles.colStatus, styles.headerText, { color: colors.textMuted }]}>Status</Text>
            </View>

            {installments.map((inst, index) => (
              <View
                key={`${inst.monthYear}-${index}`}
                style={[
                  styles.row,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: inst.isDue
                      ? 'rgba(220,38,38,0.08)'
                      : inst.isPaymentDone
                        ? 'rgba(16,185,129,0.08)'
                        : 'transparent',
                  },
                ]}
              >
                <View style={styles.colMonth}>
                  <Text style={[styles.monthLabel, { color: colors.text }]} numberOfLines={1}>
                    {inst.label}
                  </Text>
                  <Pressable
                    onPress={() => openPicker(index, 'due')}
                    accessibilityLabel={`Set due date for ${inst.label}`}
                    hitSlop={4}
                  >
                    <Text style={[styles.dateLine, { color: colors.primary }]} numberOfLines={1}>
                      Due {formatDate(inst.dueDateMillis)}
                    </Text>
                  </Pressable>
                  {inst.isPaymentDone && (
                    <Pressable
                      onPress={() => openPicker(index, 'paid')}
                      accessibilityLabel={`Set payment date for ${inst.label}`}
                      hitSlop={4}
                    >
                      <Text style={[styles.dateLine, { color: colors.emeraldText }]} numberOfLines={1}>
                        Paid {formatDate(inst.paymentDateMillis ?? Date.now())}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <View style={[styles.colAmount, isCompact && styles.colAmountCompact]}>
                  <Text
                    style={[styles.amountText, { color: colors.primary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {formatCurrency(inst.amount)}
                  </Text>
                </View>

                <View style={styles.colStatus}>
                  <Pressable
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: inst.isPaymentDone ? colors.primary : colors.surfaceVariant,
                      },
                    ]}
                    onPress={() =>
                      applyUpdate(index, {
                        isPaymentDone: !inst.isPaymentDone,
                        paymentDateMillis: !inst.isPaymentDone ? Date.now() : null,
                      })
                    }
                    accessibilityLabel="Toggle payment done"
                  >
                    <MaterialIcons
                      name="check-circle"
                      size={18}
                      color={inst.isPaymentDone ? '#fff' : colors.textMuted}
                    />
                  </Pressable>

                  <Pressable
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: inst.isDue ? colors.error : colors.surfaceVariant,
                      },
                    ]}
                    disabled={inst.isPaymentDone}
                    onPress={() => applyUpdate(index, { isDue: !inst.isDue })}
                    accessibilityLabel="Toggle due missed"
                  >
                    <MaterialIcons
                      name="warning"
                      size={18}
                      color={inst.isDue ? '#fff' : inst.isPaymentDone ? colors.border : colors.error}
                    />
                  </Pressable>
                </View>
              </View>
            ))}

            <View style={[styles.legend, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={[styles.legendText, { color: colors.textMuted }]}>
                Tap <Text style={{ color: colors.primary, fontWeight: '600' }}>Due</Text> or{' '}
                <Text style={{ color: colors.emeraldText, fontWeight: '600' }}>Paid</Text> dates to edit.
              </Text>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <MaterialIcons name="check-circle" size={15} color={colors.primary} />
                  <Text style={[styles.legendItemText, { color: colors.textMuted }]}>Paid</Text>
                </View>
                <View style={styles.legendItem}>
                  <MaterialIcons name="warning" size={15} color={colors.error} />
                  <Text style={[styles.legendItemText, { color: colors.textMuted }]}>Missed</Text>
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>

          {pickerIndex != null && pickerMode && Platform.OS === 'ios' && (
            <View style={[styles.pickerBar, { borderTopColor: colors.border, backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.pickerBarHeader}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{pickerLabel}</Text>
                <Pressable onPress={closePicker} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={activePickerValue()}
                mode="date"
                display="spinner"
                maximumDate={pickerMode === 'paid' ? new Date() : undefined}
                onValueChange={handleDateValueChange}
              />
            </View>
          )}

          {pickerIndex != null && pickerMode && Platform.OS === 'android' && (
            <DateTimePicker
              value={activePickerValue()}
              mode="date"
              display="default"
              maximumDate={pickerMode === 'paid' ? new Date() : undefined}
              onValueChange={handleDateValueChange}
              onDismiss={closePicker}
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
                <Text style={styles.saveBtnText}>Save Plan</Text>
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 20,
    borderWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  scroll: { flex: 1 },
  scrollContent: { gap: 10, paddingBottom: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  headerTextWrap: { flex: 1, minWidth: 0, gap: 4 },
  closeBtn: { flexShrink: 0 },
  title: { fontSize: 18, fontWeight: '800' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  currentMonthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  recordEmiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  recordEmiBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    marginTop: 4,
    gap: 8,
  },
  headerText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  colMonth: { flex: 1, minWidth: 0 },
  monthLabel: { fontWeight: '700', fontSize: 13 },
  dateLine: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  colAmount: {
    width: 76,
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingTop: 2,
  },
  colAmountCompact: {
    width: 68,
    alignItems: 'flex-start',
  },
  amountText: { fontWeight: '700', fontSize: 12 },
  colStatus: {
    width: 76,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingTop: 2,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  legendText: { fontSize: 11, lineHeight: 16 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendItemText: { fontSize: 11 },
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
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

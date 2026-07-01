import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Liability, LiabilityInstallment } from '@/src/types/models';
import { themeColors } from '@/src/theme/colors';
import { formatCurrency } from '@/src/utils/format';
import {
  frequencyPlanLabel,
  mergeLiabilitySchedule,
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

  const totalAmount = liability.amount;

  const applyUpdate = (index: number, patch: Parameters<typeof updateInstallment>[2]) => {
    setInstallments((prev) => updateInstallment(prev, index, patch, totalAmount));
  };

  const openPicker = (index: number, mode: PickerMode) => {
    setPickerIndex(index);
    setPickerMode(mode);
  };

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setPickerIndex(null);
      setPickerMode(null);
    }
    if (!date || pickerIndex == null || !pickerMode) return;
    if (pickerMode === 'due') {
      applyUpdate(pickerIndex, { dueDateMillis: date.getTime() });
    } else {
      applyUpdate(pickerIndex, { paymentDateMillis: date.getTime() });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalized = recalculateSchedule(installments, totalAmount);
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAwareScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bottomOffset={24}
        >
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.header}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                  {liability.name}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {frequencyPlanLabel(liability.frequency)}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <MaterialIcons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={[styles.totalRow, { backgroundColor: colors.emeraldSoft }]}>
              <Text style={{ color: colors.emeraldText, fontWeight: '600' }}>Total</Text>
              <Text style={{ color: colors.emeraldText, fontWeight: '800', fontSize: 18 }}>
                {formatCurrency(totalAmount)}
              </Text>
            </View>

            <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.colMonth, styles.headerText, { color: colors.textMuted }]}>Month</Text>
              <Text style={[styles.colAmount, styles.headerText, { color: colors.textMuted }]}>Amt</Text>
              <Text style={[styles.colActions, styles.headerText, { color: colors.textMuted }]}>Actions</Text>
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
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                    {inst.label}
                  </Text>
                </View>

                <View style={styles.colAmount}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                    {formatCurrency(inst.amount)}
                  </Text>
                </View>

                <View style={styles.colActions}>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.surfaceVariant }]}
                    onPress={() => openPicker(index, 'due')}
                    accessibilityLabel="Set due date"
                  >
                    <MaterialIcons name="event" size={18} color={colors.primary} />
                  </Pressable>

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

                  {inst.isPaymentDone && (
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: colors.surfaceVariant }]}
                      onPress={() => openPicker(index, 'paid')}
                      accessibilityLabel="Set payment date"
                    >
                      <MaterialIcons name="today" size={18} color={colors.emeraldText} />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}

            {pickerIndex != null && pickerMode && (
              <DateTimePicker
                value={activePickerValue()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={pickerMode === 'paid' ? new Date() : undefined}
                onChange={handleDateChange}
                onDismiss={() => {
                  setPickerIndex(null);
                  setPickerMode(null);
                }}
              />
            )}

            <View style={[styles.legend, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.legendItem}>
                <MaterialIcons name="event" size={16} color={colors.primary} />
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Due date</Text>
              </View>
              <View style={styles.legendItem}>
                <MaterialIcons name="check-circle" size={16} color={colors.primary} />
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Paid</Text>
              </View>
              <View style={styles.legendItem}>
                <MaterialIcons name="warning" size={16} color={colors.error} />
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Missed</Text>
              </View>
              <View style={styles.legendItem}>
                <MaterialIcons name="today" size={16} color={colors.emeraldText} />
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Paid on</Text>
              </View>
            </View>

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
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, width: '100%' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    marginTop: 4,
  },
  headerText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  colMonth: { flex: 1.1, minWidth: 0 },
  colAmount: { width: 72, alignItems: 'flex-end' },
  colActions: { flex: 1.6, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardModalShell } from '@/src/components/KeyboardModalShell';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormSelect } from '@/src/components/planner/FormSelect';
import { getCreditCardLenderOptions, getLenderOptions } from '@/src/constants/lenders';
import { LOAN_TYPE_OPTIONS, type LoanType } from '@/src/constants/loanTypes';
import type { Liability } from '@/src/types/models';
import { themeColors } from '@/src/theme/colors';
import { calculateMonthlyEmi, calculateTotalPayable, canAutoCalculateEmi } from '@/src/utils/emiCalculator';
import { formatCurrency, formatDate } from '@/src/utils/format';
import { buildLoanEmiSchedule, getCurrentMonthEmiStatus, getLoanPaidEmiCount } from '@/src/utils/liabilitySchedule';
import { startOfDay } from '@/src/utils/recurringBilling';

type ThemeColors = ReturnType<typeof themeColors>;
export type LoanFormVariant = 'standard' | 'credit_card';

export type LoanFormData = {
  name: string;
  loanType: LoanType;
  principal: number;
  emiAmount: number;
  tenureMonths: number;
  firstEmiDueMillis: number;
  interestRatePercent?: number | null;
  lender?: string | null;
};

type Props = {
  visible: boolean;
  editing: Liability | null;
  variant: LoanFormVariant;
  colors: ThemeColors;
  onClose: () => void;
  onSave: (data: LoanFormData) => Promise<void>;
  onManage?: (liability: Liability) => void;
};

function Field({
  label,
  children,
  hint,
  colors,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      {children}
      {hint ? <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

export function LoanFormModal({ visible, editing, variant, colors, onClose, onSave, onManage }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isCreditCard = variant === 'credit_card';

  const [name, setName] = useState('');
  const [loanType, setLoanType] = useState<LoanType>('PERSONAL_LOAN');
  const [principal, setPrincipal] = useState('');
  const [tenureMonths, setTenureMonths] = useState('12');
  const [interestRate, setInterestRate] = useState('');
  const [emiAmount, setEmiAmount] = useState('');
  const [emiTouched, setEmiTouched] = useState(false);
  const [lender, setLender] = useState('');
  const [firstEmiDue, setFirstEmiDue] = useState(() => startOfDay(Date.now()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const lenderOptions = useMemo(
    () => (isCreditCard ? getCreditCardLenderOptions() : getLenderOptions(loanType)),
    [isCreditCard, loanType]
  );

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      setLoanType((editing.loanType as LoanType) ?? (isCreditCard ? 'OTHER' : 'PERSONAL_LOAN'));
      setPrincipal(String(editing.principal ?? editing.amount));
      setEmiAmount(String(editing.emiAmount ?? ''));
      setTenureMonths(String(editing.tenureMonths ?? 12));
      setFirstEmiDue(editing.dueDateMillis);
      setInterestRate(editing.interestRatePercent != null ? String(editing.interestRatePercent) : '');
      setLender(editing.lender ?? '');
      setEmiTouched(false);
    } else {
      setName('');
      setLoanType('PERSONAL_LOAN');
      setPrincipal('');
      setEmiAmount('');
      setTenureMonths('12');
      setFirstEmiDue(startOfDay(Date.now()));
      setInterestRate('');
      setLender('');
      setEmiTouched(false);
    }
    setShowDatePicker(false);
  }, [visible, editing, isCreditCard]);

  const principalNum = parseFloat(principal);
  const tenureNum = parseInt(tenureMonths, 10);
  const rateNum = parseFloat(interestRate);

  useEffect(() => {
    if (emiTouched || !visible) return;
    if (!canAutoCalculateEmi(principalNum, rateNum, tenureNum)) return;
    const calculated = calculateMonthlyEmi(principalNum, rateNum, tenureNum);
    if (calculated > 0) setEmiAmount(String(calculated));
  }, [principalNum, rateNum, tenureNum, emiTouched, visible]);

  const effectiveEmi = useMemo(() => {
    const parsed = parseFloat(emiAmount);
    if (principalNum > 0 && tenureNum > 0) {
      const rate = Number.isFinite(rateNum) ? rateNum : 0;
      const calculated = calculateMonthlyEmi(principalNum, rate, tenureNum);
      if (calculated > 0 && !emiTouched) return calculated;
    }
    return parsed;
  }, [principalNum, rateNum, tenureNum, emiAmount, emiTouched]);

  const preview = useMemo(() => {
    if (
      isNaN(principalNum) ||
      isNaN(effectiveEmi) ||
      isNaN(tenureNum) ||
      principalNum <= 0 ||
      effectiveEmi <= 0 ||
      tenureNum <= 0
    ) {
      return null;
    }
    return buildLoanEmiSchedule(effectiveEmi, tenureNum, firstEmiDue);
  }, [principalNum, effectiveEmi, tenureNum, firstEmiDue]);

  const remainingPreview = useMemo(() => {
    if (!(principalNum > 0 && tenureNum > 0)) return 0;
    const rate = Number.isFinite(rateNum) ? rateNum : 0;
    const emi = calculateMonthlyEmi(principalNum, rate, tenureNum) || parseFloat(emiAmount) || 0;
    if (editing) {
      const paidCount = getLoanPaidEmiCount(editing);
      return Math.max(0, Math.round(emi * (tenureNum - paidCount) * 100) / 100);
    }
    return calculateTotalPayable(principalNum, rate, tenureNum);
  }, [principalNum, rateNum, tenureNum, editing, emiAmount]);

  const autoEmiReady = canAutoCalculateEmi(principalNum, rateNum, tenureNum);

  const handleDateChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    setFirstEmiDue(date.getTime());
    if (Platform.OS === 'android') setShowDatePicker(false);
  };

  const handleSave = async () => {
    const emi = parseFloat(emiAmount);
    const rate = interestRate.trim() ? parseFloat(interestRate) : null;
    if (
      !name.trim() ||
      isNaN(principalNum) ||
      isNaN(emi) ||
      isNaN(tenureNum) ||
      principalNum <= 0 ||
      emi <= 0 ||
      tenureNum <= 0
    ) {
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        loanType: isCreditCard ? 'OTHER' : loanType,
        principal: principalNum,
        emiAmount: emi,
        tenureMonths: tenureNum,
        firstEmiDueMillis: firstEmiDue,
        interestRatePercent: rate != null && !isNaN(rate) ? rate : null,
        lender: lender || null,
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
  const cardHeight = Math.min(windowHeight * 0.92, 760);
  const horizontalPad = Math.max(12, Math.min(20, windowWidth * 0.04));
  const isCompact = windowWidth < 380;

  const title = editing
    ? editing.name
    : isCreditCard
      ? 'Add Credit Card Loan'
      : 'Add Loan';

  const emiMonthStatus = useMemo(
    () => (editing ? getCurrentMonthEmiStatus(editing) : null),
    [editing]
  );

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
            { backgroundColor: colors.card, borderColor: colors.border, height: cardHeight, maxHeight: cardHeight },
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {title}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                {isCreditCard ? 'Convert card outstanding into a tracked EMI plan' : 'Principal, tenure, rate, and EMI schedule'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            bottomOffset={28}
            nestedScrollEnabled
          >
            {editing && emiMonthStatus?.hasEmi ? (
              <View
                style={[
                  styles.emiStatusCard,
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
                      color: emiMonthStatus.isPaid
                        ? colors.emeraldText
                        : emiMonthStatus.isOverdue
                          ? colors.error
                          : colors.primary,
                      fontSize: 11,
                      fontWeight: '800',
                      letterSpacing: 0.4,
                    }}
                  >
                    {emiMonthStatus.isPaid ? 'PAID' : 'CURRENT MONTH DUE'}
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 4 }}>
                    {formatCurrency(emiMonthStatus.amount)} EMI
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {emiMonthStatus.isPaid
                      ? `Paid ${formatDate(emiMonthStatus.paymentDateMillis!)}`
                      : `Due ${formatDate(emiMonthStatus.dueDateMillis!)}`}
                  </Text>
                </View>
                {onManage ? (
                  <Pressable
                    style={[styles.manageEmiBtn, { backgroundColor: colors.primary }]}
                    onPress={() => onManage(editing)}
                  >
                    <MaterialIcons name="calendar-month" size={16} color="#fff" />
                    <Text style={styles.manageEmiBtnText}>Manage</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Field label={isCreditCard ? 'Card / plan name' : 'Loan name'} colors={colors}>
              <TextInput
                style={inputStyle}
                placeholder={isCreditCard ? 'e.g. HDFC Millennia EMI plan' : 'e.g. SBI Personal Loan'}
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
              />
            </Field>

            {!isCreditCard ? (
              <FormSelect
                label="Loan type"
                value={loanType}
                options={LOAN_TYPE_OPTIONS}
                colors={colors}
                placeholder="Select loan type"
                onChange={(value) => {
                  setLoanType(value);
                  if (lender && !getLenderOptions(value).some((o) => o.value === lender)) {
                    setLender('');
                  }
                }}
              />
            ) : null}

            <View style={[styles.gridRow, isCompact && styles.gridRowCompact]}>
              <View style={styles.gridCol}>
                <Field label="Principal (₹)" colors={colors}>
                  <TextInput
                    style={inputStyle}
                    value={principal}
                    onChangeText={setPrincipal}
                    keyboardType="numeric"
                    placeholder="500000"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
              </View>
              <View style={styles.gridCol}>
                <Field label="Tenure (months)" colors={colors}>
                  <TextInput
                    style={inputStyle}
                    value={tenureMonths}
                    onChangeText={setTenureMonths}
                    keyboardType="numeric"
                    placeholder="36"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
              </View>
            </View>

            <View style={[styles.gridRow, isCompact && styles.gridRowCompact]}>
              <View style={styles.gridCol}>
                <Field label="Interest rate (% p.a.)" colors={colors}>
                  <TextInput
                    style={inputStyle}
                    value={interestRate}
                    onChangeText={setInterestRate}
                    keyboardType="decimal-pad"
                    placeholder="10.5"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
              </View>
              <View style={styles.gridCol}>
                <Field
                  label="Monthly EMI (₹)"
                  colors={colors}
                  hint={autoEmiReady && !emiTouched ? 'Auto-calculated — tap to edit' : undefined}
                >
                  <TextInput
                    style={[inputStyle, autoEmiReady && !emiTouched && { borderColor: colors.primary }]}
                    value={emiAmount}
                    onChangeText={(text) => {
                      setEmiTouched(true);
                      setEmiAmount(text);
                    }}
                    keyboardType="numeric"
                    placeholder="12000"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
              </View>
            </View>

            <FormSelect
              label="Name of Lender/Bank"
              value={lender}
              options={lenderOptions}
              colors={colors}
              placeholder="Select lender or institution"
              onChange={setLender}
            />

            <Field label="First EMI due date" colors={colors}>
              <Pressable
                style={[styles.dateRow, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}
                onPress={() => setShowDatePicker(true)}
              >
                <MaterialIcons name="event" size={20} color={colors.primary} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, flex: 1 }}>
                  {formatDate(firstEmiDue)}
                </Text>
                <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
              </Pressable>
            </Field>

            <View style={[styles.summaryCard, { backgroundColor: colors.emeraldSoft, borderColor: colors.border }]}>
              <View style={styles.summaryRow}>
                <Text style={{ color: colors.emeraldText, fontWeight: '600' }}>Remaining amount</Text>
                <Text style={{ color: colors.emeraldText, fontWeight: '800', fontSize: 17 }}>
                  {formatCurrency(remainingPreview)}
                </Text>
              </View>
              {preview && preview.length > 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
                  {preview.length} EMIs of ~{formatCurrency(effectiveEmi)} • Total{' '}
                  {formatCurrency(calculateTotalPayable(principalNum, Number.isFinite(rateNum) ? rateNum : 0, tenureNum))} • Last due{' '}
                  {formatDate(preview[preview.length - 1].dueDateMillis)}
                </Text>
              ) : null}
            </View>
          </KeyboardAwareScrollView>

          {showDatePicker && Platform.OS === 'ios' && (
            <View style={[styles.pickerBar, { borderTopColor: colors.border, backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.pickerHeader}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>First EMI date</Text>
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker value={new Date(firstEmiDue)} mode="date" display="spinner" onValueChange={handleDateChange} />
            </View>
          )}
          {showDatePicker && Platform.OS === 'android' && (
            <DateTimePicker
              value={new Date(firstEmiDue)}
              mode="date"
              display="default"
              onValueChange={handleDateChange}
              onDismiss={() => setShowDatePicker(false)}
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
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
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', lineHeight: 26 },
  scroll: { flex: 1 },
  scrollContent: { gap: 16, paddingBottom: 16 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  hint: { fontSize: 11, lineHeight: 15, marginTop: -2 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  gridRow: { flexDirection: 'row', gap: 12 },
  gridRowCompact: { flexDirection: 'column' },
  gridCol: { flex: 1, minWidth: 0 },
  dateRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  summaryCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  emiStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 4,
  },
  manageEmiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  manageEmiBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pickerBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

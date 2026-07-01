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
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Liability } from '@/src/types/models';
import { themeColors } from '@/src/theme/colors';
import { formatDate } from '@/src/utils/format';
import { daysLeftLabel, LIABILITY_FREQUENCIES } from '@/src/utils/liabilitySchedule';

type ThemeColors = ReturnType<typeof themeColors>;

type Props = {
  visible: boolean;
  editing: Liability | null;
  colors: ThemeColors;
  onClose: () => void;
  onSave: (data: { name: string; amount: number; frequency: string; dueDateMillis: number }) => Promise<void>;
};

export function LiabilityFormModal({ visible, editing, colors, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('YEARLY');
  const [dueDate, setDueDate] = useState(Date.now() + 30 * 86400000);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      setAmount(String(editing.amount));
      setFrequency(editing.frequency);
      setDueDate(editing.dueDateMillis);
    } else {
      setName('');
      setAmount('');
      setFrequency('YEARLY');
      setDueDate(Date.now() + 30 * 86400000);
    }
    setShowDatePicker(false);
  }, [visible, editing]);

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setDueDate(date.getTime());
  };

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!name.trim() || isNaN(amt) || amt <= 0) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), amount: amt, frequency, dueDateMillis: dueDate });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceVariant },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
            {editing ? `Details with ${editing.name}` : 'Add Liability'}
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
            <Pressable style={[inputStyle, styles.dateField]} onPress={() => setShowDatePicker(true)}>
              <MaterialIcons name="event" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{formatDate(dueDate)}</Text>
              <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textMuted} />
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={new Date(dueDate)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={handleDateChange}
                onDismiss={() => setShowDatePicker(false)}
              />
            )}

            <View style={[styles.daysBadge, { backgroundColor: colors.emeraldSoft }]}>
              <MaterialIcons name="schedule" size={16} color={colors.emeraldText} />
              <Text style={{ color: colors.emeraldText, fontWeight: '700', fontSize: 13 }}>
                {daysLeftLabel(dueDate)}
              </Text>
            </View>

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

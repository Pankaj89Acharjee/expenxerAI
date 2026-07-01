import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SUBSCRIPTION_BILLING_CYCLES,
  SUBSCRIPTION_PURPOSES,
} from '@/src/constants/subscriptionPurposes';
import type { Subscription } from '@/src/types/models';
import { themeColors } from '@/src/theme/colors';

type ThemeColors = ReturnType<typeof themeColors>;

export type SubscriptionFormData = {
  name: string;
  cost: number;
  billingCycle: string;
  purpose: string;
  isAlertEnabled: boolean;
};

type Props = {
  visible: boolean;
  editing: Subscription | null;
  colors: ThemeColors;
  onClose: () => void;
  onSave: (data: SubscriptionFormData) => Promise<void>;
};

export function SubscriptionFormModal({ visible, editing, colors, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [billingCycle, setBillingCycle] = useState('MONTHLY');
  const [purpose, setPurpose] = useState('Entertainment');
  const [isAlertEnabled, setIsAlertEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      setCost(String(editing.cost));
      setBillingCycle(editing.billingCycle);
      setPurpose(editing.category);
      setIsAlertEnabled(editing.isAlertEnabled);
    } else {
      setName('');
      setCost('');
      setBillingCycle('MONTHLY');
      setPurpose('Entertainment');
      setIsAlertEnabled(true);
    }
  }, [visible, editing]);

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
            {editing ? `Details with ${editing.name}` : 'Add Subscription'}
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

            <Text style={[styles.label, { color: colors.textMuted }]}>Purpose</Text>
            <View style={styles.chipRow}>
              {SUBSCRIPTION_PURPOSES.map((p) => {
                const selected = purpose === p;
                return (
                  <Pressable
                    key={p}
                    style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceVariant }]}
                    onPress={() => setPurpose(p)}
                  >
                    <Text style={{ color: selected ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
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

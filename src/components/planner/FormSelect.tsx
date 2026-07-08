import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { themeColors } from '@/src/theme/colors';

type ThemeColors = ReturnType<typeof themeColors>;

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  label: string;
  value: T;
  options: SelectOption<T>[];
  colors: ThemeColors;
  placeholder?: string;
  onChange: (value: T) => void;
};

export function FormSelect<T extends string>({
  label,
  value,
  options,
  colors,
  placeholder = 'Select…',
  onChange,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <Pressable
        style={[styles.trigger, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
      >
        <Text
          style={[styles.triggerText, { color: selected ? colors.text : colors.textMuted }]}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <MaterialIcons name="arrow-drop-down" size={24} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.option,
                      {
                        backgroundColor: active ? colors.emeraldSoft : 'transparent',
                        borderBottomColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Text
                      style={{
                        color: active ? colors.primary : colors.text,
                        fontWeight: active ? '700' : '500',
                        fontSize: 15,
                        flex: 1,
                      }}
                    >
                      {option.label}
                    </Text>
                    {active ? <MaterialIcons name="check" size={20} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  trigger: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  triggerText: { flex: 1, fontSize: 15, fontWeight: '600' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    maxHeight: '70%',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', flex: 1 },
  list: { maxHeight: 420 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});

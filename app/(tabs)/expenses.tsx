import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { EXPENSE_CATEGORIES, FORM_CATEGORIES } from '@/src/constants/categories';
import { Colors, themeColors } from '@/src/theme/colors';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { formatCurrency, formatDate } from '@/src/utils/format';
import type { Expense } from '@/src/types/models';

const CATEGORY_ICONS: Record<string, string> = {
  Food: '🍔', Transport: '🚗', Utilities: '💡', Shopping: '🛍️', Entertainment: '🎬',
  Health: '💊', Housing: '🏠', Groceries: '🛒', Borrowing: '🤝', 'Credit-card': '💳', Other: '📦',
};

const SETTLEMENT_CATEGORIES = new Set(['Borrowing', 'Credit-card']);

const TIME_FRAMES = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '1m', label: '1 month', days: 30 },
  { key: '3m', label: '3 months', days: 90 },
  { key: '6m', label: '6 months', days: 180 },
] as const;

type TimeFrameKey = (typeof TIME_FRAMES)[number]['key'];

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function withinTimeFrame(dateMillis: number, days: number): boolean {
  const cutoff = Date.now() - days * 86_400_000;
  return dateMillis >= cutoff;
}

export default function ExpenseScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = themeColors(isDark);
  const expenses = useFinancialStore((s) => s.expenses);
  const categoryBudgets = useFinancialStore((s) => s.categoryBudgets);
  const addExpense = useFinancialStore((s) => s.addExpense);
  const updateExpense = useFinancialStore((s) => s.updateExpense);
  const deleteExpense = useFinancialStore((s) => s.deleteExpense);
  const suggestCategory = useFinancialStore((s) => s.suggestCategory);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [timeFrame, setTimeFrame] = useState<TimeFrameKey>('1m');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(startOfDay(Date.now()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [settlingExpense, setSettlingExpense] = useState<Expense | null>(null);
  const [settlementNote, setSettlementNote] = useState('');
  const [settlementDate, setSettlementDate] = useState(startOfDay(Date.now()));
  const [showSettlementDatePicker, setShowSettlementDatePicker] = useState(false);
  const [settlingSaving, setSettlingSaving] = useState(false);

  const isSettlementView = SETTLEMENT_CATEGORIES.has(selectedCategory);
  const activeTimeFrame = TIME_FRAMES.find((t) => t.key === timeFrame) ?? TIME_FRAMES[1];

  const categorySpent = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = e.category.toLowerCase();
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    return map;
  }, [expenses]);

  const filtered = useMemo(() => {
    const frameDays = isSettlementView ? activeTimeFrame.days : null;
    return expenses.filter((e) => {
      const matchSearch =
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.notes.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategory === 'All' || e.category === selectedCategory;
      const matchTime = frameDays == null || withinTimeFrame(e.dateMillis, frameDays);
      return matchSearch && matchCat && matchTime;
    });
  }, [expenses, search, selectedCategory, isSettlementView, activeTimeFrame.days]);

  const totalFiltered = useMemo(
    () => filtered.reduce((s, e) => s + e.amount, 0),
    [filtered]
  );

  const outstandingTotal = useMemo(
    () => filtered.filter((e) => !e.isSettled).reduce((s, e) => s + e.amount, 0),
    [filtered]
  );

  useEffect(() => {
    if (!showAdd || !title.trim()) {
      setAiSuggestion(null);
      return;
    }
    const amt = parseFloat(amount) || 0;
    const timer = setTimeout(async () => {
      setAiLoading(true);
      const suggested = await suggestCategory(title, amt, [...FORM_CATEGORIES]);
      setAiSuggestion(suggested);
      if (suggested !== 'Other') setCategory(suggested);
      setAiLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, amount, showAdd, suggestCategory]);

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setCategory('Food');
    setNotes('');
    setExpenseDate(startOfDay(Date.now()));
    setReceiptUri(null);
    setAiSuggestion(null);
    setShowDatePicker(false);
  };

  const openEdit = (exp: Expense) => {
    setEditing(exp);
    setTitle(exp.title);
    setAmount(String(exp.amount));
    setCategory(exp.category);
    setNotes(exp.notes);
    setExpenseDate(startOfDay(exp.dateMillis));
    setReceiptUri(exp.receiptPath ?? null);
    setShowAdd(true);
  };

  const handleDateValueChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    setExpenseDate(startOfDay(date.getTime()));
    if (Platform.OS === 'android') setShowDatePicker(false);
  };

  const handleSettlementDateChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    setSettlementDate(startOfDay(date.getTime()));
    if (Platform.OS === 'android') setShowSettlementDatePicker(false);
  };

  const handleCaptureReceipt = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to capture receipt photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setReceiptUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!title.trim() || isNaN(amt)) {
      Alert.alert('Missing details', 'Enter a title and valid amount.');
      return;
    }
    setSaving(true);
    let error: string | null = null;
    if (editing) {
      const isNewCapture = receiptUri?.startsWith('file://') || receiptUri?.startsWith('content://');
      error = await updateExpense(
        { ...editing, title, amount: amt, category, notes, dateMillis: expenseDate },
        isNewCapture ? receiptUri : null
      );
    } else {
      error = await addExpense(title, amt, category, notes, expenseDate, receiptUri);
    }
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error);
      return;
    }
    setShowAdd(false);
    setEditing(null);
    resetForm();
  };

  const closeModal = () => {
    setShowAdd(false);
    setEditing(null);
    resetForm();
  };

  const openSettlement = (exp: Expense) => {
    if (exp.isSettled) return;
    setSettlingExpense(exp);
    setSettlementNote('');
    setSettlementDate(startOfDay(Date.now()));
    setShowSettlementDatePicker(false);
  };

  const closeSettlement = () => {
    setSettlingExpense(null);
    setSettlementNote('');
    setShowSettlementDatePicker(false);
  };

  const handleConfirmSettlement = async () => {
    if (!settlingExpense) return;
    setSettlingSaving(true);
    const error = await updateExpense({
      ...settlingExpense,
      isSettled: true,
      settlementNote: settlementNote.trim() || null,
      settlementDateMillis: settlementDate,
    });
    setSettlingSaving(false);
    if (error) {
      Alert.alert('Settlement failed', error);
      return;
    }
    closeSettlement();
  };

  const handleDelete = (exp: Expense) => {
    Alert.alert('Delete expense', `Remove "${exp.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(exp) },
    ]);
  };

  const listHeader = (
    <View style={styles.headerBlock}>
      <TextInput
        style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
        placeholder="Search description or notes..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={styles.catRow}
      >
        {EXPENSE_CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            style={[
              styles.catChip,
              { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
              selectedCategory === cat && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.catChipText, { color: selectedCategory === cat ? '#fff' : colors.text }]}>
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {categoryBudgets.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={styles.budgetRow}>
          {categoryBudgets.map((b) => {
            const spent = categorySpent.get(b.category.toLowerCase()) ?? 0;
            const over = spent > b.limitAmount;
            return (
              <View
                key={b.id}
                style={[
                  styles.budgetCard,
                  { backgroundColor: over ? colors.errorContainer : colors.surfaceVariant, borderColor: over ? colors.error : colors.border },
                ]}
              >
                <Text style={[styles.budgetCat, { color: over ? colors.error : colors.text }]}>{b.category}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  ₹{spent.toFixed(1)} / ₹{b.limitAmount.toFixed(0)}
                </Text>
                <View style={[styles.budgetBar, { backgroundColor: colors.border }]}>
                  <View
                    style={{
                      height: '100%',
                      width: `${Math.min(spent / b.limitAmount, 1) * 100}%`,
                      backgroundColor: over ? colors.error : colors.primary,
                      borderRadius: 2,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {isSettlementView && (
        <View style={[styles.settlementCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.settlementHeader}>
            <MaterialIcons name="account-balance-wallet" size={22} color={colors.primary} />
            <Text style={[styles.settlementTitle, { color: colors.text }]}>
              {selectedCategory} — Settlement
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>
            Outstanding in last {activeTimeFrame.label}
          </Text>
          <Text style={[styles.settlementTotal, { color: colors.primary }]}>
            {formatCurrency(outstandingTotal)}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={styles.timeRow}>
            {TIME_FRAMES.map((frame) => (
              <Pressable
                key={frame.key}
                style={[
                  styles.timeChip,
                  { borderColor: colors.border, backgroundColor: colors.surfaceVariant },
                  timeFrame === frame.key && { backgroundColor: Colors.indigo, borderColor: Colors.indigo },
                ]}
                onPress={() => setTimeFrame(frame.key)}
              >
                <Text style={{ color: timeFrame === frame.key ? '#fff' : colors.text, fontSize: 13, fontWeight: '600' }}>
                  {frame.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
            Tap checkbox on an item to record payback
          </Text>
        </View>
      )}

      <View style={[styles.totalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {isSettlementView ? `Total (${activeTimeFrame.label})` : 'Filtered Total'}
        </Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{formatCurrency(totalFiltered)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{filtered.length} transactions</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.expenseItem,
              { backgroundColor: colors.card, borderColor: colors.border },
              item.isSettled && { opacity: 0.65 },
            ]}
            onPress={() => openEdit(item)}
            onLongPress={() => handleDelete(item)}
          >
            {isSettlementView ? (
              <Pressable
                style={[
                  styles.checkbox,
                  {
                    borderColor: item.isSettled ? colors.primary : colors.border,
                    backgroundColor: item.isSettled ? colors.primary : 'transparent',
                  },
                ]}
                onPress={() => openSettlement(item)}
                hitSlop={8}
              >
                {item.isSettled ? <MaterialIcons name="check" size={16} color="#fff" /> : null}
              </Pressable>
            ) : (
              <Text style={styles.expenseIcon}>{CATEGORY_ICONS[item.category] ?? '📦'}</Text>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.expenseTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.category} • {formatDate(item.dateMillis)}
              </Text>
              {item.isSettled && item.settlementDateMillis ? (
                <Text style={{ color: colors.emeraldText, fontSize: 11, marginTop: 2 }}>
                  Settled {formatDate(item.settlementDateMillis)}
                  {item.settlementNote ? ` — ${item.settlementNote}` : ''}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.expenseAmt, { color: colors.primary }]}>{formatCurrency(item.amount)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 24 }}>
            No expenses found. Tap + to add one.
          </Text>
        }
      />

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => {
          resetForm();
          setEditing(null);
          if (isSettlementView) setCategory(selectedCategory);
          setShowAdd(true);
        }}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Add / Edit expense modal */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? colors.card : colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editing ? 'Edit Expense' : 'Log New Expense'}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
              <TextInput
                style={[styles.modalInput, inputStyle(colors, isDark)]}
                placeholder="Title / Description"
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={setTitle}
              />
              <TextInput
                style={[styles.modalInput, inputStyle(colors, isDark)]}
                placeholder="Amount (₹)"
                placeholderTextColor={colors.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
              <Pressable style={[styles.modalInput, styles.dateField, inputStyle(colors, isDark)]} onPress={() => setShowDatePicker(true)}>
                <MaterialIcons name="event" size={20} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{formatDate(expenseDate)}</Text>
                <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textMuted} />
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={new Date(expenseDate)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={new Date()}
                  onValueChange={handleDateValueChange}
                  onDismiss={() => setShowDatePicker(false)}
                />
              )}
              {aiLoading && <Text style={{ color: colors.primary, fontSize: 12 }}>AI categorizing...</Text>}
              {aiSuggestion && <Text style={{ color: colors.emeraldText, fontSize: 12 }}>Suggested: {aiSuggestion}</Text>}
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Select Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formCatRow} keyboardShouldPersistTaps="handled">
                {FORM_CATEGORIES.map((cat) => {
                  const selected = category === cat;
                  return (
                    <Pressable
                      key={cat}
                      style={[styles.formCatChip, { backgroundColor: selected ? Colors.indigo : colors.surfaceVariant, borderColor: selected ? Colors.indigo : colors.border }]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={{ color: selected ? '#fff' : colors.emeraldText, fontSize: 13, fontWeight: '600' }}>{cat}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <TextInput
                style={[styles.modalInput, styles.notesInput, inputStyle(colors, isDark)]}
                placeholder="Notes (Optional)"
                placeholderTextColor={colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
              <Pressable style={[styles.receiptBtn, inputStyle(colors, isDark)]} onPress={handleCaptureReceipt}>
                <MaterialIcons name="photo-camera" size={22} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '500' }}>
                  {receiptUri ? 'Retake receipt photo' : 'Capture receipt photo'}
                </Text>
              </Pressable>
              {receiptUri ? <Image source={{ uri: receiptUri }} style={styles.receiptPreview} contentFit="cover" /> : null}
              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={closeModal} disabled={saving}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Settlement modal */}
      <Modal visible={!!settlingExpense} transparent animationType="fade" onRequestClose={closeSettlement}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Record Settlement</Text>
            {settlingExpense ? (
              <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 8 }}>
                {settlingExpense.title} — {formatCurrency(settlingExpense.amount)}
              </Text>
            ) : null}
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
              <Pressable
                style={[styles.modalInput, styles.dateField, inputStyle(colors, isDark)]}
                onPress={() => setShowSettlementDatePicker(true)}
              >
                <MaterialIcons name="event" size={20} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>Payback date: {formatDate(settlementDate)}</Text>
              </Pressable>
              {showSettlementDatePicker && (
                <DateTimePicker
                  value={new Date(settlementDate)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={new Date()}
                  onValueChange={handleSettlementDateChange}
                  onDismiss={() => setShowSettlementDatePicker(false)}
                />
              )}
              <TextInput
                style={[styles.modalInput, styles.notesInput, inputStyle(colors, isDark)]}
                placeholder="Note (optional)"
                placeholderTextColor={colors.textMuted}
                value={settlementNote}
                onChangeText={setSettlementNote}
                multiline
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={closeSettlement} disabled={settlingSaving}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleConfirmSettlement}
                  disabled={settlingSaving}
                >
                  {settlingSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>Confirm</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function inputStyle(colors: ReturnType<typeof themeColors>, isDark: boolean) {
  return {
    color: colors.text,
    borderColor: colors.border,
    backgroundColor: isDark ? colors.background : colors.surfaceVariant,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 88 },
  headerBlock: { gap: 10, paddingTop: 16 },
  search: { borderWidth: 1, borderRadius: 12, padding: 12 },
  catRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  catChipText: { fontSize: 13, fontWeight: '700' },
  budgetRow: { gap: 8, paddingVertical: 2 },
  budgetCard: { width: 160, padding: 10, borderRadius: 12, borderWidth: 1 },
  budgetCat: { fontWeight: '700', fontSize: 13 },
  budgetBar: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  settlementCard: { borderRadius: 14, padding: 14, borderWidth: 1 },
  settlementHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  settlementTitle: { fontSize: 16, fontWeight: '800' },
  settlementTotal: { fontSize: 26, fontWeight: '800', marginBottom: 10 },
  timeRow: { gap: 8 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  totalCard: { borderRadius: 12, padding: 14, borderWidth: 1 },
  expenseItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 12 },
  expenseIcon: { fontSize: 24, width: 28, textAlign: 'center' },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseTitle: { fontWeight: '700', fontSize: 15 },
  expenseAmt: { fontWeight: '800', fontSize: 15 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderRadius: 24,
    borderWidth: 1,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 8,
  },
  modalScroll: { gap: 12, paddingBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalInput: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  dateField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  formCatRow: { gap: 8, paddingVertical: 2 },
  formCatChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, height: 36, justifyContent: 'center' },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 },
  receiptPreview: { width: '100%', height: 120, borderRadius: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 4 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 4 },
  saveBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, minWidth: 96, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

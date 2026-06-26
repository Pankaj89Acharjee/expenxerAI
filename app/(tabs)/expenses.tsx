import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { EXPENSE_CATEGORIES, FORM_CATEGORIES } from '@/src/constants/categories';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import { formatCurrency, formatDate } from '@/src/utils/format';
import type { Expense } from '@/src/types/models';

const CATEGORY_ICONS: Record<string, string> = {
  Food: '🍔', Transport: '🚗', Utilities: '💡', Shopping: '🛍️', Entertainment: '🎬',
  Health: '💊', Housing: '🏠', Groceries: '🛒', Other: '📦',
};

export default function ExpenseScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const expenses = useFinancialStore((s) => s.expenses);
  const categoryBudgets = useFinancialStore((s) => s.categoryBudgets);
  const addExpense = useFinancialStore((s) => s.addExpense);
  const updateExpense = useFinancialStore((s) => s.updateExpense);
  const deleteExpense = useFinancialStore((s) => s.deleteExpense);
  const suggestCategory = useFinancialStore((s) => s.suggestCategory);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [notes, setNotes] = useState('');
  const [receiptScan, setReceiptScan] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const filtered = useMemo(() => expenses.filter((e) => {
    const matchSearch = e.title.toLowerCase().includes(search.toLowerCase()) || e.notes.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === 'All' || e.category === selectedCategory;
    return matchSearch && matchCat;
  }), [expenses, search, selectedCategory]);

  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0);

  useEffect(() => {
    if (!showAdd || !title.trim()) { setAiSuggestion(null); return; }
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

  const resetForm = () => { setTitle(''); setAmount(''); setCategory('Food'); setNotes(''); setReceiptScan(false); setAiSuggestion(null); };

  const openEdit = (exp: Expense) => {
    setEditing(exp);
    setTitle(exp.title);
    setAmount(String(exp.amount));
    setCategory(exp.category);
    setNotes(exp.notes);
    setShowAdd(true);
  };

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!title.trim() || isNaN(amt)) return;
    const finalNotes = receiptScan ? `[Receipt Scan] ${notes}` : notes;
    if (editing) {
      await updateExpense({ ...editing, title, amount: amt, category, notes: finalNotes });
    } else {
      await addExpense(title, amt, category, finalNotes);
    }
    setShowAdd(false);
    setEditing(null);
    resetForm();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TextInput
        style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
        placeholder="Search description or notes..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catRow}>
        {EXPENSE_CATEGORIES.map((cat) => (
          <Pressable key={cat} style={[styles.catChip, selectedCategory === cat && { backgroundColor: colors.primary }]} onPress={() => setSelectedCategory(cat)}>
            <Text style={[styles.catChipText, { color: selectedCategory === cat ? '#fff' : colors.textMuted }]}>{cat}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {categoryBudgets.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.budgetScroll}>
          {categoryBudgets.map((b) => {
            const spent = expenses.filter((e) => e.category.toLowerCase() === b.category.toLowerCase()).reduce((s, e) => s + e.amount, 0);
            const over = spent > b.limitAmount;
            return (
              <View key={b.id} style={[styles.budgetCard, { backgroundColor: over ? colors.errorContainer : colors.surfaceVariant, borderColor: over ? colors.error : colors.border }]}>
                <Text style={[styles.budgetCat, { color: over ? colors.error : colors.text }]}>{b.category}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>₹{spent.toFixed(1)} / ₹{b.limitAmount.toFixed(0)}</Text>
                <View style={[styles.budgetBar, { backgroundColor: colors.border }]}>
                  <View style={{ height: '100%', width: `${Math.min(spent / b.limitAmount, 1) * 100}%`, backgroundColor: over ? colors.error : colors.primary, borderRadius: 2 }} />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.totalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Filtered Total</Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{formatCurrency(totalFiltered)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{filtered.length} transactions</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 80 }}
        renderItem={({ item }) => (
          <Pressable style={[styles.expenseItem, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => openEdit(item)} onLongPress={() => deleteExpense(item)}>
            <Text style={styles.expenseIcon}>{CATEGORY_ICONS[item.category] ?? '📦'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.expenseTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.category} • {formatDate(item.dateMillis)}</Text>
            </View>
            <Text style={[styles.expenseAmt, { color: colors.primary }]}>{formatCurrency(item.amount)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 40 }}>No expenses found. Tap + to add one.</Text>}
      />

      <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => { resetForm(); setEditing(null); setShowAdd(true); }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300' }}>+</Text>
      </Pressable>

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editing ? 'Edit Expense' : 'Add Expense'}</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Title" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} />
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Amount (₹)" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="numeric" />
            {aiLoading && <Text style={{ color: colors.primary, fontSize: 12 }}>AI categorizing...</Text>}
            {aiSuggestion && <Text style={{ color: colors.emeraldText, fontSize: 12 }}>AI suggests: {aiSuggestion}</Text>}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {FORM_CATEGORIES.map((cat) => (
                <Pressable key={cat} style={[styles.catChip, category === cat && { backgroundColor: colors.primary }]} onPress={() => setCategory(cat)}>
                  <Text style={{ color: category === cat ? '#fff' : colors.textMuted, fontSize: 12 }}>{cat}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Notes" placeholderTextColor={colors.textMuted} value={notes} onChangeText={setNotes} multiline />
            <View style={styles.switchRow}>
              <Text style={{ color: colors.text }}>Simulate Receipt Scan</Text>
              <Switch value={receiptScan} onValueChange={setReceiptScan} trackColor={{ true: colors.primary }} />
            </View>
            <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => { setShowAdd(false); setEditing(null); resetForm(); }}>
              <Text style={{ color: colors.textMuted }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  search: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  catScroll: { maxHeight: 44, marginBottom: 8 },
  catRow: { gap: 8, paddingVertical: 4 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1F5F9' },
  catChipText: { fontSize: 13, fontWeight: '700' },
  budgetScroll: { maxHeight: 90, marginBottom: 8 },
  budgetCard: { width: 160, padding: 10, borderRadius: 12, borderWidth: 1, marginRight: 8 },
  budgetCat: { fontWeight: '700', fontSize: 13 },
  budgetBar: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  totalCard: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 12 },
  expenseItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 12 },
  expenseIcon: { fontSize: 24 },
  expenseTitle: { fontWeight: '700', fontSize: 15 },
  expenseAmt: { fontWeight: '800', fontSize: 15 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saveBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  cancelBtn: { padding: 10, alignItems: 'center' },
});

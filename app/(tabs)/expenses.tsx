import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardModalShell } from '@/src/components/KeyboardModalShell';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useColorScheme } from '@/components/useColorScheme';
import { EXPENSE_CATEGORIES, FORM_CATEGORIES } from '@/src/constants/categories';
import { Colors, themeColors } from '@/src/theme/colors';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { formatCurrency, formatDate } from '@/src/utils/format';
import {
  EXPENSE_TIME_PERIODS,
  type ExpenseTimePeriodKey,
  getExpenseRangeForPeriod,
  getPeriodMeta,
  isExpenseInRange,
  startOfDay,
} from '@/src/utils/expenseDateRange';
import { isPlannerLinkedExpense } from '@/src/utils/plannerExpenses';
import { plannerHref } from '@/src/utils/plannerNavigation';
import { completeReceiptAgentRun, runReceiptAgentGraph } from '@/src/services/receiptAgent';
import type { Expense, ReceiptExpenseDraft } from '@/src/types/models';

const CATEGORY_ICONS: Record<string, string> = {
  Food: '🍔', Transport: '🚗', Utilities: '💡', Shopping: '🛍️', Entertainment: '🎬',
  Health: '💊', Housing: '🏠', Groceries: '🛒', Borrowing: '🤝', Split: '👥',
  'Credit-card': '💳', Other: '📦',
};

const SETTLEMENT_CATEGORIES = new Set(['Borrowing']);
const LOAN_PLANNER_CATEGORIES = new Set(['Credit-card', 'Loan-Liability']);

type ExpenseRowColors = ReturnType<typeof themeColors>;

type ExpenseRowProps = {
  item: Expense;
  colors: ExpenseRowColors;
  showSettlementCheckbox: boolean;
  onPress: (item: Expense) => void;
  onLongPress: (item: Expense) => void;
  onSettlePress: (item: Expense) => void;
};

const ExpenseRow = memo(function ExpenseRow({
  item,
  colors,
  showSettlementCheckbox,
  onPress,
  onLongPress,
  onSettlePress,
}: ExpenseRowProps) {
  const plannerLinked = isPlannerLinkedExpense(item);
  return (
    <Pressable
      style={[
        styles.expenseItem,
        { backgroundColor: colors.card, borderColor: colors.border },
        item.isSettled && { opacity: 0.65 },
        plannerLinked && styles.expenseItemReadonly,
      ]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
    >
      {showSettlementCheckbox ? (
        <Pressable
          style={[
            styles.checkbox,
            {
              borderColor: item.isSettled ? colors.primary : colors.border,
              backgroundColor: item.isSettled ? colors.primary : 'transparent',
            },
          ]}
          onPress={() => onSettlePress(item)}
          hitSlop={8}
        >
          {item.isSettled ? <MaterialIcons name="check" size={16} color="#fff" /> : null}
        </Pressable>
      ) : (
        <Text style={styles.expenseIcon}>{CATEGORY_ICONS[item.category] ?? '📦'}</Text>
      )}
      <View style={styles.expenseCopy}>
        <Text style={[styles.expenseTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
          {item.category} • {formatDate(item.dateMillis)}
          {plannerLinked ? ' • Planner' : ''}
        </Text>
        {item.isSettled && item.settlementDateMillis ? (
          <Text style={{ color: colors.emeraldText, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
            Settled {formatDate(item.settlementDateMillis)}
            {item.settlementNote ? ` — ${item.settlementNote}` : ''}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.expenseAmt, { color: colors.primary }]}>{formatCurrency(item.amount)}</Text>
    </Pressable>
  );
});

export default function ExpenseScreen() {
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
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
  const [timePeriod, setTimePeriod] = useState<ExpenseTimePeriodKey>('month');
  const [customRangeStart, setCustomRangeStart] = useState(() => startOfDay(Date.now() - 30 * 86_400_000));
  const [customRangeEnd, setCustomRangeEnd] = useState(() => startOfDay(Date.now()));
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [showCustomStartPicker, setShowCustomStartPicker] = useState(false);
  const [showCustomEndPicker, setShowCustomEndPicker] = useState(false);
  const [draftPeriod, setDraftPeriod] = useState<ExpenseTimePeriodKey>('month');
  const [draftCustomStart, setDraftCustomStart] = useState(customRangeStart);
  const [draftCustomEnd, setDraftCustomEnd] = useState(customRangeEnd);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(startOfDay(Date.now()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptMimeType, setReceiptMimeType] = useState('image/jpeg');
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptScanning, setReceiptScanning] = useState(false);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptExpenseDraft | null>(null);
  const [receiptDraftQueue, setReceiptDraftQueue] = useState<ReceiptExpenseDraft[]>([]);
  const [receiptDraftNumber, setReceiptDraftNumber] = useState(0);
  const [receiptScanError, setReceiptScanError] = useState<string | null>(null);
  const [receiptRunId, setReceiptRunId] = useState<string | null>(null);

  const [settlingExpense, setSettlingExpense] = useState<Expense | null>(null);
  const [settlementNote, setSettlementNote] = useState('');
  const [settlementDate, setSettlementDate] = useState(startOfDay(Date.now()));
  const [showSettlementDatePicker, setShowSettlementDatePicker] = useState(false);
  const [settlingSaving, setSettlingSaving] = useState(false);

  useEffect(() => {
    if (categoryParam && (EXPENSE_CATEGORIES as readonly string[]).includes(categoryParam)) {
      setSelectedCategory(categoryParam);
    }
  }, [categoryParam]);

  // Settlement view is when the selected category is a settlement category
  const isSettlementView = SETTLEMENT_CATEGORIES.has(selectedCategory);
  const isLoanPlannerCategory = LOAN_PLANNER_CATEGORIES.has(selectedCategory);
  const activePeriod = getPeriodMeta(timePeriod);
  const expenseRange = useMemo(
    () => getExpenseRangeForPeriod(timePeriod, customRangeStart, customRangeEnd),
    [timePeriod, customRangeStart, customRangeEnd]
  );

  const categorySpent = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = e.category.toLowerCase();
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    return map;
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      const matchSearch =
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.notes.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategory === 'All' || e.category === selectedCategory;
      const matchTime = isExpenseInRange(e.dateMillis, expenseRange);
      return matchSearch && matchCat && matchTime;
    });
  }, [expenses, search, selectedCategory, expenseRange]);

  const totalFiltered = useMemo(
    () => filtered.reduce((s, e) => s + e.amount, 0),
    [filtered]
  );

  const outstandingTotal = useMemo(
    () => filtered.filter((e) => !e.isSettled).reduce((s, e) => s + e.amount, 0),
    [filtered]
  );

  useEffect(() => {
    if (!showAdd || !title.trim() || receiptDraft) {
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
  }, [title, amount, showAdd, suggestCategory, receiptDraft]);

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setCategory('Food');
    setNotes('');
    setExpenseDate(startOfDay(Date.now()));
    setReceiptUri(null);
    setReceiptMimeType('image/jpeg');
    setShowReceiptPreview(false);
    setAiSuggestion(null);
    setShowDatePicker(false);
    setReceiptScanning(false);
    setReceiptDraft(null);
    setReceiptDraftQueue([]);
    setReceiptDraftNumber(0);
    setReceiptScanError(null);
    setReceiptRunId(null);
  };

  const openEdit = useCallback(
    (exp: Expense) => {
      if (isPlannerLinkedExpense(exp)) {
        Alert.alert(
          'Planner expense',
          'This expense was created from Planner. Edit the subscription or loan in Planner. Long-press to delete it from Expenses.'
        );
        return;
      }
      setEditing(exp);
      setTitle(exp.title);
      setAmount(String(exp.amount));
      setCategory(exp.category);
      setNotes(exp.notes);
      setExpenseDate(startOfDay(exp.dateMillis));
      setReceiptUri(exp.receiptPath ?? null);
      setShowAdd(true);
    },
    []
  );

  const handleDateValueChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    setExpenseDate(startOfDay(date.getTime()));
    if (Platform.OS === 'android') setShowDatePicker(false);
  };

  const handleSettlementDateChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    setSettlementDate(startOfDay(date.getTime()));
    if (Platform.OS === 'android') setShowSettlementDatePicker(false);
  };

  const openPeriodPicker = () => {
    setDraftPeriod(timePeriod);
    setDraftCustomStart(customRangeStart);
    setDraftCustomEnd(customRangeEnd);
    setShowPeriodPicker(true);
  };

  const applyPeriodSelection = () => {
    setTimePeriod(draftPeriod);
    if (draftPeriod === 'custom') {
      setCustomRangeStart(draftCustomStart);
      setCustomRangeEnd(draftCustomEnd);
    }
    setShowPeriodPicker(false);
    setShowCustomStartPicker(false);
    setShowCustomEndPicker(false);
  };

  const handleDraftCustomStartChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    setDraftCustomStart(startOfDay(date.getTime()));
    if (Platform.OS === 'android') setShowCustomStartPicker(false);
  };

  const handleDraftCustomEndChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    setDraftCustomEnd(startOfDay(date.getTime()));
    if (Platform.OS === 'android') setShowCustomEndPicker(false);
  };

  const periodButtonLabel = timePeriod === 'custom' ? expenseRange.label : activePeriod.shortLabel;

  const scanSelectedReceipt = async (uri: string, mimeType: string) => {
    setReceiptUri(uri);
    setReceiptMimeType(mimeType);
    setReceiptDraft(null);
    setReceiptScanError(null);
    setReceiptScanning(true);
    try {
      const result = await runReceiptAgentGraph({ imageUri: uri, mimeType, existingExpenses: expenses });
      setReceiptRunId(result.runId);
      if (result.status !== 'awaiting_approval' || !result.drafts.length) {
        setReceiptScanError(result.error ?? 'The receipt agents could not create a draft.');
        return;
      }
      const [draft, ...remainingDrafts] = result.drafts;
      setReceiptDraft(draft);
      setReceiptDraftQueue(remainingDrafts);
      setReceiptDraftNumber(1);
      setTitle(draft.title);
      setAmount(draft.amount?.toString() ?? '');
      setCategory(draft.category);
      setExpenseDate(draft.dateMillis);
      setNotes(draft.notes);
    } catch (error) {
      setReceiptScanError(error instanceof Error ? error.message : 'Receipt scan failed.');
    } finally {
      setReceiptScanning(false);
    }
  };

  const selectReceiptPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      await scanSelectedReceipt(asset.uri, asset.mimeType ?? 'application/pdf');
    }
  };

  const previewReceipt = async () => {
    if (!receiptUri) return;
    if (receiptMimeType.startsWith('image/')) {
      setShowReceiptPreview(true);
      return;
    }
    try {
      if (Platform.OS === 'android') {
        const contentUri = receiptUri.startsWith('file://')
          ? await FileSystem.getContentUriAsync(receiptUri)
          : receiptUri;
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: receiptMimeType,
          flags: 1,
        });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(receiptUri, { mimeType: receiptMimeType, UTI: 'com.adobe.pdf' });
      }
    } catch {
      Alert.alert('Preview unavailable', 'No app is available to preview this PDF.');
    }
  };

  const selectReceipt = async (source: 'camera' | 'gallery') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    const { status } = permission;
    if (status !== 'granted') {
      Alert.alert('Permission needed', `Allow ${source} access to select receipt photos.`);
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (asset?.uri) {
      await scanSelectedReceipt(asset.uri, asset.mimeType ?? 'image/jpeg');
    }
  };

  const handleReceiptSource = () => {
    Alert.alert('Add receipt', 'The receipt agents will scan the selected image or PDF.', [
      { text: 'Camera', onPress: () => void selectReceipt('camera') },
      { text: 'Gallery', onPress: () => void selectReceipt('gallery') },
      { text: 'PDF document', onPress: () => void selectReceiptPdf() },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
    if (!editing && receiptDraftQueue.length > 0) {
      const [nextDraft, ...remainingDrafts] = receiptDraftQueue;
      setReceiptDraft(nextDraft);
      setReceiptDraftQueue(remainingDrafts);
      setReceiptDraftNumber((value) => value + 1);
      setTitle(nextDraft.title);
      setAmount(nextDraft.amount?.toString() ?? '');
      setCategory(nextDraft.category);
      setExpenseDate(nextDraft.dateMillis);
      setNotes(nextDraft.notes);
      Alert.alert('Expense added', `${receiptDraftQueue.length} detected expense${receiptDraftQueue.length === 1 ? '' : 's'} remaining for review.`);
      return;
    }
    if (receiptRunId) {
      await completeReceiptAgentRun(receiptRunId, 'approved').catch(() => undefined);
    }
    setShowAdd(false);
    setEditing(null);
    resetForm();
  };

  const closeModal = () => {
    if (receiptRunId) {
      void completeReceiptAgentRun(receiptRunId, 'cancelled');
    }
    setShowAdd(false);
    setEditing(null);
    resetForm();
  };

  const openSettlement = useCallback((exp: Expense) => {
    if (exp.isSettled) return;
    setSettlingExpense(exp);
    setSettlementNote('');
    setSettlementDate(startOfDay(Date.now()));
    setShowSettlementDatePicker(false);
  }, []);

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

  const handleDelete = useCallback(
    (exp: Expense) => {
      const plannerLinked = isPlannerLinkedExpense(exp);
      Alert.alert(
        'Delete expense',
        plannerLinked
          ? `Remove "${exp.title}" from Expenses? The subscription or loan in Planner is not changed.`
          : `Remove "${exp.title}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(exp) },
        ]
      );
    },
    [deleteExpense]
  );

  const renderExpenseItem = useCallback(
    ({ item }: { item: Expense }) => (
      <ExpenseRow
        item={item}
        colors={colors}
        showSettlementCheckbox={isSettlementView}
        onPress={openEdit}
        onLongPress={handleDelete}
        onSettlePress={openSettlement}
      />
    ),
    [colors, handleDelete, isSettlementView, openEdit, openSettlement]
  );

  const expenseKeyExtractor = useCallback((item: Expense) => item.id, []);

  const categoryChips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={styles.catRow}>
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
          <Text style={[styles.catChipText, { color: selectedCategory === cat ? '#fff' : colors.text }]}>{cat}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const budgetStrip =
    categoryBudgets.length > 0 ? (
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
    ) : null;

  const settlementPanel = isSettlementView ? (
    <View style={[styles.settlementCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.settlementHeader}>
        <MaterialIcons name="handshake" size={22} color={colors.primary} />
        <Text style={[styles.settlementTitle, { color: colors.text }]}>Informal Borrowing</Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>
        Peer-to-peer lending only. For loans and EMIs, use Planner → Loans & EMIs.
      </Text>
      <Text style={[styles.settlementTotal, { color: colors.primary }]}>{formatCurrency(outstandingTotal)}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>Tap checkbox on an item to record payback</Text>
    </View>
  ) : null;

  const loanPlannerPanel = isLoanPlannerCategory ? (
    <Pressable
      style={[styles.settlementCard, { backgroundColor: colors.emeraldSoft, borderColor: colors.border }]}
      onPress={() =>
        router.push(plannerHref(selectedCategory === 'Credit-card' ? 'CreditCards' : 'Loans'))
      }
    >
      <View style={styles.settlementHeader}>
        <MaterialIcons name="account-balance" size={22} color={colors.emeraldText} />
        <Text style={[styles.settlementTitle, { color: colors.emeraldText }]}>Track in Planner</Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
        {selectedCategory} belongs in Planner — Loans & EMIs or Credit Card Loans — with principal, tenure, rate, and EMI schedule.
      </Text>
      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13, marginTop: 10 }}>Open Planner →</Text>
    </Pressable>
  ) : null;

  const totalPanel = (
    <View style={[styles.totalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.totalCardTop}>
        <View style={styles.totalCardLeft}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {isSettlementView ? `Total (${expenseRange.label})` : `Filtered Total · ${expenseRange.label}`}
          </Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{formatCurrency(totalFiltered)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{filtered.length} transactions</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.periodBtn,
            { borderColor: colors.border, backgroundColor: colors.surfaceVariant },
            pressed && styles.periodBtnPressed,
          ]}
          onPress={openPeriodPicker}
          accessibilityRole="button"
          accessibilityLabel="Change time period"
        >
          <MaterialIcons name="date-range" size={16} color={colors.primary} />
          <Text style={[styles.periodBtnLabel, { color: colors.text }]} numberOfLines={1}>
            {periodButtonLabel}
          </Text>
          <MaterialIcons name="expand-more" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );

  const emptyList = (
    <Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 24 }}>
      No expenses found. Tap + to add one.
    </Text>
  );

  const settlementScrollHeader = (
    <View style={styles.headerBlock}>
      <TextInput
        style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
        placeholder="Search description or notes..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      {categoryChips}
      {loanPlannerPanel}
      {settlementPanel}
      {totalPanel}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isSettlementView ? (
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={expenseKeyExtractor}
          ListHeaderComponent={settlementScrollHeader}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={renderExpenseItem}
          ListEmptyComponent={emptyList}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          updateCellsBatchingPeriod={50}
        />
      ) : (
        <>
          <View style={styles.fixedTop}>
            <TextInput
              style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="Search description or notes..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {categoryChips}
            {loanPlannerPanel}
            {budgetStrip}
            {totalPanel}
          </View>
          <View style={[styles.listContainer, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <FlatList
              data={filtered}
              keyExtractor={expenseKeyExtractor}
              contentContainerStyle={styles.listContainerContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              renderItem={renderExpenseItem}
              ListEmptyComponent={emptyList}
              initialNumToRender={12}
              maxToRenderPerBatch={10}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              updateCellsBatchingPeriod={50}
            />
          </View>
        </>
      )}

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

      {/* Period filter modal */}
      <Modal visible={showPeriodPicker} transparent animationType="fade" onRequestClose={() => setShowPeriodPicker(false)}>
        <Pressable style={styles.periodModalOverlay} onPress={() => setShowPeriodPicker(false)}>
          <Pressable
            style={[styles.periodModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.periodModalHeader}>
              <Text style={[styles.periodModalTitle, { color: colors.text }]}>Time Period</Text>
              <Pressable onPress={() => setShowPeriodPicker(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.periodModalSubtitle, { color: colors.textMuted }]}>
              Filter expenses by date range
            </Text>
            <View style={styles.periodGrid}>
              {EXPENSE_TIME_PERIODS.map((period) => {
                const selected = draftPeriod === period.key;
                return (
                  <Pressable
                    key={period.key}
                    style={[
                      styles.periodOption,
                      { borderColor: colors.border, backgroundColor: colors.surfaceVariant },
                      selected && { backgroundColor: Colors.indigo, borderColor: Colors.indigo },
                    ]}
                    onPress={() => setDraftPeriod(period.key)}
                  >
                    <Text
                      style={[
                        styles.periodOptionLabel,
                        { color: selected ? '#fff' : colors.text },
                      ]}
                    >
                      {period.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {draftPeriod === 'custom' ? (
              <View style={[styles.customRangeBox, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}>
                <Text style={[styles.customRangeTitle, { color: colors.text }]}>Custom range</Text>
                <View style={styles.customRangeRow}>
                  <Pressable
                    style={[styles.customDateBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => setShowCustomStartPicker(true)}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>From</Text>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                      {formatDate(draftCustomStart)}
                    </Text>
                  </Pressable>
                  <MaterialIcons name="arrow-forward" size={18} color={colors.textMuted} />
                  <Pressable
                    style={[styles.customDateBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => setShowCustomEndPicker(true)}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>To</Text>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                      {formatDate(draftCustomEnd)}
                    </Text>
                  </Pressable>
                </View>
                {showCustomStartPicker ? (
                  <DateTimePicker
                    value={new Date(draftCustomStart)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onValueChange={handleDraftCustomStartChange}
                    onDismiss={() => setShowCustomStartPicker(false)}
                  />
                ) : null}
                {showCustomEndPicker ? (
                  <DateTimePicker
                    value={new Date(draftCustomEnd)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onValueChange={handleDraftCustomEndChange}
                    onDismiss={() => setShowCustomEndPicker(false)}
                  />
                ) : null}
              </View>
            ) : null}
            <Pressable
              style={[styles.periodApplyBtn, { backgroundColor: colors.primary }]}
              onPress={applyPeriodSelection}
            >
              <Text style={styles.periodApplyBtnText}>Apply</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add / Edit expense modal */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={closeModal}>
        {showAdd ? (
        <KeyboardModalShell>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? colors.card : colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editing ? 'Edit Expense' : 'Log New Expense'}
            </Text>
            <KeyboardAwareScrollView
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
              contentContainerStyle={styles.modalScroll}
              bottomOffset={24}
              extraKeyboardSpace={0}
              nestedScrollEnabled
            >
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
              <Pressable style={[styles.receiptBtn, inputStyle(colors, isDark)]} onPress={handleReceiptSource} disabled={receiptScanning}>
                {receiptScanning ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="document-scanner" size={22} color={colors.textMuted} />}
                <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '500' }}>
                  {receiptScanning ? 'Receipt agents are working…' : receiptUri ? 'Replace and rescan receipt' : 'Scan receipt with AI'}
                </Text>
              </Pressable>
              {receiptUri ? (
                <Pressable style={styles.receiptPreviewButton} onPress={() => void previewReceipt()}>
                  {receiptMimeType.startsWith('image/') ? (
                    <Image source={{ uri: receiptUri }} style={styles.receiptPreview} contentFit="cover" />
                  ) : (
                    <View style={[styles.pdfPreview, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
                      <MaterialIcons name="picture-as-pdf" size={38} color={colors.error} />
                      <Text style={{ color: colors.text, fontWeight: '700' }}>Receipt PDF</Text>
                    </View>
                  )}
                  <View style={styles.previewBadge}>
                    <MaterialIcons name="visibility" size={15} color="#fff" />
                    <Text style={styles.previewBadgeText}>Tap to preview</Text>
                  </View>
                </Pressable>
              ) : null}
              {receiptDraft ? (
                <View style={[styles.receiptAgentResult, { backgroundColor: colors.emeraldSoft, borderColor: colors.border }]}>
                  <Text style={{ color: colors.emeraldText, fontWeight: '800', fontSize: 13 }}>
                    AI draft ready · {Math.round(receiptDraft.confidence * 100)}% confidence
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
                    Expense {receiptDraftNumber} of {receiptDraftNumber + receiptDraftQueue.length}. Review and Save it to load the next detected category.
                  </Text>
                  {[receiptDraft, ...receiptDraftQueue].map((draft, index) => (
                    <View key={`${draft.category}-${draft.title}-${index}`} style={[styles.detectedExpenseRow, { borderColor: colors.border }]}>
                      <MaterialIcons name={index === 0 ? 'edit' : 'schedule'} size={17} color={index === 0 ? colors.primary : colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }} numberOfLines={2}>{draft.title}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{draft.category} · {formatCurrency(draft.amount ?? 0)}</Text>
                      </View>
                    </View>
                  ))}
                  {receiptDraft.warnings.map((warning) => (
                    <Text key={warning} style={{ color: colors.error, fontSize: 12, marginTop: 4 }}>• {warning}</Text>
                  ))}
                </View>
              ) : null}
              {receiptScanError ? (
                <Text style={{ color: colors.error, fontSize: 12 }}>{receiptScanError} Enter the details manually or rescan.</Text>
              ) : null}
              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={closeModal} disabled={saving}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving || receiptScanning}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
                </Pressable>
              </View>
            </KeyboardAwareScrollView>
          </View>
        </View>
        </KeyboardModalShell>
        ) : null}
      </Modal>

      <Modal visible={showReceiptPreview} transparent animationType="fade" onRequestClose={() => setShowReceiptPreview(false)}>
        <View style={styles.fullPreviewOverlay}>
          <Pressable style={styles.fullPreviewClose} onPress={() => setShowReceiptPreview(false)} hitSlop={12}>
            <MaterialIcons name="close" size={28} color="#fff" />
          </Pressable>
          {receiptUri && receiptMimeType.startsWith('image/') ? (
            <Image source={{ uri: receiptUri }} style={styles.fullPreviewImage} contentFit="contain" />
          ) : null}
        </View>
      </Modal>

      {/* Settlement modal */}
      <Modal visible={!!settlingExpense} transparent animationType="fade" onRequestClose={closeSettlement}>
        {settlingExpense ? (
        <KeyboardModalShell>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Record Settlement</Text>
            {settlingExpense ? (
              <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 8 }}>
                {settlingExpense.title} — {formatCurrency(settlingExpense.amount)}
              </Text>
            ) : null}
            <KeyboardAwareScrollView
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
              contentContainerStyle={styles.modalScroll}
              bottomOffset={24}
              extraKeyboardSpace={0}
              nestedScrollEnabled
            >
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
            </KeyboardAwareScrollView>
          </View>
        </View>
        </KeyboardModalShell>
        ) : null}
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
  fixedTop: { paddingHorizontal: 16, paddingTop: 16, gap: 10, paddingBottom: 8 },
  listContainer: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  listContainerContent: { padding: 12, paddingBottom: 88 },
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
  totalCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 0 },
  totalCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  totalCardLeft: { flex: 1, minWidth: 0, gap: 2 },
  periodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 130,
    flexShrink: 0,
  },
  periodBtnPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  periodBtnLabel: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
  periodModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  periodModalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  periodModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  periodModalTitle: { fontSize: 18, fontWeight: '800' },
  periodModalSubtitle: { fontSize: 12, marginTop: -4 },
  periodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodOption: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  periodOptionLabel: { fontSize: 13, fontWeight: '700' },
  customRangeBox: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  customRangeTitle: { fontSize: 13, fontWeight: '700' },
  customRangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  customDateBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 10 },
  periodApplyBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  periodApplyBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  expenseItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 12 },
  expenseItemReadonly: { opacity: 0.85 },
  expenseIcon: { fontSize: 24, width: 28, textAlign: 'center' },
  expenseCopy: { flex: 1, minWidth: 0 },
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
    overflow: 'hidden',
  },
  modalScrollView: { flexGrow: 0, flexShrink: 1 },
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
  receiptPreviewButton: { position: 'relative' },
  pdfPreview: { height: 120, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  previewBadge: { position: 'absolute', right: 8, bottom: 8, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: 'rgba(0,0,0,0.72)', flexDirection: 'row', alignItems: 'center', gap: 5 },
  previewBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  receiptAgentResult: { borderWidth: 1, borderRadius: 12, padding: 12 },
  detectedExpenseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8 },
  fullPreviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center', alignItems: 'center' },
  fullPreviewClose: { position: 'absolute', top: 48, right: 20, zIndex: 2, padding: 8 },
  fullPreviewImage: { width: '100%', height: '100%' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 4 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 4 },
  saveBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, minWidth: 96, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

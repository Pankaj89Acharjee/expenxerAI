import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
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
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import { BillFormModal } from '@/src/components/planner/BillFormModal';
import type { BillFormData } from '@/src/components/planner/BillFormModal';
import { LiabilityFormModal } from '@/src/components/planner/LiabilityFormModal';
import { LiabilityManageModal } from '@/src/components/planner/LiabilityManageModal';
import { SubscriptionFormModal } from '@/src/components/planner/SubscriptionFormModal';
import type { SubscriptionFormData } from '@/src/components/planner/SubscriptionFormModal';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import type { Bill, BudgetTemplate, Liability, Subscription } from '@/src/types/models';
import { currentMonthYear, formatCurrency, formatDate } from '@/src/utils/format';
import { daysLeftLabel, getLiabilityRemainingAmount } from '@/src/utils/liabilitySchedule';
import { billListIcon, liabilityListIcon, subscriptionListIcon } from '@/src/utils/plannerIcons';

type Tab = 'Liabilities' | 'Subscriptions' | 'Bills' | 'Templates';

const TAB_HINTS: Record<Tab, string> = {
  Liabilities: 'Large periodic obligations (insurance, tax). Not monthly services.',
  Subscriptions: 'Recurring digital services — streaming, SaaS, apps.',
  Bills: 'Fixed household bills — rent, electricity, school fees.',
  Templates: 'Reusable monthly budget presets. Apply to set category limits.',
};

const TAB_LABELS: Record<Tab, string> = {
  Liabilities: 'Annual Liabilities',
  Subscriptions: 'Subscriptions',
  Bills: 'Bills',
  Templates: 'Budget Templates',
};

export default function PlannerScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = themeColors(isDark);
  const insets = useSafeAreaInsets();

  const liabilities = useFinancialStore((s) => s.liabilities);
  const subscriptions = useFinancialStore((s) => s.subscriptions);
  const bills = useFinancialStore((s) => s.bills);
  const templates = useFinancialStore((s) => s.budgetTemplates);
  const addLiability = useFinancialStore((s) => s.addLiability);
  const updateLiability = useFinancialStore((s) => s.updateLiability);
  const deleteLiability = useFinancialStore((s) => s.deleteLiability);
  const addSubscription = useFinancialStore((s) => s.addSubscription);
  const updateSubscription = useFinancialStore((s) => s.updateSubscription);
  const toggleSubscriptionAlert = useFinancialStore((s) => s.toggleSubscriptionAlert);
  const stopSubscription = useFinancialStore((s) => s.stopSubscription);
  const deleteSubscription = useFinancialStore((s) => s.deleteSubscription);
  const addBill = useFinancialStore((s) => s.addBill);
  const updateBill = useFinancialStore((s) => s.updateBill);
  const toggleBillAlert = useFinancialStore((s) => s.toggleBillAlert);
  const stopBill = useFinancialStore((s) => s.stopBill);
  const deleteBill = useFinancialStore((s) => s.deleteBill);
  const addTemplate = useFinancialStore((s) => s.addTemplate);
  const deleteTemplate = useFinancialStore((s) => s.deleteTemplate);
  const applyTemplate = useFinancialStore((s) => s.applyTemplate);

  const [activeTab, setActiveTab] = useState<Tab>('Liabilities');
  const [showLiabilityForm, setShowLiabilityForm] = useState(false);
  const [editingLiability, setEditingLiability] = useState<Liability | null>(null);
  const [managingLiability, setManagingLiability] = useState<Liability | null>(null);
  const [showSubscriptionForm, setShowSubscriptionForm] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);

  const [templateName, setTemplateName] = useState('');
  const [templateIncome, setTemplateIncome] = useState('5000');
  const [limitFood, setLimitFood] = useState('500');
  const [limitTransport, setLimitTransport] = useState('150');
  const [limitUtilities, setLimitUtilities] = useState('300');
  const [limitShopping, setLimitShopping] = useState('250');
  const [limitEntertainment, setLimitEntertainment] = useState('200');
  const [limitOther, setLimitOther] = useState('150');
  const [templateGoalName, setTemplateGoalName] = useState('Vacation Fund');
  const [templateGoalAmount, setTemplateGoalAmount] = useState('100');
  const [applyConfirm, setApplyConfirm] = useState<BudgetTemplate | null>(null);

  const tabs: Tab[] = ['Liabilities', 'Subscriptions', 'Bills', 'Templates'];
  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceVariant },
  ];
  const listBottomPad = 80 + insets.bottom;

  const openAddLiability = () => {
    setEditingLiability(null);
    setShowLiabilityForm(true);
  };

  const openEditLiability = (item: Liability) => {
    setEditingLiability(item);
    setShowLiabilityForm(true);
  };

  const openAddSubscription = () => {
    setEditingSubscription(null);
    setShowSubscriptionForm(true);
  };

  const openEditSubscription = (item: Subscription) => {
    setEditingSubscription(item);
    setShowSubscriptionForm(true);
  };

  const openAddBill = () => {
    setEditingBill(null);
    setShowBillForm(true);
  };

  const openEditBill = (item: Bill) => {
    setEditingBill(item);
    setShowBillForm(true);
  };

  const handleLiabilitySave = async (data: {
    name: string;
    amount: number;
    frequency: string;
    dueDateMillis: number;
  }) => {
    if (editingLiability) {
      await updateLiability({ ...editingLiability, ...data });
    } else {
      await addLiability(data.name, data.amount, data.frequency, data.dueDateMillis);
    }
  };

  const handleManageSave = async (liability: Liability, paymentScheduleJson: string) => {
    await updateLiability({ ...liability, paymentScheduleJson });
  };

  const handleSubscriptionSave = async (data: SubscriptionFormData) => {
    if (editingSubscription) {
      await updateSubscription({
        ...editingSubscription,
        name: data.name,
        cost: data.cost,
        billingCycle: data.billingCycle,
        category: data.purpose,
        isAlertEnabled: data.isAlertEnabled,
      });
    } else {
      await addSubscription(data.name, data.cost, data.billingCycle, data.purpose, data.isAlertEnabled);
    }
  };

  const confirmStopSubscription = (item: Subscription) => {
    Alert.alert(
      'Stop Subscription',
      `Stop tracking "${item.name}"? Alerts will be turned off.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: () => stopSubscription(item) },
      ]
    );
  };

  const handleBillSave = async (data: BillFormData) => {
    if (editingBill) {
      await updateBill({
        ...editingBill,
        name: data.name,
        amount: data.amount,
        billingCycle: data.billingCycle,
        category: data.purpose,
        isAlertEnabled: data.isAlertEnabled,
      });
    } else {
      await addBill(data.name, data.amount, data.billingCycle, data.purpose, data.isAlertEnabled);
    }
  };

  const confirmStopBill = (item: Bill) => {
    Alert.alert(
      'Stop Bill',
      `Stop tracking "${item.name}"? Alerts will be turned off.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: () => stopBill(item) },
      ]
    );
  };

  const handleFabPress = () => {
    if (activeTab === 'Liabilities') openAddLiability();
    else if (activeTab === 'Subscriptions') openAddSubscription();
    else if (activeTab === 'Bills') openAddBill();
    else setShowTemplateForm(true);
  };

  const handleSaveTemplate = async () => {
    const income = parseFloat(templateIncome) || 5000;
    await addTemplate(templateName || 'My Budget', income, {
      Food: parseFloat(limitFood) || 500,
      Transport: parseFloat(limitTransport) || 150,
      Utilities: parseFloat(limitUtilities) || 300,
      Shopping: parseFloat(limitShopping) || 250,
      Entertainment: parseFloat(limitEntertainment) || 200,
      Other: parseFloat(limitOther) || 150,
    }, { [templateGoalName || 'Vacation Fund']: parseFloat(templateGoalAmount) || 100 });
    setShowTemplateForm(false);
  };

  const renderListIcon = (iconName: keyof typeof MaterialIcons.glyphMap) => (
    <View style={[styles.listIconWrap, { backgroundColor: colors.emeraldSoft }]}>
      <MaterialIcons name={iconName} size={22} color={colors.primary} />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.tabHeader}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
          style={styles.tabScroll}
        >
          {tabs.map((tab) => {
            const selected = activeTab === tab;
            return (
              <Pressable
                key={tab}
                style={[
                  styles.tab,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setActiveTab(tab)}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: selected ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 12 }}
                >
                  {TAB_LABELS[tab]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={[styles.tabHint, { color: colors.textMuted }]} numberOfLines={2}>
          {TAB_HINTS[activeTab]}
        </Text>
      </View>

      {activeTab === 'Liabilities' && (
        <FlatList
          data={liabilities}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              No liabilities tracked. Tap + to add.
            </Text>
          }
          renderItem={({ item }: { item: Liability }) => (
            <View style={[styles.listItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {renderListIcon(liabilityListIcon())}
              <View style={styles.listItemBody}>
                <Pressable onPress={() => openEditLiability(item)}>
                  <Text style={[styles.detailsLink, { color: colors.primary }]}>
                    Details with {item.name}
                  </Text>
                </Pressable>
                <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                  {item.frequency.replace('_', ' ')} • Due {formatDate(item.dueDateMillis)}
                </Text>
                <View style={[styles.daysChip, { backgroundColor: colors.emeraldSoft }]}>
                  <MaterialIcons name="schedule" size={14} color={colors.emeraldText} />
                  <Text style={{ color: colors.emeraldText, fontSize: 12, fontWeight: '600' }}>
                    {daysLeftLabel(item.dueDateMillis)}
                  </Text>
                </View>
              </View>
              <View style={styles.listItemActions}>
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>
                  {formatCurrency(getLiabilityRemainingAmount(item))}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>
                  of {formatCurrency(item.amount)}
                </Text>
                <View style={styles.iconRow}>
                  <Pressable
                    style={[styles.iconBtn, { backgroundColor: colors.surfaceVariant }]}
                    onPress={() => setManagingLiability(item)}
                    accessibilityLabel={`Manage payment plan for ${item.name}`}
                  >
                    <MaterialIcons name="calendar-month" size={18} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    style={[styles.iconBtn, { backgroundColor: colors.surfaceVariant }]}
                    onPress={() => deleteLiability(item)}
                  >
                    <MaterialIcons name="close" size={18} color={colors.error} />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {activeTab === 'Subscriptions' && (
        <FlatList
          data={subscriptions}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>No subscriptions tracked.</Text>
          }
          renderItem={({ item }: { item: Subscription }) => {
            const stopped = !item.isActive;
            return (
              <View
                style={[
                  styles.listItem,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: stopped ? 0.65 : 1,
                  },
                ]}
              >
                {renderListIcon(subscriptionListIcon(item.category))}
                <View style={styles.listItemBody}>
                  <Pressable onPress={() => openEditSubscription(item)} disabled={stopped}>
                    <Text
                      style={[
                        styles.detailsLink,
                        {
                          color: colors.primary,
                          textDecorationLine: stopped ? 'line-through' : 'underline',
                        },
                      ]}
                    >
                      Details with {item.name}
                    </Text>
                  </Pressable>
                  <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                    {item.billingCycle} • {item.category}
                    {stopped ? ' • Stopped' : ` • Next ${formatDate(item.nextPaymentMillis)}`}
                  </Text>
                  {!stopped && (
                    <View style={styles.switchRow}>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Alert</Text>
                      <Switch
                        value={item.isAlertEnabled}
                        onValueChange={() => toggleSubscriptionAlert(item)}
                        trackColor={{ true: colors.primary }}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.listItemActions}>
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>
                    {formatCurrency(item.cost)}
                    <Text style={{ fontSize: 11, fontWeight: '600' }}>
                      /{item.billingCycle === 'YEARLY' ? 'yr' : 'mo'}
                    </Text>
                  </Text>
                  <View style={styles.iconRow}>
                    {!stopped && (
                      <Pressable
                        style={[styles.iconBtn, { backgroundColor: colors.surfaceVariant }]}
                        onPress={() => confirmStopSubscription(item)}
                        accessibilityLabel={`Stop subscription ${item.name}`}
                      >
                        <MaterialIcons name="pause-circle-outline" size={20} color={colors.tertiary} />
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.iconBtn, { backgroundColor: colors.surfaceVariant }]}
                      onPress={() => deleteSubscription(item)}
                    >
                      <MaterialIcons name="close" size={18} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {activeTab === 'Bills' && (
        <FlatList
          data={bills}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>No bills tracked. Tap + to add rent, utilities, etc.</Text>
          }
          renderItem={({ item }: { item: Bill }) => {
            const stopped = !item.isActive;
            return (
              <View
                style={[
                  styles.listItem,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: stopped ? 0.65 : 1,
                  },
                ]}
              >
                {renderListIcon(billListIcon(item.category))}
                <View style={styles.listItemBody}>
                  <Pressable onPress={() => openEditBill(item)} disabled={stopped}>
                    <Text
                      style={[
                        styles.detailsLink,
                        {
                          color: colors.primary,
                          textDecorationLine: stopped ? 'line-through' : 'underline',
                        },
                      ]}
                    >
                      Details with {item.name}
                    </Text>
                  </Pressable>
                  <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                    {item.billingCycle} • {item.category}
                    {stopped ? ' • Stopped' : ` • Next ${formatDate(item.nextPaymentMillis)}`}
                  </Text>
                  {!stopped && (
                    <View style={styles.switchRow}>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Alert</Text>
                      <Switch
                        value={item.isAlertEnabled}
                        onValueChange={() => toggleBillAlert(item)}
                        trackColor={{ true: colors.primary }}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.listItemActions}>
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>
                    {formatCurrency(item.amount)}
                    <Text style={{ fontSize: 11, fontWeight: '600' }}>
                      /{item.billingCycle === 'YEARLY' ? 'yr' : item.billingCycle === 'QUARTERLY' ? 'qtr' : 'mo'}
                    </Text>
                  </Text>
                  <View style={styles.iconRow}>
                    {!stopped && (
                      <Pressable
                        style={[styles.iconBtn, { backgroundColor: colors.surfaceVariant }]}
                        onPress={() => confirmStopBill(item)}
                        accessibilityLabel={`Stop bill ${item.name}`}
                      >
                        <MaterialIcons name="pause-circle-outline" size={20} color={colors.tertiary} />
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.iconBtn, { backgroundColor: colors.surfaceVariant }]}
                      onPress={() => deleteBill(item)}
                    >
                      <MaterialIcons name="close" size={18} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {activeTab === 'Templates' && (
        <FlatList
          data={templates}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>No budget templates. Tap + to create one.</Text>
          }
          renderItem={({ item }: { item: BudgetTemplate }) => (
            <View style={[styles.listItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.listIconWrap, { backgroundColor: colors.emeraldSoft }]}>
                <MaterialIcons name="dashboard" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                  Income: {formatCurrency(item.monthlyIncome)}
                </Text>
              </View>
              <Pressable
                style={[styles.applyBtn, { backgroundColor: colors.primary }]}
                onPress={() => setApplyConfirm(item)}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Apply</Text>
              </Pressable>
              <Pressable onPress={() => deleteTemplate(item)} style={styles.deleteTap}>
                <MaterialIcons name="close" size={20} color={colors.error} />
              </Pressable>
            </View>
          )}
        />
      )}

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary, bottom: 20 + insets.bottom }]}
        onPress={handleFabPress}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </Pressable>

      <LiabilityFormModal
        visible={showLiabilityForm}
        editing={editingLiability}
        colors={colors}
        onClose={() => {
          setShowLiabilityForm(false);
          setEditingLiability(null);
        }}
        onSave={handleLiabilitySave}
      />

      <LiabilityManageModal
        visible={!!managingLiability}
        liability={managingLiability}
        colors={colors}
        onClose={() => setManagingLiability(null)}
        onSave={handleManageSave}
      />

      <SubscriptionFormModal
        visible={showSubscriptionForm}
        editing={editingSubscription}
        colors={colors}
        onClose={() => {
          setShowSubscriptionForm(false);
          setEditingSubscription(null);
        }}
        onSave={handleSubscriptionSave}
      />

      <BillFormModal
        visible={showBillForm}
        editing={editingBill}
        colors={colors}
        onClose={() => {
          setShowBillForm(false);
          setEditingBill(null);
        }}
        onSave={handleBillSave}
      />

      <Modal visible={showTemplateForm} transparent animationType="fade" onRequestClose={() => setShowTemplateForm(false)}>
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: Math.max(insets.top, 20),
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowTemplateForm(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create Budget Template</Text>
            <KeyboardAwareScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bottomOffset={24}
              extraKeyboardSpace={16}
            >
              <TextInput style={inputStyle} placeholder="Template Name" placeholderTextColor={colors.textMuted} value={templateName} onChangeText={setTemplateName} />
              <TextInput style={inputStyle} placeholder="Monthly Income" placeholderTextColor={colors.textMuted} value={templateIncome} onChangeText={setTemplateIncome} keyboardType="numeric" />
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Category Limits</Text>
              {([['Food', limitFood, setLimitFood], ['Transport', limitTransport, setLimitTransport], ['Utilities', limitUtilities, setLimitUtilities], ['Shopping', limitShopping, setLimitShopping], ['Entertainment', limitEntertainment, setLimitEntertainment], ['Other', limitOther, setLimitOther]] as const).map(([label, val, setter]) => (
                <TextInput key={label} style={inputStyle} placeholder={`${label} Limit`} placeholderTextColor={colors.textMuted} value={val} onChangeText={setter} keyboardType="numeric" />
              ))}
              <TextInput style={inputStyle} placeholder="Savings Goal Name" placeholderTextColor={colors.textMuted} value={templateGoalName} onChangeText={setTemplateGoalName} />
              <TextInput style={inputStyle} placeholder="Goal Monthly Amount" placeholderTextColor={colors.textMuted} value={templateGoalAmount} onChangeText={setTemplateGoalAmount} keyboardType="numeric" />
              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancelBtn} onPress={() => setShowTemplateForm(false)}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveTemplate}>
                  <Text style={styles.modalSaveBtnText}>Save</Text>
                </Pressable>
              </View>
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!applyConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.applyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Apply Template?</Text>
            <Text style={{ color: colors.textMuted, marginBottom: 8 }}>
              Apply "{applyConfirm?.name}" to {currentMonthYear()}?
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setApplyConfirm(null)}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  if (applyConfirm) {
                    await applyTemplate(applyConfirm, currentMonthYear());
                    Alert.alert('Applied', 'Budget template applied successfully.');
                  }
                  setApplyConfirm(null);
                }}
              >
                <Text style={styles.modalSaveBtnText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  tabHeader: { marginBottom: 10, gap: 6 },
  tabScroll: { flexGrow: 0 },
  tabRow: { gap: 8, paddingRight: 8, alignItems: 'center' },
  tabHint: { fontSize: 10, lineHeight: 13, marginBottom: 2, paddingHorizontal: 2 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  listContent: { paddingTop: 4 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  listIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  listItemBody: { flex: 1, gap: 6 },
  listItemActions: { alignItems: 'flex-end', gap: 10 },
  itemName: { fontWeight: '700', fontSize: 16 },
  detailsLink: { fontWeight: '700', fontSize: 15, textDecorationLine: 'underline' },
  itemMeta: { fontSize: 13 },
  daysChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  iconRow: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  applyBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  deleteTap: { padding: 4, marginLeft: 4 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 15 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
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
  applyCard: { paddingBottom: 16 },
  modalScroll: { flexGrow: 0, flexShrink: 1 },
  modalScrollContent: { gap: 12, paddingBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  fieldLabel: { fontWeight: '600', fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 4 },
  modalSaveBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, minWidth: 96, alignItems: 'center' },
  modalSaveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

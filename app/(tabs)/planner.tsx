import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardModalShell } from '@/src/components/KeyboardModalShell';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import { BillFormModal } from '@/src/components/planner/BillFormModal';
import type { BillFormData } from '@/src/components/planner/BillFormModal';
import { LiabilityFormModal, type LiabilityFormData } from '@/src/components/planner/LiabilityFormModal';
import { LoanFormModal, type LoanFormData, type LoanFormVariant } from '@/src/components/planner/LoanFormModal';
import { LiabilityManageModal } from '@/src/components/planner/LiabilityManageModal';
import { SubscriptionFormModal } from '@/src/components/planner/SubscriptionFormModal';
import type { SubscriptionFormData } from '@/src/components/planner/SubscriptionFormModal';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import type { Bill, BudgetTemplate, Liability, Subscription } from '@/src/types/models';
import { currentMonthYear, formatCurrency, formatDate } from '@/src/utils/format';
import { loanTypeLabel } from '@/src/constants/loanTypes';
import { daysLeftLabel, getCurrentMonthEmiStatus, getLiabilityListPaidBadge, getLiabilityRemainingAmount, getNextUnpaidInstallment, getPaymentHistorySummary, isAnnualFrequency, isCreditCardLoanLiability, isLoanLiability, buildSchedule, serializeInstallments, shouldRecordPayment } from '@/src/utils/liabilitySchedule';
import { getRecurringPaymentStatus, recurringPaymentStatusLabel, wasRecentlyPaid } from '@/src/utils/recurringBilling';
import { billListIcon, liabilityListIcon, subscriptionListIcon } from '@/src/utils/plannerIcons';
import { PLANNER_TAB_HINTS, PLANNER_TAB_LABELS, PLANNER_TABS, type PlannerTab } from '@/src/constants/plannerTabs';
import { parsePlannerTabParam } from '@/src/utils/plannerNavigation';

type Tab = PlannerTab;

function isCreditCardLoanEntry(item: Liability): boolean {
  return isCreditCardLoanLiability(item) || (item.kind === 'LOAN' && item.loanType === 'CREDIT_CARD');
}

export default function PlannerScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = themeColors(isDark);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  /** Narzo-class phones (~360dp) + large font/display size break fixed 3-column loan rows */
  const isCompactList = windowWidth < 400;

  const liabilities = useFinancialStore((s) => s.liabilities);
  const subscriptions = useFinancialStore((s) => s.subscriptions);
  const bills = useFinancialStore((s) => s.bills);
  const templates = useFinancialStore((s) => s.budgetTemplates);
  const addLiability = useFinancialStore((s) => s.addLiability);
  const updateLiability = useFinancialStore((s) => s.updateLiability);
  const addLoan = useFinancialStore((s) => s.addLoan);
  const updateLoan = useFinancialStore((s) => s.updateLoan);
  const addSubscription = useFinancialStore((s) => s.addSubscription);
  const updateSubscription = useFinancialStore((s) => s.updateSubscription);
  const toggleSubscriptionAlert = useFinancialStore((s) => s.toggleSubscriptionAlert);
  const stopSubscription = useFinancialStore((s) => s.stopSubscription);
  const recordSubscriptionPayment = useFinancialStore((s) => s.recordSubscriptionPayment);
  const addBill = useFinancialStore((s) => s.addBill);
  const updateBill = useFinancialStore((s) => s.updateBill);
  const recordBillPayment = useFinancialStore((s) => s.recordBillPayment);
  const toggleBillAlert = useFinancialStore((s) => s.toggleBillAlert);
  const stopBill = useFinancialStore((s) => s.stopBill);
  const deleteBill = useFinancialStore((s) => s.deleteBill);
  const addTemplate = useFinancialStore((s) => s.addTemplate);
  const deleteTemplate = useFinancialStore((s) => s.deleteTemplate);
  const applyTemplate = useFinancialStore((s) => s.applyTemplate);

  const deleteLiability = useFinancialStore((s) => s.deleteLiability);
  const deleteSubscription = useFinancialStore((s) => s.deleteSubscription);
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('Loans');

  useEffect(() => {
    const tab = parsePlannerTabParam(tabParam);
    if (tab) setActiveTab(tab);
  }, [tabParam]);

  useFocusEffect(
    useCallback(() => {
      const tab = parsePlannerTabParam(tabParam);
      if (tab) setActiveTab(tab);
    }, [tabParam])
  );
  const [showLiabilityForm, setShowLiabilityForm] = useState(false);
  const [editingLiability, setEditingLiability] = useState<Liability | null>(null);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [loanFormVariant, setLoanFormVariant] = useState<LoanFormVariant>('standard');
  const [editingLoan, setEditingLoan] = useState<Liability | null>(null);
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

  const tabs: Tab[] = [...PLANNER_TABS];
  const annualLiabilities = liabilities.filter((item) => !isLoanLiability(item));
  const creditCardLoans = liabilities.filter((item) => isCreditCardLoanEntry(item));
  const standardLoans = liabilities.filter(
    (item) => isLoanLiability(item) && !isCreditCardLoanEntry(item)
  );
  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceVariant },
  ];
  const listBottomPad = 80 + insets.bottom;
  const flatListPerf = {
    initialNumToRender: 8,
    maxToRenderPerBatch: 8,
    windowSize: 7,
    removeClippedSubviews: true as const,
    updateCellsBatchingPeriod: 50,
  };

  const openAddLiability = () => {
    setEditingLiability(null);
    setShowLiabilityForm(true);
  };

  const openEditLiability = (item: Liability) => {
    setEditingLiability(item);
    setShowLiabilityForm(true);
  };

  const openAddLoan = () => {
    setLoanFormVariant('standard');
    setEditingLoan(null);
    setShowLoanForm(true);
  };

  const openAddCreditCardLoan = () => {
    setLoanFormVariant('credit_card');
    setEditingLoan(null);
    setShowLoanForm(true);
  };

  const openEditLoan = (item: Liability, variant: LoanFormVariant) => {
    setLoanFormVariant(variant);
    setEditingLoan(item);
    setShowLoanForm(true);
  };

  const handleLoanSave = async (data: LoanFormData) => {
    const isCard = loanFormVariant === 'credit_card';
    const loanType = isCard ? 'CREDIT_CARD' : data.loanType;
    const kind = isCard ? 'CREDIT_CARD_LOAN' : 'LOAN';

    if (editingLoan) {
      await updateLoan({
        ...editingLoan,
        kind,
        name: data.name,
        loanType,
        amount: data.principal,
        principal: data.principal,
        emiAmount: data.emiAmount,
        tenureMonths: data.tenureMonths,
        dueDateMillis: data.firstEmiDueMillis,
        interestRatePercent: data.interestRatePercent ?? null,
        lender: data.lender ?? null,
      });
    } else {
      await addLoan(
        data.name,
        loanType,
        data.principal,
        data.emiAmount,
        data.tenureMonths,
        data.firstEmiDueMillis,
        data.interestRatePercent,
        data.lender,
        kind
      );
    }
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

  const handleLiabilitySave = async (data: LiabilityFormData) => {
    if (editingLiability) {
      const next: Liability = {
        ...editingLiability,
        name: data.name,
        amount: data.amount,
        frequency: data.frequency,
        dueDateMillis: data.dueDateMillis,
        paymentDateMillis: data.paymentDateMillis ?? null,
        kind: 'ANNUAL',
      };
      if (!shouldRecordPayment(editingLiability, data.paymentDateMillis)) {
        next.paymentScheduleJson = serializeInstallments(
          buildSchedule(data.amount, data.frequency, data.dueDateMillis)
        );
      }
      await updateLiability(next, editingLiability);
    } else {
      await addLiability(data.name, data.amount, data.frequency, data.dueDateMillis);
    }
  };

  const handleManageSave = async (liability: Liability, paymentScheduleJson: string) => {
    const updated = { ...liability, paymentScheduleJson };
    await updateLiability(updated, managingLiability);
    if (editingLoan?.id === liability.id) {
      setEditingLoan(updated);
    }
  };

  const handleSubscriptionSave = async (data: SubscriptionFormData) => {
    if (editingSubscription) {
      const base = {
        ...editingSubscription,
        name: data.name,
        cost: data.cost,
        billingCycle: data.billingCycle,
        category: data.purpose,
        isAlertEnabled: data.isAlertEnabled,
        nextPaymentMillis: data.nextPaymentMillis,
      };
      if (data.recordPayment && data.paymentDateMillis != null) {
        await recordSubscriptionPayment(base, data.paymentDateMillis);
      } else {
        await updateSubscription(base);
      }
    } else {
      await addSubscription(
        data.name,
        data.cost,
        data.billingCycle,
        data.purpose,
        data.nextPaymentMillis,
        data.isAlertEnabled,
        data.recordPayment ? data.paymentDateMillis : null
      );
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
      const base = {
        ...editingBill,
        name: data.name,
        amount: data.amount,
        billingCycle: data.billingCycle,
        category: data.name,
        isAlertEnabled: data.isAlertEnabled,
        nextPaymentMillis: data.nextPaymentMillis,
      };
      if (data.recordPayment && data.paymentDateMillis != null) {
        await recordBillPayment(base, data.paymentDateMillis);
      } else {
        await updateBill(base);
      }
    } else {
      await addBill(
        data.name,
        data.amount,
        data.billingCycle,
        data.name,
        data.nextPaymentMillis,
        data.isAlertEnabled,
        data.recordPayment ? data.paymentDateMillis : null
      );
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
    if (activeTab === 'Loans') openAddLoan();
    else if (activeTab === 'CreditCards') openAddCreditCardLoan();
    else if (activeTab === 'Liabilities') openAddLiability();
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

  const renderPaidBadge = (isPaid: boolean, paymentDateMillis: number | null | undefined) => {
    if (!isPaid || !paymentDateMillis) return null;
    return (
      <View style={[styles.paidBadge, { backgroundColor: colors.emeraldSoft }]}>
        <Text style={{ color: colors.emeraldText, fontSize: 10, fontWeight: '800' }}>PAID</Text>
        <Text style={{ color: colors.emeraldText, fontSize: 9, fontWeight: '600' }}>
          {formatDate(paymentDateMillis)}
        </Text>
      </View>
    );
  };

  const renderEmiMonthStatus = (item: Liability) => {
    const emi = getCurrentMonthEmiStatus(item);
    if (!emi.hasEmi) return null;
    if (emi.isPaid) {
      return renderPaidBadge(true, emi.paymentDateMillis);
    }
    return (
      <View
        style={[
          styles.paidBadge,
          {
            backgroundColor: emi.isOverdue ? 'rgba(220,38,38,0.12)' : 'rgba(59,130,246,0.12)',
            minWidth: 88,
          },
        ]}
      >
        <Text
          style={{
            color: emi.isOverdue ? colors.error : colors.primary,
            fontSize: 10,
            fontWeight: '800',
            textAlign: 'center',
          }}
        >
          CURRENT MONTH DUE
        </Text>
        <Text
          style={{
            color: emi.isOverdue ? colors.error : colors.primary,
            fontSize: 10,
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          {formatDate(emi.dueDateMillis!)}
        </Text>
      </View>
    );
  };

  const renderLoanLikeItem = (
    item: Liability,
    opts: {
      icon: keyof typeof MaterialIcons.glyphMap;
      variant: LoanFormVariant;
      typeLine: string;
      manageLabel: string;
    }
  ) => {
    const nextEmi = getNextUnpaidInstallment(item);
    return (
      <View
        style={[
          styles.listItem,
          isCompactList && styles.listItemCompact,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {renderListIcon(opts.icon)}
        <View style={[styles.listItemMain, isCompactList && styles.listItemMainCompact]}>
          <View style={styles.listItemBody}>
            <Pressable onPress={() => openEditLoan(item, opts.variant)}>
              <Text style={[styles.detailsLink, { color: colors.primary }]} numberOfLines={2}>
                Details with {item.name}
              </Text>
            </Pressable>
            <Text style={[styles.itemMeta, { color: colors.textMuted }]} numberOfLines={2}>
              {opts.typeLine}
            </Text>
            <Text style={[styles.itemMeta, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
              Next EMI {formatDate(nextEmi?.dueDateMillis ?? item.dueDateMillis)}
              {item.lender ? ` • ${item.lender}` : ''}
            </Text>
            <View
              style={[styles.daysChip, { backgroundColor: colors.emeraldSoft, alignSelf: 'flex-start', marginTop: 4 }]}
            >
              <Text style={{ color: colors.emeraldText, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                Remaining {formatCurrency(getLiabilityRemainingAmount(item))}
              </Text>
            </View>
          </View>
          <View style={[styles.listItemActions, isCompactList && styles.listItemActionsCompact]}>
            <Text
              style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {formatCurrency(item.emiAmount ?? 0)}
              <Text style={{ fontSize: 11, fontWeight: '600' }}>/mo</Text>
            </Text>
            {renderEmiMonthStatus(item)}
            <View style={styles.iconRow}>
              <Pressable
                style={[styles.iconBtn, { backgroundColor: colors.surfaceVariant }]}
                onPress={() => setManagingLiability(item)}
                accessibilityLabel={opts.manageLabel}
              >
                <MaterialIcons name="calendar-month" size={18} color={colors.primary} />
              </Pressable>
              <Pressable
                style={[styles.iconBtn, { backgroundColor: colors.surfaceVariant }]}
                onPress={() => deleteLiability(item)}
              >
                <MaterialIcons name="delete-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  };

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
                  {PLANNER_TAB_LABELS[tab]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={[styles.tabHint, { color: colors.textMuted }]} numberOfLines={2}>
          {PLANNER_TAB_HINTS[activeTab]}
        </Text>
      </View>

      {activeTab === 'Loans' && (
        <FlatList
          data={standardLoans}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          {...flatListPerf}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              No bank loans tracked. Add personal, home, gold, or vehicle loans here.
            </Text>
          }
          renderItem={({ item }: { item: Liability }) =>
            renderLoanLikeItem(item, {
              icon: 'account-balance',
              variant: 'standard',
              typeLine: `${loanTypeLabel(item.loanType)} • EMI ${formatCurrency(item.emiAmount ?? 0)} • ${item.tenureMonths} mo`,
              manageLabel: `Manage EMI plan for ${item.name}`,
            })
          }
        />
      )}

      {activeTab === 'CreditCards' && (
        <FlatList
          data={creditCardLoans}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          {...flatListPerf}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              No credit card loans tracked. Add outstanding balance as an EMI plan.
            </Text>
          }
          renderItem={({ item }: { item: Liability }) =>
            renderLoanLikeItem(item, {
              icon: 'credit-card',
              variant: 'credit_card',
              typeLine: `Credit Card Loan • EMI ${formatCurrency(item.emiAmount ?? 0)} • ${item.tenureMonths} mo`,
              manageLabel: `Manage card EMI for ${item.name}`,
            })
          }
        />
      )}

      {activeTab === 'Liabilities' && (
        <FlatList
          data={annualLiabilities}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          {...flatListPerf}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              No liabilities tracked. Tap + to add.
            </Text>
          }
          renderItem={({ item }: { item: Liability }) => {
            const history = getPaymentHistorySummary(item);
            const annual = isAnnualFrequency(item.frequency);
            const paidBadge = getLiabilityListPaidBadge(item);
            return (
            <View style={[styles.listItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {renderListIcon(liabilityListIcon())}
              <View style={styles.listItemBody}>
                <Pressable onPress={() => openEditLiability(item)}>
                  <Text style={[styles.detailsLink, { color: colors.primary }]}>
                    Details with {item.name}
                  </Text>
                </Pressable>
                <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                  {annual ? 'Annual' : item.frequency.replace('_', ' ')} • Due {formatDate(item.dueDateMillis)}
                </Text>
                {history.count > 0 ? (
                  <Text style={[styles.itemMeta, { color: colors.textMuted, marginTop: 2 }]}>
                    {history.count} past payment{history.count === 1 ? '' : 's'} • {formatCurrency(history.totalPaid)} paid
                  </Text>
                ) : null}
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
                {renderPaidBadge(paidBadge.isPaid, paidBadge.paymentDateMillis)}
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
                    <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                  </Pressable>
                </View>
              </View>
            </View>
            );
          }}
        />
      )}

      {activeTab === 'Subscriptions' && (
        <FlatList
          data={subscriptions}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          {...flatListPerf}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>No subscriptions tracked.</Text>
          }
          renderItem={({ item }: { item: Subscription }) => {
            const stopped = !item.isActive;
            const payStatus = stopped ? null : getRecurringPaymentStatus(item.nextPaymentMillis, item.lastPaidMillis);
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
                  {!stopped && payStatus && payStatus !== 'paid' && (
                    <View
                      style={[
                        styles.daysChip,
                        {
                          backgroundColor:
                            payStatus === 'overdue'
                              ? 'rgba(220,38,38,0.12)'
                              : payStatus === 'due_soon'
                                ? 'rgba(59,130,246,0.12)'
                                : colors.surfaceVariant,
                          alignSelf: 'flex-start',
                          marginTop: 4,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            payStatus === 'overdue'
                              ? colors.error
                              : payStatus === 'due_soon'
                                ? colors.primary
                                : colors.textMuted,
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        {recurringPaymentStatusLabel(payStatus)}
                      </Text>
                    </View>
                  )}
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
                  {renderPaidBadge(payStatus === 'paid' || wasRecentlyPaid(item.lastPaidMillis), item.lastPaidMillis)}
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
          {...flatListPerf}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>No bills tracked. Tap + to add rent, utilities, etc.</Text>
          }
          renderItem={({ item }: { item: Bill }) => {
            const stopped = !item.isActive;
            const status = getRecurringPaymentStatus(item.nextPaymentMillis, item.lastPaidMillis);
            const statusColor =
              status === 'overdue'
                ? colors.error
                : status === 'due_soon'
                  ? colors.primary
                  : colors.textMuted;
            const cycleSuffix =
              item.billingCycle === 'YEARLY'
                ? 'yr'
                : item.billingCycle === 'QUARTERLY'
                  ? 'qtr'
                  : item.billingCycle === 'HALF_YEARLY'
                    ? '6mo'
                    : 'mo';
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
                {renderListIcon(billListIcon(item.name))}
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
                    {item.billingCycle}
                    {stopped ? ' • Stopped' : ` • Due ${formatDate(item.nextPaymentMillis)}`}
                  </Text>
                  {!stopped && status !== 'paid' ? (
                    <View style={[styles.daysChip, { backgroundColor: colors.surfaceVariant, alignSelf: 'flex-start' }]}>
                      <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>
                        {recurringPaymentStatusLabel(status)}
                      </Text>
                    </View>
                  ) : null}
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
                    <Text style={{ fontSize: 11, fontWeight: '600' }}>/{cycleSuffix}</Text>
                  </Text>
                  {renderPaidBadge(status === 'paid' || wasRecentlyPaid(item.lastPaidMillis), item.lastPaidMillis)}
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
          {...flatListPerf}
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

      <LoanFormModal
        visible={showLoanForm}
        editing={editingLoan}
        variant={loanFormVariant}
        colors={colors}
        onClose={() => {
          setShowLoanForm(false);
          setEditingLoan(null);
        }}
        onSave={handleLoanSave}
        onManage={(liability) => setManagingLiability(liability)}
      />

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
        {showTemplateForm ? (
        <KeyboardModalShell>
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
        </KeyboardModalShell>
        ) : null}
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
  listItemCompact: {
    padding: 12,
    gap: 10,
  },
  listIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  listItemMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  listItemMainCompact: {
    flexDirection: 'column',
    gap: 10,
  },
  listItemBody: { flex: 1, minWidth: 0, gap: 6 },
  listItemActions: { alignItems: 'flex-end', gap: 10, flexShrink: 0 },
  paidBadge: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 1,
    minWidth: 64,
  },
  listItemActionsCompact: {
    width: '100%',
    alignItems: 'flex-end',
    gap: 8,
  },
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
    maxWidth: '100%',
  },
  iconRow: { flexDirection: 'row', gap: 8, flexShrink: 0 },
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

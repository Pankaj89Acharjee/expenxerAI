import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { LiabilityMonthDetailModal } from '@/src/components/dashboard/LiabilityMonthDetailModal';
import { AnnualSpendLineChart } from '@/src/components/dashboard/AnnualSpendLineChart';
import { CategoryMixCard } from '@/src/components/dashboard/CategoryMixCard';
import { SpendSaveRadialPie } from '@/src/components/dashboard/MiniRadialPie';
import { useColorScheme } from '@/components/useColorScheme';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors, Colors } from '@/src/theme/colors';
import { formatCurrency, formatDate, greeting } from '@/src/utils/format';
import {
  getAnnualMonthlySpendTrend,
  getCurrentMonthExpenseTotal,
  getLastMonthExpenseSummary,
  getLastSevenDaysTrend,
} from '@/src/utils/expenseDateRange';
import { computeLiabilityInstallmentSummary, computeMonthlyLiabilityTotals, listLoanEmiSummaries, summarizeLoanEmiPayments, type LoanEmiSummary, type MonthlyLiabilityBucket } from '@/src/utils/liabilitySchedule';
import { computePlannerBreakdown } from '@/src/utils/plannerTotals';
import {
  listActiveRecurringPayments,
  recurringPaymentStatusLabel,
  summarizeRecurringPayments,
  wasRecentlyPaid,
  type RecurringPaymentItem,
  type RecurringPaymentStatus,
} from '@/src/utils/recurringBilling';
import { exportCsv, exportPdfReport } from '@/src/utils/export';
import { emiSummaryPlannerTab, plannerHref } from '@/src/utils/plannerNavigation';
import type { PlannerTab } from '@/src/constants/plannerTabs';
import type { SavingGoal } from '@/src/types/models';

const TREND_BAR_GRADIENT = ['#6EE7B7', '#34D399', '#059669', '#047857'] as const;

const TREND_CARD_GRADIENT = {
  dark: ['#022C22', '#064E3B', '#047857'] as const,
  light: ['#195243', '#047857', '#03291d'] as const,
};

const CATEGORY_CARD_GRADIENT = {
  dark: ['#1E1B4B', '#312E81', '#5B21B6'] as const,
  light: ['#161532', '#4C1D95', '#1c0441'] as const,
};

const AUTO_PDF_GRADIENT = ['#1E3A8A', '#2563EB', '#3B82F6'] as const;
const AUTO_EXPORT_GRADIENT = ['#064E3B', '#047857', '#059669'] as const;
const AUTO_GMAIL_GRADIENT = ['#4C1D95', '#6D28D9', '#7C3AED'] as const;
const AUTO_SHEET_GRADIENT = ['#0F766E', '#0D9488', '#14B8A6'] as const;

const NAV_EXPENSES_GRADIENT = ['#9F1239', '#BE123C', '#E11D48'] as const;
const NAV_PLANNER_GRADIENT = ['#3730A3', '#4F46E5', '#6366F1'] as const;

/** Distinct section identity gradients for dashboard cards */
const SECTION_EMI_GRADIENT = ['#4C1D95', '#312E81', '#1E1B4B', '#020617'] as const;
const SECTION_LIABILITY_GRADIENT = ['#9A3412', '#7C2D12', '#431407', '#000000'] as const;
const SECTION_SUBSCRIPTION_GRADIENT = ['#0E7490', '#155E75', '#164E63', '#082F49'] as const;
const SECTION_BILLS_GRADIENT = ['#B45309', '#92400E', '#78350F', '#1C1917'] as const;
const SECTION_PLANNER_GRADIENT = ['#065F46', '#064E3B', '#022C22', '#000000'] as const;
const SECTION_ANNUAL_GRADIENT = ['#1E3A8A', '#1E40AF', '#172554', '#020617'] as const;

const CATEGORY_GRADIENTS: Record<string, readonly [string, string]> = {
  Utilities: ['#60A5FA', '#2563EB'],
  Transport: ['#FB7185', '#E11D48'],
  Food: ['#4ADE80', '#16A34A'],
  Housing: ['#A78BFA', '#7C3AED'],
  Shopping: ['#FBBF24', '#D97706'],
  Health: ['#2DD4BF', '#0D9488'],
  Entertainment: ['#F472B6', '#DB2777'],
  Groceries: ['#86EFAC', '#15803D'],
  Savings: ['#34D399', '#047857'],
  Borrowing: ['#FDBA74', '#EA580C'],
  'Credit-card': ['#C084FC', '#9333EA'],
};

const FALLBACK_GRADIENTS: readonly [string, string][] = [
  ['#60A5FA', '#2563EB'],
  ['#FB7185', '#E11D48'],
  ['#4ADE80', '#16A34A'],
  ['#A78BFA', '#7C3AED'],
  ['#FBBF24', '#D97706'],
];

function categoryGradient(name: string, index: number): readonly [string, string] {
  return CATEGORY_GRADIENTS[name] ?? FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
}

export default function DashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const isDark = colorScheme === 'dark';

  const profile = useFinancialStore((s) => s.userProfile);
  const expenses = useFinancialStore((s) => s.expenses);
  const liabilities = useFinancialStore((s) => s.liabilities);
  const subscriptions = useFinancialStore((s) => s.subscriptions);
  const bills = useFinancialStore((s) => s.bills);
  const savingGoals = useFinancialStore((s) => s.savingGoals);
  const logs = useFinancialStore((s) => s.logs);
  const aiReportAdvice = useFinancialStore((s) => s.aiReportAdvice);
  const googleSheetsSyncUrl = useFinancialStore((s) => s.googleSheetsSyncUrl);
  const checkAndTriggerPeriodicSync = useFinancialStore((s) => s.checkAndTriggerPeriodicSync);
  const triggerGoogleSheetsSync = useFinancialStore((s) => s.triggerGoogleSheetsSync);
  const triggerGmailDelivery = useFinancialStore((s) => s.triggerGmailDelivery);
  const saveGoogleOAuthToken = useFinancialStore((s) => s.saveGoogleOAuthToken);
  const addSavingContribution = useFinancialStore((s) => s.addSavingContribution);
  const refreshUserData = useFinancialStore((s) => s.refreshUserData);
  const settleLiabilityInstallment = useFinancialStore((s) => s.settleLiabilityInstallment);

  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [contribGoal, setContribGoal] = useState<SavingGoal | null>(null);
  const [contribAmount, setContribAmount] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [selectedTrendKey, setSelectedTrendKey] = useState<string | null>(null);
  const [selectedAnnualKey, setSelectedAnnualKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLiabilityMonth, setSelectedLiabilityMonth] = useState<MonthlyLiabilityBucket | null>(null);

  const refreshDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshUserData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshUserData]);

  useEffect(() => {
    checkAndTriggerPeriodicSync();
  }, [checkAndTriggerPeriodicSync]);

  const monthlySpent = useMemo(() => getCurrentMonthExpenseTotal(expenses), [expenses]);
  const monthlyIncome = profile?.monthlyIncome ?? 5000;
  const savingsRate = profile?.baseSavingsRatePercent ?? 20;
  const savingsTarget = monthlyIncome * (savingsRate / 100);
  const remainingBudget = Math.max(monthlyIncome - monthlySpent, 0);
  const percentSpent = monthlyIncome > 0 ? Math.min(monthlySpent / monthlyIncome, 1) : 0;
  const percentRemaining = monthlyIncome > 0 ? Math.max(remainingBudget / monthlyIncome, 0) : 0;
  const currentMonthLabel = useMemo(
    () => new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    []
  );

  const monthlyLiabilityTotals = useMemo(
    () => computeMonthlyLiabilityTotals(liabilities),
    [liabilities]
  );
  const liabilityInstallmentSummary = useMemo(
    () => computeLiabilityInstallmentSummary(liabilities),
    [liabilities]
  );
  const currentMonthYear = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const monthlyLiabilityPendingSum = useMemo(
    () => monthlyLiabilityTotals.reduce((sum, month) => sum + month.pendingTotal, 0),
    [monthlyLiabilityTotals]
  );

  const plannerBreakdown = useMemo(
    () => computePlannerBreakdown(liabilities, subscriptions, bills),
    [liabilities, subscriptions, bills]
  );

  const recurringPayments = useMemo(
    () => listActiveRecurringPayments(subscriptions, bills),
    [subscriptions, bills]
  );
  const subscriptionPayments = useMemo(
    () => recurringPayments.filter((item) => item.kind === 'subscription'),
    [recurringPayments]
  );
  const billPayments = useMemo(
    () => recurringPayments.filter((item) => item.kind === 'bill'),
    [recurringPayments]
  );
  const recurringSummary = useMemo(
    () => summarizeRecurringPayments(subscriptionPayments),
    [subscriptionPayments]
  );
  const billSummary = useMemo(
    () => summarizeRecurringPayments(billPayments),
    [billPayments]
  );

  const emiSummaries = useMemo(() => listLoanEmiSummaries(liabilities), [liabilities]);
  const emiSummaryStats = useMemo(() => summarizeLoanEmiPayments(emiSummaries), [emiSummaries]);
  const emiMonthlyTotal = emiSummaryStats.monthlyEmiTotal;
  const loanRemainingTotal = emiSummaryStats.totalRemaining;

  const trendData = useMemo(() => getLastSevenDaysTrend(expenses), [expenses]);
  const annualSpendTrend = useMemo(() => getAnnualMonthlySpendTrend(expenses), [expenses]);
  const maxAnnualSpend = Math.max(...annualSpendTrend.map((d) => d.total), 1);
  const currentMonthIndex = new Date().getMonth();

  const maxTrend = Math.max(...trendData.map((d) => d.total), 1);

  const peakTrendDay = useMemo(() => {
    if (!trendData.length) return null;
    return trendData.reduce((best, d) => (d.total > best.total ? d : best), trendData[0]);
  }, [trendData]);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] ?? 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [expenses]);

  const categoryTotalSum = useMemo(
    () => categoryTotals.reduce((s, [, amt]) => s + amt, 0),
    [categoryTotals]
  );

  const mostExpensive = useMemo(() => [...expenses].sort((a, b) => b.amount - a.amount)[0], [expenses]);

  const pendingBorrowing = useMemo(
    () =>
      expenses
        .filter((e) => e.category === 'Borrowing' && !e.isSettled)
        .reduce((s, e) => s + e.amount, 0),
    [expenses]
  );

  const pendingBorrowingCount = useMemo(
    () => expenses.filter((e) => e.category === 'Borrowing' && !e.isSettled).length,
    [expenses]
  );

  const lastMonthExpenseSummary = useMemo(
    () => getLastMonthExpenseSummary(expenses),
    [expenses]
  );
  const expensesDisplay =
    lastMonthExpenseSummary.total > 0 ? formatCurrency(lastMonthExpenseSummary.total) : '-';
  const lastMonthExpenseHint = lastMonthExpenseSummary.hint;
  const plannerCommittedDisplay =
    plannerBreakdown.committedMonthly > 0 ? `${formatCurrency(plannerBreakdown.committedMonthly)}/mo` : '-';
  const subscriptionDueHint =
    recurringSummary.dueSoonCount + recurringSummary.overdueCount > 0
      ? `${recurringSummary.dueSoonCount + recurringSummary.overdueCount} due now`
      : 'subs + bills / mo';

  const handleContribute = async () => {
    if (!contribGoal) return;
    const amt = parseFloat(contribAmount);
    if (isNaN(amt) || amt <= 0) return;
    await addSavingContribution(contribGoal, amt);
    setContribGoal(null);
    setContribAmount('');
  };

  const getMonthStatusMeta = (month: MonthlyLiabilityBucket) => {
    switch (month.status) {
      case 'overdue':
        return { label: 'Overdue', color: colors.error, bg: colors.errorContainer };
      case 'pending':
        return { label: 'Pending', color: colors.primary, bg: colors.surfaceVariant };
      default:
        return { label: 'Done', color: colors.emeraldText, bg: colors.emeraldSoft };
    }
  };

  const getRecurringStatusMeta = (status: RecurringPaymentStatus) => {
    switch (status) {
      case 'overdue':
        return { label: recurringPaymentStatusLabel(status), color: colors.error, bg: colors.errorContainer };
      case 'due_soon':
        return { label: recurringPaymentStatusLabel(status), color: colors.primary, bg: colors.surfaceVariant };
      case 'paid':
        return { label: recurringPaymentStatusLabel(status), color: colors.emeraldText, bg: colors.emeraldSoft };
      default:
        return { label: recurringPaymentStatusLabel(status), color: colors.textMuted, bg: colors.surfaceVariant };
    }
  };

  const getEmiStatusMeta = (item: LoanEmiSummary) => {
    if (item.hasCurrentMonthEmi) {
      if (item.currentMonthPaid) {
        return { label: 'Paid', color: colors.emeraldText, bg: colors.emeraldSoft };
      }
      if (item.currentMonthOverdue) {
        return { label: 'Overdue', color: colors.error, bg: colors.errorContainer };
      }
      return { label: 'Current Month Due', color: colors.primary, bg: colors.surfaceVariant };
    }
    switch (item.status) {
      case 'overdue':
        return { label: 'Overdue', color: colors.error, bg: colors.errorContainer };
      case 'pending':
        return { label: 'Due', color: colors.primary, bg: colors.surfaceVariant };
      case 'on_track':
        return { label: 'On track', color: colors.emeraldText, bg: colors.emeraldSoft };
      default:
        return { label: 'Completed', color: colors.textMuted, bg: colors.surfaceVariant };
    }
  };

  const goToPlannerTab = (tab: PlannerTab) => {
    router.push(plannerHref(tab));
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refreshDashboard}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.card}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.archLabel, { color: colors.primary }]}>PERSONAL EXPENXER</Text>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={({ pressed }) => [pressed && styles.headerPressablePressed]}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <View style={[styles.profilePhoto, { backgroundColor: colors.primary + '20', borderColor: colors.border }]}>
              {profile?.photoUrl ? (
                <Image source={{ uri: profile.photoUrl }} style={styles.profilePhotoImage} contentFit="cover" />
              ) : (
                <Text style={[styles.profilePhotoFallback, { color: colors.primary }]}>
                  {(profile?.displayName ?? 'A').slice(0, 2).toUpperCase()}
                </Text>
              )}
            </View>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.salutation, { color: colors.textMuted }]}>{greeting()},</Text>
            <Pressable
              onPress={() => router.push('/(tabs)/profile')}
              style={({ pressed }) => [pressed && styles.headerPressablePressed]}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
                {profile?.displayName ?? 'there'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.heroStack}>
        <LinearGradient
          colors={['#0B3A6E', '#0A2748', '#061525', '#000000']}
          locations={[0, 0.35, 0.7, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroHeaderRow}>
            <View style={[styles.heroIconWrap, styles.savingsHeroIcon]}>
              <MaterialIcons name="savings" size={22} color="#A5F3FC" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroLabel, styles.savingsHeroLabel]}>MONTHLY SAVINGS TARGET</Text>
              <Text style={[styles.heroSub, styles.savingsHeroSub]}>
                {currentMonthLabel} · {savingsRate}% of {formatCurrency(monthlyIncome)}
              </Text>
            </View>
          </View>
          <Text style={styles.heroAmount}>{formatCurrency(savingsTarget)}</Text>
          <View style={[styles.progressTrack, styles.savingsProgressTrack, styles.splitProgressTrack]}>
            {percentSpent > 0.001 ? (
              <LinearGradient
                colors={['#0C4A6E', '#075985', '#164E63']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, {
                  width: `${percentSpent * 100}%`,
                  borderTopRightRadius: percentRemaining > 0.001 ? 0 : 4,
                  borderBottomRightRadius: percentRemaining > 0.001 ? 0 : 4,
                }]}
              />
            ) : null}
            {percentRemaining > 0.001 ? (
              <LinearGradient
                colors={['#083344', '#0E7490', '#155E75']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, {
                  width: `${percentRemaining * 100}%`,
                  borderTopLeftRadius: percentSpent > 0.001 ? 0 : 4,
                  borderBottomLeftRadius: percentSpent > 0.001 ? 0 : 4,
                }]}
              />
            ) : null}
          </View>
          <View style={styles.heroLegendRow}>
            <View style={styles.heroLegendItem}>
              <View style={[styles.heroLegendDot, { backgroundColor: '#0E7490' }]} />
              <Text style={[styles.heroRemaining, styles.savingsHeroRemaining, { marginTop: 0 }]}>
                Spent {formatCurrency(monthlySpent)}
              </Text>
            </View>
            <View style={styles.heroLegendItem}>
              <View style={[styles.heroLegendDot, { backgroundColor: '#67E8F9' }]} />
              <Text style={[styles.heroRemaining, styles.savingsHeroRemaining, { marginTop: 0 }]}>
                Remaining {formatCurrency(remainingBudget)}
              </Text>
            </View>
          </View>
          <Text style={[styles.heroRemaining, styles.savingsHeroRemaining]}>
            Aim to keep ≥ {formatCurrency(savingsTarget)} unspent this month
          </Text>
        </LinearGradient>

        <LinearGradient
          colors={['#9F1239', '#7F1D1D', '#450A0A', '#000000']}
          locations={[0, 0.32, 0.68, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroHeaderRow}>
            <View style={[styles.heroIconWrap, styles.spendHeroIcon]}>
              <MaterialIcons name="account-balance-wallet" size={22} color="#FECDD3" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroLabel, styles.spendHeroLabel]}>CURRENT MONTH EXPENDITURE</Text>
              <Text style={[styles.heroSub, styles.spendHeroSub]}>
                {currentMonthLabel}
              </Text>
            </View>
          </View>

          <View style={styles.spendMidRow}>
            <SpendSaveRadialPie spent={monthlySpent} remaining={remainingBudget} size={96} />
            <View style={styles.spendAmountBlock}>
              <Text style={styles.spendAboveLabel}>Spent</Text>
              <Text
                style={styles.spendAmountValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCurrency(monthlySpent)}
              </Text>
            </View>
          </View>

          <View style={styles.spendSaveRow}>
            <View style={styles.spendSaveRight}>
              <View style={[styles.heroLegendDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.spendSaveLabel}>Saving</Text>
              <Text style={[styles.spendSaveValue, styles.spendSaveValueRight]} numberOfLines={2}>
                {formatCurrency(remainingBudget)}
              </Text>
            </View>
          </View>

          <View style={[styles.progressTrack, styles.spendProgressTrack, styles.splitProgressTrack]}>
            {percentSpent > 0.001 ? (
              <LinearGradient
                colors={['#4C0519', '#9F1239', '#BE123C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, {
                  width: `${percentSpent * 100}%`,
                  borderTopRightRadius: percentRemaining > 0.001 ? 0 : 4,
                  borderBottomRightRadius: percentRemaining > 0.001 ? 0 : 4,
                }]}
              />
            ) : null}
            {percentRemaining > 0.001 ? (
              <LinearGradient
                colors={['#022C22', '#064E3B', '#065F46']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, {
                  width: `${percentRemaining * 100}%`,
                  borderTopLeftRadius: percentSpent > 0.001 ? 0 : 4,
                  borderBottomLeftRadius: percentSpent > 0.001 ? 0 : 4,
                }]}
              />
            ) : null}
          </View>
          <Text style={[styles.heroRemaining, styles.spendHeroSub, { marginTop: 8 }]}>
            {formatCurrency(remainingBudget)} left of {formatCurrency(monthlyIncome)} income
          </Text>
        </LinearGradient>
      </View>

      {pendingBorrowing > 0 && (
        <Pressable
          onPress={() => router.push({ pathname: '/(tabs)/expenses', params: { category: 'Borrowing' } })}
          style={({ pressed }) => [styles.borrowingCardWrap, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
        >
          <LinearGradient
            colors={isDark ? ['#7C2D12', '#B45309', '#D97706'] : ['#FEF3C7', '#FDE68A', '#F59E0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.borrowingCard}
          >
            <View style={styles.borrowingIconWrap}>
              <MaterialIcons name="handshake" size={28} color={isDark ? '#FEF3C7' : '#92400E'} />
            </View>
            <View style={styles.borrowingCopy}>
              <Text style={[styles.borrowingLabel, { color: isDark ? '#E2BC27' : '#843505' }]}>
                PENDING BORROWING
              </Text>
              <Text style={[styles.borrowingAmount, { color: isDark ? '#FFFBEB' : '#78350F' }]}>
                {formatCurrency(pendingBorrowing)}
              </Text>
              <Text style={[styles.borrowingSub, { color: isDark ? '#FCD34D' : '#A16207' }]}>
                {pendingBorrowingCount} unsettled item{pendingBorrowingCount === 1 ? '' : 's'} · Tap to settle
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={28} color={isDark ? '#FDE68A' : '#92400E'} />
          </LinearGradient>
        </Pressable>
      )}

      {emiSummaries.length > 0 && (
        <LinearGradient
          colors={[...SECTION_EMI_GRADIENT]}
          locations={[0, 0.3, 0.65, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.liabilityMonthCard, styles.sectionGradientCard]}
        >
          <View style={styles.liabilityMonthHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.liabilityMonthTitle, styles.sectionOnDark]}>Loans & EMIs</Text>
              <Text style={[styles.sectionMuted, { fontSize: 12, marginTop: 2 }]}>
                Bank loans and credit card EMI plans
              </Text>
            </View>
            <Pressable
              onPress={() => goToPlannerTab('Loans')}
              style={({ pressed }) => [styles.liabilityMonthLink, pressed && { opacity: 0.8 }]}
            >
              <Text style={[styles.sectionLink, { fontWeight: '700', fontSize: 12 }]}>Planner</Text>
              <MaterialIcons name="chevron-right" size={18} color="#FDE68A" />
            </Pressable>
          </View>

          <View style={styles.emiSummaryRow}>
            <View style={[styles.emiSummaryCard, styles.sectionGlass]}>
              <View style={[styles.emiSummaryIcon, { backgroundColor: 'rgba(167,139,250,0.22)' }]}>
                <MaterialIcons name="account-balance-wallet" size={18} color="#C4B5FD" />
              </View>
              <Text style={[styles.emiSummaryLabel, styles.sectionMuted]} numberOfLines={1}>
                Total Remaining
              </Text>
              <Text style={[styles.emiSummaryValue, styles.sectionOnDark]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {formatCurrency(loanRemainingTotal)}
              </Text>
            </View>
            <View style={[styles.emiSummaryCard, styles.sectionGlass]}>
              <View style={[styles.emiSummaryIcon, { backgroundColor: 'rgba(52,211,153,0.22)' }]}>
                <MaterialIcons name="event-repeat" size={18} color="#6EE7B7" />
              </View>
              <Text style={[styles.emiSummaryLabel, styles.sectionMuted]} numberOfLines={1}>
                EMI / Month
              </Text>
              <Text style={[styles.emiSummaryValue, { color: '#6EE7B7' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {formatCurrency(emiMonthlyTotal)}
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionMuted, { fontSize: 11, textAlign: 'center' }]}>
            {emiSummaries.length} active plan{emiSummaries.length === 1 ? '' : 's'}
          </Text>

          <View style={[styles.liabilityMonthStatsRow, styles.sectionGlass]}>
            <View style={styles.liabilityMonthStat}>
              <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Due</Text>
              <Text style={{ color: '#67E8F9', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                {emiSummaryStats.dueCount}
              </Text>
            </View>
            <View style={[styles.liabilityMonthStatDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
            <View style={styles.liabilityMonthStat}>
              <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Overdue</Text>
              <Text style={{ color: '#FB7185', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                {emiSummaryStats.overdueCount}
              </Text>
            </View>
            <View style={[styles.liabilityMonthStatDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
            <View style={styles.liabilityMonthStat}>
              <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Paid</Text>
              <Text style={{ color: '#6EE7B7', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                {emiSummaryStats.paidCount}
              </Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            contentContainerStyle={styles.liabilityMonthRow}
          >
            {emiSummaries.map((item) => {
              const statusMeta = getEmiStatusMeta(item);
              return (
                <Pressable
                  key={item.liabilityId}
                  style={({ pressed }) => [
                    styles.emiLoanItem,
                    styles.sectionItemGlass,
                    {
                      borderColor: statusMeta.color,
                      opacity: pressed ? 0.88 : 1,
                    },
                  ]}
                  onPress={() => goToPlannerTab(emiSummaryPlannerTab(item))}
                >
                  <View style={styles.emiLoanItemTop}>
                    <Text style={[styles.emiLoanItemLabel, styles.sectionOnDark]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={[styles.emiLoanStatusBadge, { backgroundColor: statusMeta.color }]}>
                      <Text style={styles.emiLoanStatusText}>{statusMeta.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.emiLoanItemMeta, styles.sectionMuted]} numberOfLines={1}>
                    {item.kindLabel} · {item.paidCount}/{item.tenureMonths}
                  </Text>
                  <Text style={[styles.emiLoanItemAmount, { color: statusMeta.color }]} numberOfLines={1}>
                    {formatCurrency(item.hasCurrentMonthEmi ? item.currentMonthAmount : item.emiAmount)}
                  </Text>
                  <Text style={[styles.emiLoanItemSub, styles.sectionMuted]} numberOfLines={2}>
                    {item.hasCurrentMonthEmi && item.currentMonthPaid && item.currentMonthPaidMillis
                      ? `Paid ${formatDate(item.currentMonthPaidMillis)}`
                      : item.hasCurrentMonthEmi && item.currentMonthDueMillis
                        ? `Due ${formatDate(item.currentMonthDueMillis)}`
                        : item.nextDueMillis
                          ? `Next ${formatDate(item.nextDueMillis)}`
                          : `Left ${formatCurrency(item.remainingAmount)}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </LinearGradient>
      )}

      <LinearGradient
        colors={[...SECTION_LIABILITY_GRADIENT]}
        locations={[0, 0.3, 0.65, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.liabilityMonthCard, styles.sectionGradientCard]}
      >
        <View style={styles.liabilityMonthHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.liabilityMonthTitle, styles.sectionOnDark]}>Liability Per Month</Text>
            <Text style={[styles.sectionMuted, { fontSize: 12, marginTop: 2 }]}>
              Annual liabilities and loan EMIs
            </Text>
          </View>
          <Pressable
            onPress={() => goToPlannerTab('Liabilities')}
            style={({ pressed }) => [styles.liabilityMonthLink, pressed && { opacity: 0.8 }]}
          >
            <Text style={[styles.sectionLink, { fontWeight: '700', fontSize: 12 }]}>Planner</Text>
            <MaterialIcons name="chevron-right" size={18} color="#FDE68A" />
          </Pressable>
        </View>

        {monthlyLiabilityTotals.length > 0 ? (
          <>
            <View style={[styles.liabilityMonthStatsRow, styles.sectionGlass]}>
              <View style={styles.liabilityMonthStat}>
                <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Overdue</Text>
                <Text style={{ color: '#FB7185', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                  {liabilityInstallmentSummary.overdueCount}
                </Text>
              </View>
              <View style={[styles.liabilityMonthStatDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
              <View style={styles.liabilityMonthStat}>
                <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Pending</Text>
                <Text style={[styles.sectionOnDark, { fontWeight: '800', fontSize: 16, marginTop: 2 }]}>
                  {liabilityInstallmentSummary.pendingCount}
                </Text>
              </View>
              <View style={[styles.liabilityMonthStatDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
              <View style={styles.liabilityMonthStat}>
                <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Done</Text>
                <Text style={{ color: '#6EE7B7', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                  {liabilityInstallmentSummary.doneCount}
                </Text>
              </View>
            </View>
            <View style={[styles.liabilityMonthTotalRow, styles.sectionGlass]}>
              <Text style={{ color: '#FDBA74', fontWeight: '600', fontSize: 12 }}>Unpaid liability total</Text>
              <Text style={{ color: '#FED7AA', fontWeight: '800', fontSize: 16 }}>
                {formatCurrency(monthlyLiabilityPendingSum)}
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={styles.liabilityMonthRow}
            >
              {monthlyLiabilityTotals.map((month) => {
                const isCurrent = month.monthYear === currentMonthYear;
                const statusMeta = getMonthStatusMeta(month);
                return (
                  <Pressable
                    key={month.monthYear}
                    style={({ pressed }) => [
                      styles.liabilityMonthItem,
                      styles.sectionItemGlass,
                      {
                        borderColor: statusMeta.color,
                        opacity: pressed ? 0.88 : 1,
                      },
                      isCurrent && { borderWidth: 2 },
                    ]}
                    onPress={() => setSelectedLiabilityMonth(month)}
                  >
                    <View style={styles.liabilityMonthItemTop}>
                      <Text
                        style={[
                          styles.liabilityMonthLabel,
                          { color: isCurrent ? '#FDE68A' : 'rgba(255,255,255,0.7)' },
                        ]}
                      >
                        {month.label}
                      </Text>
                      <View style={[styles.liabilityMonthStatusBadge, { backgroundColor: statusMeta.color }]}>
                        <Text style={styles.liabilityMonthStatusText}>{statusMeta.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.liabilityMonthAmount, { color: statusMeta.color }]}>
                      {formatCurrency(month.total)}
                    </Text>
                    <Text style={[styles.sectionMuted, { fontSize: 10, marginTop: 4 }]}>
                      {month.status === 'overdue'
                        ? `${month.overdueCount} overdue`
                        : month.status === 'pending'
                          ? `${month.pendingCount} pending`
                          : `${month.doneCount} paid`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <View style={[styles.liabilityMonthEmpty, styles.sectionEmpty]}>
            <MaterialIcons name="event-note" size={22} color="rgba(255,255,255,0.65)" />
            <Text style={[styles.sectionMuted, { fontSize: 13, flex: 1 }]}>
              No monthly liabilities scheduled. Add annual liabilities and set up payment plans in Planner.
            </Text>
          </View>
        )}
      </LinearGradient>

      <LinearGradient
        colors={[...SECTION_SUBSCRIPTION_GRADIENT]}
        locations={[0, 0.3, 0.65, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.liabilityMonthCard, styles.sectionGradientCard]}
      >
        <View style={styles.liabilityMonthHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.liabilityMonthTitle, styles.sectionOnDark]}>Subscription Payments</Text>
            <Text style={[styles.sectionMuted, { fontSize: 12, marginTop: 2 }]}>
              Due dates and payment window from Planner
            </Text>
          </View>
          <Pressable
            onPress={() => goToPlannerTab('Subscriptions')}
            style={({ pressed }) => [styles.liabilityMonthLink, pressed && { opacity: 0.8 }]}
          >
            <Text style={[styles.sectionLink, { fontWeight: '700', fontSize: 12 }]}>Planner</Text>
            <MaterialIcons name="chevron-right" size={18} color="#FDE68A" />
          </Pressable>
        </View>

        {subscriptionPayments.length > 0 ? (
          <>
            <View style={[styles.liabilityMonthStatsRow, styles.sectionGlass]}>
              <View style={styles.liabilityMonthStat}>
                <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Due soon</Text>
                <Text style={{ color: '#67E8F9', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                  {recurringSummary.dueSoonCount}
                </Text>
              </View>
              <View style={[styles.liabilityMonthStatDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
              <View style={styles.liabilityMonthStat}>
                <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Overdue</Text>
                <Text style={{ color: '#FB7185', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                  {recurringSummary.overdueCount}
                </Text>
              </View>
              <View style={[styles.liabilityMonthStatDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
              <View style={styles.liabilityMonthStat}>
                <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Paid</Text>
                <Text style={{ color: '#6EE7B7', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                  {subscriptionPayments.filter((i) => i.status === 'paid' || wasRecentlyPaid(i.lastPaidMillis)).length}
                </Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={styles.liabilityMonthRow}
            >
              {subscriptionPayments.map((item: RecurringPaymentItem) => {
                const recentlyPaid = item.status === 'paid' || wasRecentlyPaid(item.lastPaidMillis);
                const displayStatus = recentlyPaid ? 'paid' : item.status;
                const statusMeta = getRecurringStatusMeta(displayStatus);
                return (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.liabilityMonthItem,
                      styles.sectionItemGlass,
                      {
                        borderColor: statusMeta.color,
                        opacity: pressed ? 0.88 : 1,
                      },
                    ]}
                    onPress={() => goToPlannerTab('Subscriptions')}
                  >
                    <View style={styles.liabilityMonthItemTop}>
                      <Text style={[styles.liabilityMonthLabel, styles.sectionOnDark]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={[styles.liabilityMonthStatusBadge, { backgroundColor: statusMeta.color }]}>
                        <Text style={styles.liabilityMonthStatusText}>{statusMeta.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.liabilityMonthAmount, { color: statusMeta.color }]}>
                      {formatCurrency(item.amount)}
                    </Text>
                    <Text style={[styles.sectionMuted, { fontSize: 10, marginTop: 4 }]} numberOfLines={1}>
                      {recentlyPaid && item.lastPaidMillis
                        ? `Paid ${formatDate(item.lastPaidMillis)} • Next ${formatDate(item.nextPaymentMillis)}`
                        : `Due ${formatDate(item.nextPaymentMillis)}`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <View style={[styles.liabilityMonthEmpty, styles.sectionEmpty]}>
            <MaterialIcons name="subscriptions" size={22} color="rgba(255,255,255,0.65)" />
            <Text style={[styles.sectionMuted, { fontSize: 13, flex: 1 }]}>
              No active subscriptions. Add one in Planner with a billing due date.
            </Text>
          </View>
        )}
      </LinearGradient>

      <LinearGradient
        colors={[...SECTION_BILLS_GRADIENT]}
        locations={[0, 0.3, 0.65, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.liabilityMonthCard, styles.sectionGradientCard]}
      >
        <View style={styles.liabilityMonthHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.liabilityMonthTitle, styles.sectionOnDark]}>Monthly Bills</Text>
            <Text style={[styles.sectionMuted, { fontSize: 12, marginTop: 2 }]}>
              Current cycle — amount, due date & pay status
            </Text>
          </View>
          <Pressable
            onPress={() => goToPlannerTab('Bills')}
            style={({ pressed }) => [styles.liabilityMonthLink, pressed && { opacity: 0.8 }]}
          >
            <Text style={[styles.sectionLink, { fontWeight: '700', fontSize: 12 }]}>Planner</Text>
            <MaterialIcons name="chevron-right" size={18} color="#FDE68A" />
          </Pressable>
        </View>

        {billPayments.length > 0 ? (
          <>
            <View style={[styles.liabilityMonthStatsRow, styles.sectionGlass]}>
              <View style={styles.liabilityMonthStat}>
                <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Due soon</Text>
                <Text style={{ color: '#FCD34D', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                  {billSummary.dueSoonCount}
                </Text>
              </View>
              <View style={[styles.liabilityMonthStatDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
              <View style={styles.liabilityMonthStat}>
                <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Overdue</Text>
                <Text style={{ color: '#FB7185', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                  {billSummary.overdueCount}
                </Text>
              </View>
              <View style={[styles.liabilityMonthStatDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
              <View style={styles.liabilityMonthStat}>
                <Text style={[styles.sectionMuted, { fontSize: 11, fontWeight: '600' }]}>Paid</Text>
                <Text style={{ color: '#6EE7B7', fontWeight: '800', fontSize: 16, marginTop: 2 }}>
                  {billPayments.filter((i) => i.status === 'paid' || wasRecentlyPaid(i.lastPaidMillis)).length}
                </Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={styles.liabilityMonthRow}
            >
              {billPayments.map((item: RecurringPaymentItem) => {
                const recentlyPaid = item.status === 'paid' || wasRecentlyPaid(item.lastPaidMillis);
                const displayStatus = recentlyPaid ? 'paid' : item.status;
                const statusMeta = getRecurringStatusMeta(displayStatus);
                return (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.liabilityMonthItem,
                      styles.sectionItemGlass,
                      {
                        borderColor: statusMeta.color,
                        opacity: pressed ? 0.88 : 1,
                      },
                    ]}
                    onPress={() => goToPlannerTab('Bills')}
                  >
                    <View style={styles.liabilityMonthItemTop}>
                      <Text style={[styles.liabilityMonthLabel, styles.sectionOnDark]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={[styles.liabilityMonthStatusBadge, { backgroundColor: statusMeta.color }]}>
                        <Text style={styles.liabilityMonthStatusText}>{statusMeta.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.liabilityMonthAmount, { color: statusMeta.color }]}>
                      {formatCurrency(item.amount)}
                    </Text>
                    <Text style={[styles.sectionMuted, { fontSize: 10, marginTop: 4 }]} numberOfLines={1}>
                      {recentlyPaid && item.lastPaidMillis
                        ? `Paid ${formatDate(item.lastPaidMillis)} • Next ${formatDate(item.nextPaymentMillis)}`
                        : `Due ${formatDate(item.nextPaymentMillis)}`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <View style={[styles.liabilityMonthEmpty, styles.sectionEmpty]}>
            <MaterialIcons name="receipt-long" size={22} color="rgba(255,255,255,0.65)" />
            <Text style={[styles.sectionMuted, { fontSize: 13, flex: 1 }]}>
              No active bills this cycle. Add rent, utilities, or school fees in Planner.
            </Text>
          </View>
        )}
      </LinearGradient>

      <LinearGradient
        colors={[...SECTION_ANNUAL_GRADIENT]}
        locations={[0, 0.28, 0.65, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.liabilityMonthCard, styles.sectionGradientCard]}
      >
        <View style={styles.liabilityMonthHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.liabilityMonthTitle, styles.sectionOnDark]}>
              Annual Expenditure · {new Date().getFullYear()}
            </Text>
            <Text style={[styles.sectionMuted, { fontSize: 12, marginTop: 2 }]}>
              Line chart · month-by-month spend
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/expenses')}
            style={({ pressed }) => [styles.liabilityMonthLink, pressed && { opacity: 0.8 }]}
          >
            <Text style={[styles.sectionLink, { fontWeight: '700', fontSize: 12 }]}>Expenses</Text>
            <MaterialIcons name="chevron-right" size={18} color="#FDE68A" />
          </Pressable>
        </View>

        <AnnualSpendLineChart
          data={annualSpendTrend}
          selectedKey={selectedAnnualKey}
          currentMonthIndex={currentMonthIndex}
          maxTotal={maxAnnualSpend}
          onSelect={setSelectedAnnualKey}
        />
      </LinearGradient>

      <CategoryMixCard categories={categoryTotals} total={categoryTotalSum} />

      {/* Quick Nav for viewing Expense and Monthly Bill */}
      <View style={styles.actionRow}>
        <Pressable
          style={({ pressed }) => [styles.navCardWrap, pressed && styles.actionCardPressed]}
          onPress={() => router.push('/(tabs)/expenses')}
        >
          <LinearGradient colors={NAV_EXPENSES_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.navCard}>
            <View style={styles.actionIconCircle}>
              <MaterialIcons name="receipt-long" size={20} color="#FFE4E6" />
            </View>
            <View style={styles.navCardContent}>
              <Text style={styles.navCardLabel} numberOfLines={1}>Last Month Expenses</Text>
              <Text style={styles.navCardValue} numberOfLines={1}>{expensesDisplay}</Text>
              <Text style={styles.navCardHint} numberOfLines={1}>{lastMonthExpenseHint}</Text>
            </View>
          </LinearGradient>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.navCardWrap, pressed && styles.actionCardPressed]}
          onPress={() => goToPlannerTab('Bills')}
        >
          <LinearGradient colors={NAV_PLANNER_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.navCard}>
            <View style={styles.actionIconCircle}>
              <MaterialIcons name="event-note" size={20} color="#E0E7FF" />
            </View>
            <View style={styles.navCardContent}>
              <Text style={styles.navCardLabel} numberOfLines={1}>Monthly Bill</Text>
              <Text style={styles.navCardValue} numberOfLines={1}>{plannerCommittedDisplay}</Text>
              <Text style={styles.navCardHint} numberOfLines={1}>{subscriptionDueHint}</Text>
            </View>
          </LinearGradient>
        </Pressable>
      </View>


      {/* Expense Trends */}
      <View style={styles.gradientCardWrap}>
        <LinearGradient
          colors={[...(isDark ? TREND_CARD_GRADIENT.dark : TREND_CARD_GRADIENT.light)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientCard}
        >
          <Text style={[styles.sectionTitle, styles.gradientCardTitle, { color: '#A7F3D0' }]}>
            Expense Trends (Last 7 Days)
          </Text>
          <View style={styles.chartRow}>
            {trendData.map((d) => {
              const barPct = maxTrend > 0 ? (d.total / maxTrend) * 100 : 0;
              const isPeak = peakTrendDay?.key === d.key && d.total > 0;
              const isSelected = selectedTrendKey === d.key;
              const showLabel = d.total > 0 && (isPeak || isSelected);
              return (
                <Pressable
                  key={d.key}
                  style={({ pressed }) => [styles.barCol, pressed && styles.barColPressed]}
                  onPress={() => setSelectedTrendKey((prev) => (prev === d.key ? null : d.key))}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.dateLabel}, ${formatCurrency(d.total)}`}
                >
                  {showLabel ? (
                    <Text style={[styles.barValueLabel, { color: '#D1FAE5' }]} numberOfLines={1}>
                      ₹{Math.round(d.total)}
                    </Text>
                  ) : (
                    <View style={styles.barValueSpacer} />
                  )}
                  <View style={[styles.barTrack, { backgroundColor: 'rgba(0,0,0,0.28)' }]}>
                    {d.total > 0 ? (
                      <LinearGradient
                        colors={[...TREND_BAR_GRADIENT]}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={[styles.barFill, { height: `${barPct}%` }]}
                      />
                    ) : null}
                  </View>
                  <Text style={[styles.barLabel, { color: isSelected ? '#ECFDF5' : 'rgba(255,255,255,0.72)' }]}>
                    {d.day}
                  </Text>
                  <Text style={[styles.barDateLabel, { color: isSelected ? '#A7F3D0' : 'rgba(255,255,255,0.5)' }]}>
                    {d.dateLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </LinearGradient>
      </View>

      {/* Category Breakdown */}
      <View style={styles.gradientCardWrap}>
        <LinearGradient
          colors={[...(isDark ? CATEGORY_CARD_GRADIENT.dark : CATEGORY_CARD_GRADIENT.light)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientCard}
        >
          <Text style={[styles.sectionTitle, styles.gradientCardTitle, { color: '#C4B5FD' }]}>
            Category Breakdown
          </Text>
          {categoryTotals.map(([cat, amt], index) => {
            const gradient = categoryGradient(cat, index);
            const pct = categoryTotalSum > 0 ? Math.round((amt / categoryTotalSum) * 100) : 0;
            const barWidth = categoryTotalSum > 0 ? (amt / categoryTotalSum) * 100 : 0;
            return (
              <View key={cat} style={styles.catBreakdownItem}>
                <View style={styles.catBreakdownHeader}>
                  <View style={styles.catBreakdownLeft}>
                    <View style={[styles.catDot, { backgroundColor: gradient[0] }]} />
                    <Text style={[styles.catName, { color: '#F8FAFC' }]}>{cat}</Text>
                  </View>
                  <Text style={[styles.catAmt, { color: '#E2E8F0' }]}>
                    {formatCurrency(amt)} ({pct}%)
                  </Text>
                </View>
                <View style={[styles.catTrack, { backgroundColor: 'rgba(0,0,0,0.28)' }]}>
                  <LinearGradient
                    colors={[gradient[0], gradient[1]]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[styles.catFill, { width: `${barWidth}%` }]}
                  />
                </View>
              </View>
            );
          })}
          {categoryTotals.length === 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>No category data yet.</Text>
          ) : null}
        </LinearGradient>
      </View>

      {mostExpensive ? (
        <View style={[styles.expensiveCard, { backgroundColor: isDark ? '#2A1215' : '#FEF2F2', borderColor: isDark ? '#4C1D24' : '#FECACA' }]}>
          <View style={styles.expensiveLeft}>
            <View style={[styles.expensiveIconCircle, { backgroundColor: isDark ? '#4C1D24' : '#FEE2E2' }]}>
              <MaterialIcons name="trending-up" size={24} color="#FB7185" />
            </View>
            <View style={styles.expensiveCopy}>
              <Text style={[styles.expensiveLabel, { color: isDark ? '#FDA4AF' : '#BE123C' }]}>
                HIGHEST SINGLE EXPENDITURE
              </Text>
              <Text style={[styles.expensiveTitle, { color: colors.text }]} numberOfLines={1}>
                {mostExpensive.title}
              </Text>
              <Text style={[styles.expensiveCategory, { color: colors.textMuted }]}>
                Category: {mostExpensive.category}
              </Text>
            </View>
          </View>
          <Text style={styles.expensiveAmount}>{formatCurrency(mostExpensive.amount)}</Text>
        </View>
      ) : null}

      {/* Savings Goals */}
      {savingGoals.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Savings Goals</Text>
          {savingGoals.map((goal) => (
            <View key={goal.id} style={[styles.goalItem, { borderColor: colors.border }]}>
              <Text style={[styles.goalName, { color: colors.text }]}>{goal.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{formatCurrency(goal.savedAmount)} / {formatCurrency(goal.targetAmount)}</Text>
              <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4 }}>{goal.forecastText}</Text>
              <Pressable style={[styles.contribBtn, { backgroundColor: colors.primary }]} onPress={() => setContribGoal(goal)}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Contribute</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Automation and Export */}
      <View>
        <Text style={[styles.sectionHeading, { color: colors.text }]}>Automation & Export</Text>
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.actionCardWrap, pressed && styles.actionCardPressed]}
            onPress={() => exportPdfReport(profile, expenses, liabilities, savingGoals, aiReportAdvice)}
          >
            <LinearGradient colors={AUTO_PDF_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionCard}>
              <View style={styles.actionIconCircle}>
                <MaterialIcons name="picture-as-pdf" size={20} color="#EFF6FF" />
              </View>
              <Text style={styles.actionCardLabel} numberOfLines={2}>Daily PDF</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionCardWrap, pressed && styles.actionCardPressed]}
            onPress={() => setShowExport(true)}
          >
            <LinearGradient colors={AUTO_EXPORT_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionCard}>
              <View style={styles.actionIconCircle}>
                <MaterialIcons name="cloud-upload" size={20} color="#D1FAE5" />
              </View>
              <Text style={styles.actionCardLabel} numberOfLines={2}>Export / Sync</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionCardWrap, pressed && styles.actionCardPressed]}
            onPress={() => setShowSettings(true)}
          >
            <LinearGradient colors={AUTO_GMAIL_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionCard}>
              <View style={styles.actionIconCircle}>
                <MaterialIcons name="mail-outline" size={20} color="#EDE9FE" />
              </View>
              <Text style={styles.actionCardLabel} numberOfLines={2}>Gmail & Sync</Text>
            </LinearGradient>
          </Pressable>
        </View>
        <Pressable
          style={({ pressed }) => [styles.sheetCardWrap, pressed && styles.actionCardPressed, !googleSheetsSyncUrl && { opacity: 0.72 }]}
          onPress={() => {
            if (googleSheetsSyncUrl) Linking.openURL(googleSheetsSyncUrl);
          }}
          disabled={!googleSheetsSyncUrl}
        >
          <LinearGradient colors={AUTO_SHEET_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sheetCard}>
            <View style={styles.sheetCardLeft}>
              <View style={styles.actionIconCircle}>
                <MaterialIcons name="table-chart" size={20} color="#CCFBF1" />
              </View>
              <Text style={styles.sheetCardLabel}>Open synced sheet</Text>
            </View>
            <MaterialIcons name="open-in-new" size={18} color="#CCFBF1" />
          </LinearGradient>
        </Pressable>
      </View>

      {/* Planner breakdown — liabilities, subscriptions, bills kept separate */}
      <LinearGradient
        colors={[...SECTION_PLANNER_GRADIENT]}
        locations={[0, 0.3, 0.65, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, styles.sectionGradientCard]}
      >
        <Text style={[styles.cardTitle, styles.sectionOnDark]}>Planner Overview</Text>
        <Pressable
          style={({ pressed }) => [styles.plannerRow, pressed && { opacity: 0.85 }]}
          onPress={() => goToPlannerTab('Liabilities')}
        >
          <View style={styles.plannerRowLeft}>
            <MaterialIcons name="account-balance-wallet" size={18} color="#6EE7B7" />
            <Text style={[styles.plannerRowLabel, styles.sectionMuted]}>Liabilities (unpaid)</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.plannerRowValue, styles.sectionOnDark]}>
              {plannerBreakdown.liabilityRemaining > 0 ? formatCurrency(plannerBreakdown.liabilityRemaining) : '—'}
            </Text>
            <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.45)" />
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.plannerRow,
            { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.16)' },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => goToPlannerTab('Subscriptions')}
        >
          <View style={styles.plannerRowLeft}>
            <MaterialIcons name="subscriptions" size={18} color="#67E8F9" />
            <Text style={[styles.plannerRowLabel, styles.sectionMuted]}>Subscriptions / mo</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.plannerRowValue, styles.sectionOnDark]}>
              {plannerBreakdown.subscriptionsMonthly > 0 ? formatCurrency(plannerBreakdown.subscriptionsMonthly) : '—'}
            </Text>
            <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.45)" />
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.plannerRow,
            { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.16)' },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => goToPlannerTab('Bills')}
        >
          <View style={styles.plannerRowLeft}>
            <MaterialIcons name="receipt-long" size={18} color="#FDBA74" />
            <Text style={[styles.plannerRowLabel, styles.sectionMuted]}>Bills / mo</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.plannerRowValue, styles.sectionOnDark]}>
              {plannerBreakdown.billsMonthly > 0 ? formatCurrency(plannerBreakdown.billsMonthly) : '—'}
            </Text>
            <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.45)" />
          </View>
        </Pressable>
        <View style={[styles.plannerCommitted, styles.sectionGlass]}>
          <Text style={{ color: '#A7F3D0', fontWeight: '600', fontSize: 13 }}>Monthly committed</Text>
          <Text style={{ color: '#ECFDF5', fontWeight: '800', fontSize: 16 }}>
            {plannerBreakdown.committedMonthly > 0 ? formatCurrency(plannerBreakdown.committedMonthly) : '—'}
          </Text>
        </View>
      </LinearGradient>
     

      {/* Logs */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Notification Center</Text>
        {logs.slice(0, 5).map((log) => (
          <View key={log.id} style={[styles.logItem, { borderColor: colors.border }]}>
            <Text style={[styles.logTitle, { color: colors.text }]}>{log.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{log.message}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{formatDate(log.timestamp, 'full')}</Text>
          </View>
        ))}
      </View>

      {/* Export Modal */}
      <Modal visible={showExport} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Export Options</Text>
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={() => { exportCsv(expenses, liabilities, savingGoals); setShowExport(false); }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Export CSV</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={async () => { setSyncing(true); const r = await triggerGoogleSheetsSync(); setSyncing(false); Alert.alert(r.success ? 'Sync Complete' : 'Sync Failed', r.url ?? r.error ?? ''); setShowExport(false); }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{syncing ? 'Syncing...' : 'Google Sheets Sync'}</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setShowExport(false)}>
              <Text style={{ color: colors.text }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Gmail & Sync Settings</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Google OAuth Token" placeholderTextColor={colors.textMuted} value={tokenInput} onChangeText={setTokenInput} />
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Recipient Email" placeholderTextColor={colors.textMuted} value={emailInput} onChangeText={setEmailInput} keyboardType="email-address" />
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={async () => { await saveGoogleOAuthToken(tokenInput); const r = await triggerGmailDelivery(tokenInput, emailInput); Alert.alert(r.success ? 'Sent' : 'Failed', r.error ?? 'Report dispatched'); setShowSettings(false); }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Save & Send Gmail Report</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setShowSettings(false)}>
              <Text style={{ color: colors.text }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Contribute Modal */}
      <Modal visible={!!contribGoal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Contribute to {contribGoal?.name}</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Amount (₹)" placeholderTextColor={colors.textMuted} value={contribAmount} onChangeText={setContribAmount} keyboardType="numeric" />
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleContribute}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Add Contribution</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setContribGoal(null)}>
              <Text style={{ color: colors.text }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <LiabilityMonthDetailModal
        visible={!!selectedLiabilityMonth}
        month={selectedLiabilityMonth}
        liabilities={liabilities}
        colors={colors}
        onClose={() => setSelectedLiabilityMonth(null)}
        onSettle={settleLiabilityInstallment}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  header: { gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profilePhoto: {
    width: 52,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePhotoImage: { width: '100%', height: '100%' },
  profilePhotoFallback: { fontWeight: '800', fontSize: 14 },
  headerCopy: { flex: 1, justifyContent: 'center', gap: 2 },
  headerPressablePressed: { opacity: 0.72 },
  archLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  salutation: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  displayName: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  heroCard: { borderRadius: 20, padding: 20, overflow: 'hidden' },
  heroStack: { gap: 12 },
  savingsHeroIcon: { backgroundColor: 'rgba(34,211,238,0.18)', borderWidth: 1, borderColor: 'rgba(165,243,252,0.25)' },
  savingsHeroLabel: { color: '#7DD3FC' },
  savingsHeroSub: { color: '#BAE6FD' },
  savingsHeroRemaining: { color: '#E0F2FE' },
  savingsProgressTrack: { backgroundColor: 'rgba(15,23,42,0.55)' },
  spendHeroIcon: {
    backgroundColor: 'rgba(251,113,133,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(254,205,211,0.3)',
  },
  spendHeroLabel: { color: '#FECDD3' },
  spendHeroSub: { color: '#FECACA' },
  spendProgressTrack: { backgroundColor: 'rgba(0,0,0,0.4)' },
  spendHeroStatLabel: { color: '#FCA5A5' },
  spendHeroStatValue: { color: '#FFF1F2' },
  sectionGlass: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  sectionMuted: { color: 'rgba(255,255,255,0.68)' },
  sectionOnDark: { color: '#FFFFFF' },
  sectionLink: { color: '#FDE68A' },
  sectionEmpty: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sectionItemGlass: {
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  heroHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroAmount: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 10 },
  heroSub: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  heroRemaining: { color: '#CBD5E1', fontSize: 12, fontWeight: '600', marginTop: 10 },
  progressTrack: { height: 8, backgroundColor: '#334155', borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  splitProgressTrack: { flexDirection: 'row' },
  heroLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  heroLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroLegendDot: { width: 8, height: 8, borderRadius: 4 },
  spendMidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
  },
  spendAmountBlock: { flex: 1, minWidth: 0, justifyContent: 'center' },
  spendAboveLabel: {
    color: '#FECDD3',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  spendAmountValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  spendSaveRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
    marginBottom: 2,
  },
  spendSaveLeft: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  spendSaveRight: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    maxWidth: '100%',
  },
  spendSaveLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
  },
  spendSaveValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },
  spendSaveValueRight: { textAlign: 'right' },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 },
  heroStat: { flex: 1, minWidth: 0 },
  heroStatLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '700' },
  heroStatValue: { color: '#E2E8F0', fontSize: 12, fontWeight: '800', marginTop: 2 },
  borrowingCardWrap: { borderRadius: 18, overflow: 'hidden' },
  borrowingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 18,
    gap: 14,
  },
  borrowingIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  borrowingCopy: { flex: 1 },
  borrowingLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  borrowingAmount: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  borrowingSub: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  liabilityMonthCard: { borderRadius: 16, padding: 14, borderWidth: 0, gap: 12, overflow: 'hidden' },
  sectionGradientCard: { borderWidth: 0, overflow: 'hidden' },
  liabilityMonthHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  liabilityMonthTitle: { fontSize: 15, fontWeight: '800' },
  liabilityMonthLink: { flexDirection: 'row', alignItems: 'center' },
  liabilityMonthStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
  },
  liabilityMonthStat: { flex: 1, alignItems: 'center' },
  liabilityMonthStatDivider: { width: StyleSheet.hairlineWidth, height: 32 },
  emiSummaryRow: { flexDirection: 'row', gap: 10 },
  emiSummaryCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    minWidth: 0,
  },
  emiSummaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emiSummaryLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  emiSummaryValue: { fontSize: 16, fontWeight: '800' },
  emiLoanItem: {
    width: 124,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 2,
  },
  emiLoanItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  emiLoanStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  emiLoanStatusText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  emiLoanItemLabel: { fontSize: 10, fontWeight: '700', flex: 1 },
  emiLoanItemMeta: { fontSize: 9, fontWeight: '600' },
  emiLoanItemAmount: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  emiLoanItemSub: { fontSize: 9, fontWeight: '500' },
  liabilityMonthTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  liabilityMonthRow: { gap: 10, paddingVertical: 2, paddingRight: 4 },
  liabilityMonthItem: {
    width: 118,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  liabilityMonthItemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  liabilityMonthStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  liabilityMonthStatusText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  liabilityMonthLabel: { fontSize: 11, fontWeight: '700', flex: 1 },
  liabilityMonthAmount: { fontSize: 15, fontWeight: '800', marginTop: 6 },
  liabilityMonthEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 12,
  },
  card: { borderRadius: 16, padding: 16, borderWidth: 1 },
  gradientCardWrap: { borderRadius: 16, overflow: 'hidden' },
  gradientCard: { borderRadius: 16, padding: 16 },
  gradientCardTitle: { marginBottom: 20},
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 16 },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 130, paddingTop: 4 },
  barCol: { alignItems: 'center', flex: 1 },
  barColPressed: { opacity: 0.88 },
  barValueLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4, maxWidth: '100%' },
  barValueSpacer: { height: 15, marginBottom: 4 },
  barTrack: { width: 28, height: 88, borderRadius: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderTopLeftRadius: 10, borderTopRightRadius: 10, minHeight: 4 },
  barLabel: { fontSize: 11, marginTop: 6, fontWeight: '600' },
  barDateLabel: { fontSize: 9, marginTop: 2, fontWeight: '500' },
  catBreakdownItem: { marginBottom: 14 },
  catBreakdownHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  catBreakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { fontSize: 14, fontWeight: '600' },
  catTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  catFill: { height: '100%', borderRadius: 4 },
  catAmt: { fontSize: 12, fontWeight: '700' },
  expensiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  expensiveLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  expensiveIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expensiveCopy: { flex: 1 },
  expensiveLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  expensiveTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  expensiveCategory: { fontSize: 12, marginTop: 2 },
  expensiveAmount: { color: '#FB7185', fontWeight: '800', fontSize: 20 },
  goalItem: { borderBottomWidth: 1, paddingVertical: 12 },
  goalName: { fontSize: 15, fontWeight: '700' },
  contribBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, marginTop: 8 },
  sectionHeading: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  actionCardWrap: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  actionCardPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  actionCard: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
    gap: 8,
  },
  actionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardLabel: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 13,
  },
  sheetCardWrap: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  sheetCard: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  sheetCardLabel: { color: '#F0FDFA', fontSize: 12, fontWeight: '700' },
  navCardWrap: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  navCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 72,
  },
  navCardContent: { flex: 1, justifyContent: 'center', gap: 2 },
  navCardLabel: { color: '#F8FAFC', fontSize: 11, fontWeight: '700' },
  navCardValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  navCardHint: { color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '600', minHeight: 12 },
  plannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  plannerRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  plannerRowLabel: { fontSize: 13, fontWeight: '600' },
  plannerRowValue: { fontSize: 15, fontWeight: '800' },
  plannerCommitted: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
  },
  autoRow: { flexDirection: 'row', gap: 8 },
  autoBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  navBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  logItem: { borderBottomWidth: 1, paddingVertical: 8 },
  logTitle: { fontWeight: '700', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
});

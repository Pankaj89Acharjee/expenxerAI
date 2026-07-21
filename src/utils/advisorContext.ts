import type {
  Bill,
  BudgetTemplate,
  CategoryBudget,
  Expense,
  GroupExpense,
  GroupSettlement,
  Liability,
  SavingGoal,
  SplitGroup,
  Subscription,
  UserProfile,
} from '@/src/types/models';
import {
  splitMemberDisplayNames,
  getGroupExpensePayers,
  getGroupExpenseSplitAmong,
} from '@/src/types/models';
import {
  getCurrentMonthEmiStatus,
  getEffectiveLoanEmi,
  getLiabilityKindLabel,
  getLiabilityRemainingAmount,
  getLiabilityTypeLabel,
  getLoanPaidEmiCount,
  isLiabilityFullyPaid,
  isLoanLiability,
} from '@/src/utils/liabilitySchedule';
import { isPlannerLinkedExpense } from '@/src/utils/plannerExpenses';
import { sumActiveBillsMonthly, sumActiveSubscriptionsMonthly, toMonthlyAmount } from '@/src/utils/plannerTotals';
import { calculateSettlements } from '@/src/utils/settlements';
import { currentMonthYear, formatDate, parseJsonToMap } from '@/src/utils/format';

export interface AdvisorContextInput {
  userProfile: UserProfile | null;
  expenses: Expense[];
  liabilities: Liability[];
  subscriptions: Subscription[];
  bills: Bill[];
  savingGoals: SavingGoal[];
  categoryBudgets: CategoryBudget[];
  budgetTemplates: BudgetTemplate[];
  groups: SplitGroup[];
  groupExpenses: GroupExpense[];
  /** Recorded mark-as-paid transfers (optional; defaults to none). */
  groupSettlements?: GroupSettlement[];
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function startOfMonth(ms = Date.now()): number {
  const d = new Date(ms);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function filterByWindow(expenses: Expense[], days: number): Expense[] {
  const cutoff = Date.now() - days * 86400000;
  return expenses.filter((e) => e.dateMillis >= cutoff);
}

function categoryBreakdown(expenseList: Expense[]): string {
  const map: Record<string, number> = {};
  expenseList.forEach((e) => {
    map[e.category] = (map[e.category] ?? 0) + e.amount;
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return 'None';
  return sorted.map(([cat, amt]) => `${cat}: ₹${amt.toFixed(2)}`).join('; ');
}

function monthlyTotals(expenses: Expense[], months: number): string {
  const now = new Date();
  const lines: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d.getTime());
    const monthStart = d.getTime();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const total = expenses
      .filter((e) => e.dateMillis >= monthStart && e.dateMillis <= monthEnd)
      .reduce((s, e) => s + e.amount, 0);
    lines.push(`${key}: ₹${total.toFixed(2)}`);
  }
  return lines.join('; ');
}

function recurringItems(expenses: Expense[]): string {
  const counts: Record<string, { count: number; total: number; category: string }> = {};
  expenses.forEach((e) => {
    const key = e.title.trim().toLowerCase();
    if (!key) return;
    if (!counts[key]) counts[key] = { count: 0, total: 0, category: e.category };
    counts[key].count += 1;
    counts[key].total += e.amount;
  });
  const recurring = Object.entries(counts)
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);
  if (!recurring.length) return 'None detected';
  return recurring
    .map(([title, v]) => `"${title}" (${v.count}x, ₹${v.total.toFixed(2)}, ${v.category})`)
    .join('; ');
}

/** Peer-to-peer borrowing only — not Planner EMI / card loan expense rows. */
function isPeerBorrowingExpense(expense: Expense): boolean {
  return expense.category === 'Borrowing' && !isPlannerLinkedExpense(expense);
}

function formatExpenseRow(expense: Expense): string {
  const base = `${formatDate(expense.dateMillis)} | ${expense.title} | ₹${expense.amount.toFixed(2)} | ${expense.category}`;
  if (isPlannerLinkedExpense(expense)) {
    return `${base} | planner-payment (already recorded; not a peer settlement)`;
  }
  // `settled` applies only to informal peer Borrowing paybacks.
  if (expense.category === 'Borrowing') {
    return `${base} | settled:${expense.isSettled === true}`;
  }
  return base;
}

function formatLoanLiabilityLine(liability: Liability): string {
  const kind = getLiabilityKindLabel(liability);
  const type = getLiabilityTypeLabel(liability);
  const remaining = getLiabilityRemainingAmount(liability);
  const closed = isLiabilityFullyPaid(liability);

  if (isLoanLiability(liability)) {
    const tenure = liability.tenureMonths ?? 0;
    const paid = getLoanPaidEmiCount(liability);
    const emi = getEffectiveLoanEmi(liability);
    const month = getCurrentMonthEmiStatus(liability);
    const monthStatus = !month.hasEmi
      ? 'no EMI due this calendar month'
      : month.isPaid
        ? `this month EMI PAID on ${formatDate(month.paymentDateMillis!)} (₹${month.amount.toFixed(2)})`
        : `this month EMI DUE on ${formatDate(month.dueDateMillis!)} (₹${month.amount.toFixed(2)}${month.isOverdue ? ', OVERDUE' : ''})`;

    return [
      `${liability.name} [${kind} / ${type}]`,
      closed ? 'STATUS: CLOSED (fully paid)' : 'STATUS: ACTIVE',
      `EMI ₹${emi.toFixed(2)}/mo`,
      `progress ${paid}/${tenure} EMIs paid`,
      `remaining ₹${remaining.toFixed(2)}`,
      liability.lender ? `lender ${liability.lender}` : null,
      `first/next due reference ${formatDate(liability.dueDateMillis)}`,
      monthStatus,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  return [
    `${liability.name} [${kind} / ${type}]`,
    closed ? 'STATUS: CLOSED (fully paid)' : `STATUS: ${liability.isPaid ? 'marked paid this cycle' : 'ACTIVE'}`,
    `amount ₹${liability.amount.toFixed(2)}`,
    `remaining ₹${remaining.toFixed(2)}`,
    `${liability.frequency}`,
    `due ${formatDate(liability.dueDateMillis)}`,
  ].join(' | ');
}

export function buildAdvisorSystemPrompt(input: AdvisorContextInput): string {
  const {
    userProfile,
    expenses,
    liabilities,
    subscriptions,
    bills,
    savingGoals,
    categoryBudgets,
    budgetTemplates,
    groups,
    groupExpenses,
    groupSettlements = [],
  } = input;

  const userIncome = userProfile?.monthlyIncome ?? 5000;
  const monthYear = currentMonthYear();
  const monthStart = startOfMonth();
  const thisMonthExpenses = expenses.filter((e) => e.dateMillis >= monthStart);
  const last30d = filterByWindow(expenses, 30);
  const last90d = filterByWindow(expenses, 90);

  const expenseRows = [...expenses]
    .sort((a, b) => b.dateMillis - a.dateMillis)
    .slice(0, 60)
    .map(formatExpenseRow)
    .join('\n');

  const borrowing = expenses.filter(isPeerBorrowingExpense);
  const borrowingText =
    borrowing.length === 0
      ? 'None'
      : borrowing
          .map(
            (e) =>
              `${e.title} ₹${e.amount.toFixed(2)} (${formatDate(e.dateMillis)}) — ${e.isSettled ? 'settled' : 'pending'}${e.settlementNote ? `, note: ${e.settlementNote}` : ''}`
          )
          .join('; ');

  const budgetLines = categoryBudgets
    .map((b) => {
      const spent = thisMonthExpenses
        .filter((e) => e.category.toLowerCase() === b.category.toLowerCase())
        .reduce((s, e) => s + e.amount, 0);
      const pct = b.limitAmount > 0 ? Math.round((spent / b.limitAmount) * 100) : 0;
      return `${b.category}: spent ₹${spent.toFixed(2)} / limit ₹${b.limitAmount.toFixed(2)} (${pct}%, ${b.monthYear})`;
    })
    .join('; ');

  const templateLines = budgetTemplates
    .map((t) => {
      const alloc = parseJsonToMap(t.allocationsJson);
      const allocStr = Object.entries(alloc)
        .map(([k, v]) => `${k}:₹${v}`)
        .join(', ');
      return `"${t.name}" income ₹${t.monthlyIncome} — ${allocStr || 'no allocations'}`;
    })
    .join('; ');

  const activeLiabilities = liabilities.filter((l) => !isLiabilityFullyPaid(l));
  const closedLiabilities = liabilities.filter((l) => isLiabilityFullyPaid(l)).slice(0, 10);

  const liabilityText = activeLiabilities.length
    ? activeLiabilities.map(formatLoanLiabilityLine).join('\n')
    : 'None active';

  const closedLiabilityText = closedLiabilities.length
    ? closedLiabilities.map(formatLoanLiabilityLine).join('\n')
    : 'None recently closed in tracker';

  const subText = subscriptions.length
    ? subscriptions
        .filter((s) => s.isActive)
        .map(
          (s) =>
            `${s.name} ₹${toMonthlyAmount(s.cost, s.billingCycle).toFixed(2)}/mo equiv (₹${s.cost}/${s.billingCycle}) | next ${formatDate(s.nextPaymentMillis)} | ${s.category}${s.lastPaidMillis ? ` | last paid ${formatDate(s.lastPaidMillis)}` : ''}`
        )
        .join('; ')
    : 'None';

  const billsText = bills.length
    ? bills
        .filter((b) => b.isActive)
        .map(
          (b) =>
            `${b.name} ₹${toMonthlyAmount(b.amount, b.billingCycle).toFixed(2)}/mo equiv (₹${b.amount}/${b.billingCycle}) | next ${formatDate(b.nextPaymentMillis)} | ${b.category}${b.lastPaidMillis ? ` | last paid ${formatDate(b.lastPaidMillis)}` : ''}`
        )
        .join('; ')
    : 'None';

  const goalsText = savingGoals.length
    ? savingGoals
        .map(
          (g) =>
            `${g.name}: target ₹${g.targetAmount}, saved ₹${g.savedAmount}, req ₹${g.currentRequiredMonthly}/mo, due ${formatDate(g.targetDateMillis)}`
        )
        .join('; ')
    : 'None';

  const groupLines = groups.length
    ? groups
        .map((g) => {
          const gExpenses = groupExpenses.filter((e) => e.groupId === g.id);
          const total = gExpenses.reduce((s, e) => s + e.amount, 0);
          const memberNames = splitMemberDisplayNames(g);
          const recorded = groupSettlements.filter((s) => s.groupId === g.id);
          const settlements = calculateSettlements(memberNames, gExpenses, recorded);
          const settleStr =
            settlements.length > 0
              ? settlements.map((f) => `${f.debtor} borrowed from ${f.creditor} ₹${f.amount.toFixed(2)}`).join('; ')
              : 'balanced';
          const recent = gExpenses
            .slice(0, 5)
            .map((e) => {
              const payers = getGroupExpensePayers(e).join(', ') || e.paidBy;
              const among = getGroupExpenseSplitAmong(e, memberNames);
              const forLabel =
                among.length === 0 || among.length === memberNames.length
                  ? 'everyone'
                  : among.join(', ');
              return `${e.title} ₹${e.amount.toFixed(2)} paid by ${payers} for ${forLabel} (${formatDate(e.dateMillis)})`;
            })
            .join('; ');
          return `Group "${g.name}" [${memberNames.join(', ')}]: ${gExpenses.length} expenses, total ₹${total.toFixed(2)} | settlements: ${settleStr}${recent ? ` | recent: ${recent}` : ''}`;
        })
        .join('\n')
    : 'None';

  return `You are the Expenxer AI Advisor. Keep responses focused, clear, precise and highly professional.
Use the financial data below to answer questions about trends, comparisons, budgets, liabilities, borrowing, and group splits.
When citing amounts use ₹ (INR). Today is ${formatDate(Date.now(), 'full')}. Current month: ${monthYear}.

IMPORTANT RULES FOR LOANS / EMIs:
- Use the LIABILITIES sections for loan/EMI status (ACTIVE vs CLOSED, EMIs paid, remaining, this-month paid/due).
- Expense rows tagged "planner-payment" are EMI/bill/subscription payment logs. Do NOT treat them as unsettled peer debts.
- The field settled:true/false applies ONLY to informal peer Borrowing paybacks — never to bank loans or credit-card EMI plans.

=== INCOME ===
Monthly Income: ₹${userIncome}
This month spent: ₹${thisMonthExpenses.reduce((s, e) => s + e.amount, 0).toFixed(2)} | Remaining: ₹${Math.max(userIncome - thisMonthExpenses.reduce((s, e) => s + e.amount, 0), 0).toFixed(2)}

=== TIME WINDOWS ===
Last 7 days total: ₹${filterByWindow(expenses, 7).reduce((s, e) => s + e.amount, 0).toFixed(2)} | categories: ${categoryBreakdown(filterByWindow(expenses, 7))}
Last 30 days total: ₹${last30d.reduce((s, e) => s + e.amount, 0).toFixed(2)} | categories: ${categoryBreakdown(last30d)}
Last 90 days total: ₹${last90d.reduce((s, e) => s + e.amount, 0).toFixed(2)} | categories: ${categoryBreakdown(last90d)}
This month (${monthYear}) categories: ${categoryBreakdown(thisMonthExpenses)}
Monthly totals (last 12 months): ${monthlyTotals(expenses, 12)}
Recurring purchases (2+ times): ${recurringItems(expenses)}

=== INDIVIDUAL EXPENSES (most recent 60) ===
${expenseRows || 'None logged'}

=== CATEGORY BUDGETS (${monthYear}) ===
${budgetLines || 'No budgets set for this month'}

=== BUDGET TEMPLATES ===
${templateLines || 'None saved'}

=== PEER BORROWING / SETTLEMENT (informal only) ===
${borrowingText}

=== ACTIVE LOANS / LIABILITIES (live Planner data) ===
${liabilityText}

=== CLOSED / FULLY PAID LOANS & LIABILITIES ===
${closedLiabilityText}

=== SUBSCRIPTIONS (active, monthly equivalent) ===
${subText}

=== BILLS (active, monthly equivalent) ===
${billsText}

Monthly committed (subs + bills): ₹${(sumActiveSubscriptionsMonthly(subscriptions) + sumActiveBillsMonthly(bills)).toFixed(2)}

=== SAVINGS GOALS ===
${goalsText}

=== GROUP / SPLIT EXPENSES ===
${groupLines}

Analyse this context and respond with actionable FinTech intelligence. For trend or year-over-year questions, use the monthly totals and individual expense rows. For loan questions, prefer ACTIVE/CLOSED LIABILITIES over expense settled flags.`;
}

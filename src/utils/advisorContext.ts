import type {
  BudgetTemplate,
  CategoryBudget,
  Expense,
  GroupExpense,
  Liability,
  SavingGoal,
  SplitGroup,
  Subscription,
  UserProfile,
} from '@/src/types/models';
import { calculateSettlements } from '@/src/utils/settlements';
import { currentMonthYear, formatDate, parseJsonToMap } from '@/src/utils/format';

export interface AdvisorContextInput {
  userProfile: UserProfile | null;
  expenses: Expense[];
  liabilities: Liability[];
  subscriptions: Subscription[];
  savingGoals: SavingGoal[];
  categoryBudgets: CategoryBudget[];
  budgetTemplates: BudgetTemplate[];
  groups: SplitGroup[];
  groupExpenses: GroupExpense[];
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

export function buildAdvisorSystemPrompt(input: AdvisorContextInput): string {
  const {
    userProfile,
    expenses,
    liabilities,
    subscriptions,
    savingGoals,
    categoryBudgets,
    budgetTemplates,
    groups,
    groupExpenses,
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
    .map(
      (e) =>
        `${formatDate(e.dateMillis)} | ${e.title} | ₹${e.amount.toFixed(2)} | ${e.category}${e.notes ? ` | ${e.notes}` : ''}${e.isSettled != null ? ` | settled:${e.isSettled}` : ''}`
    )
    .join('\n');

  const borrowing = expenses.filter((e) => e.category === 'Borrowing' || e.category === 'Credit-card');
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

  const liabilityText = liabilities.length
    ? liabilities
        .map(
          (l) =>
            `${l.name} ₹${l.amount.toFixed(2)} | ${l.frequency} | due ${formatDate(l.dueDateMillis)} | ${l.isPaid ? 'PAID' : 'UNPAID'} | ${l.category}`
        )
        .join('\n')
    : 'None';

  const subText = subscriptions.length
    ? subscriptions
        .map(
          (s) =>
            `${s.name} ₹${s.cost.toFixed(2)}/${s.billingCycle} | next ${formatDate(s.nextPaymentMillis)} | ${s.category}`
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
          const settlements = calculateSettlements(g.members, gExpenses);
          const settleStr =
            settlements.length > 0
              ? settlements.map((f) => `${f.debtor} owes ${f.creditor} ₹${f.amount.toFixed(2)}`).join('; ')
              : 'balanced';
          const recent = gExpenses
            .slice(0, 5)
            .map((e) => `${e.title} ₹${e.amount.toFixed(2)} paid by ${e.paidBy} (${formatDate(e.dateMillis)})`)
            .join('; ');
          return `Group "${g.name}" [${g.members.join(', ')}]: ${gExpenses.length} expenses, total ₹${total.toFixed(2)} | settlements: ${settleStr}${recent ? ` | recent: ${recent}` : ''}`;
        })
        .join('\n')
    : 'None';

  return `You are the Expenxer AI Advisor. Keep responses focused, clear, precise and highly professional.
Use the financial data below to answer questions about trends, comparisons, budgets, liabilities, borrowing, and group splits.
When citing amounts use ₹ (INR). Today is ${formatDate(Date.now(), 'full')}. Current month: ${monthYear}.

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

=== BORROWING / SETTLEMENT ===
${borrowingText}

=== LIABILITIES ===
${liabilityText}

=== SUBSCRIPTIONS ===
${subText}

=== SAVINGS GOALS ===
${goalsText}

=== GROUP / SPLIT EXPENSES ===
${groupLines}

Analyse this context and respond with actionable FinTech intelligence. For trend or year-over-year questions, use the monthly totals and individual expense rows.`;
}

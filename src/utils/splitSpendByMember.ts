import type { GroupExpense } from '@/src/types/models';
import { getGroupExpensePayers } from '@/src/types/models';

export type MemberPaidSummary = {
  name: string;
  totalPaid: number;
  expenseCount: number;
};

/** Share of an expense attributed to a payer (equal split among payers). */
export function expensePaidShareForMember(expense: GroupExpense, memberName: string): number {
  const payers = getGroupExpensePayers(expense);
  if (!payers.includes(memberName)) return 0;
  return expense.amount / payers.length;
}

export function filterExpensesPaidByMember(
  expenses: readonly GroupExpense[],
  memberName: string
): GroupExpense[] {
  return expenses.filter((e) => getGroupExpensePayers(e).includes(memberName));
}

/** Totals for who paid (fronted cash), ordered by spend desc. */
export function summarizePaidByMembers(
  expenses: readonly GroupExpense[],
  memberNames: readonly string[]
): MemberPaidSummary[] {
  const map = new Map<string, MemberPaidSummary>();
  for (const name of memberNames) {
    map.set(name, { name, totalPaid: 0, expenseCount: 0 });
  }

  for (const exp of expenses) {
    const payers = getGroupExpensePayers(exp).filter((p) => map.has(p) || memberNames.length === 0);
    if (payers.length === 0) continue;
    const share = exp.amount / payers.length;
    for (const p of payers) {
      const row = map.get(p) ?? { name: p, totalPaid: 0, expenseCount: 0 };
      row.totalPaid += share;
      row.expenseCount += 1;
      map.set(p, row);
    }
  }

  return [...map.values()].sort((a, b) => b.totalPaid - a.totalPaid);
}

/** Top payer totals as `[name, amount]` for charts (includes unknown payers not in member list). */
export function topPayerTotals(
  expenses: readonly GroupExpense[],
  limit = 8
): [string, number][] {
  const map = new Map<string, number>();
  for (const exp of expenses) {
    const payers = getGroupExpensePayers(exp);
    if (payers.length === 0) continue;
    const share = exp.amount / payers.length;
    for (const p of payers) {
      map.set(p, (map.get(p) ?? 0) + share);
    }
  }
  return [...map.entries()]
    .filter(([, v]) => v > 0.005)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

import { billExpenseCategory } from '@/src/constants/billPurposes';
import { saveCloudExpense } from '@/src/services/expensesCloud';
import type { Bill, Expense, Liability, Subscription } from '@/src/types/models';
import {
  getEffectiveLoanEmi,
  isCreditCardLoanLiability,
  isLoanLiability,
  mergeLiabilitySchedule,
} from '@/src/utils/liabilitySchedule';
import {
  parseBillPaymentHistory,
  parseSubscriptionPaymentHistory,
  startOfDay,
} from '@/src/utils/recurringBilling';

export const PLANNER_LIABILITY_PREFIX = 'planner:liability:';
export const PLANNER_SUBSCRIPTION_PREFIX = 'planner:subscription:';
export const PLANNER_BILL_PREFIX = 'planner:bill:';

export function plannerLiabilityExpenseNote(liabilityId: string, installmentIndex: number): string {
  return `${PLANNER_LIABILITY_PREFIX}${liabilityId}:installment:${installmentIndex}`;
}

export function isPlannerLiabilityExpense(notes: string): boolean {
  return notes.startsWith(PLANNER_LIABILITY_PREFIX);
}

export function findPlannerLiabilityExpense(
  expenses: readonly Expense[],
  liabilityId: string,
  installmentIndex: number
): Expense | undefined {
  const note = plannerLiabilityExpenseNote(liabilityId, installmentIndex);
  return expenses.find((e) => e.notes === note);
}

export function isPlannerLinkedExpense(expense: Expense): boolean {
  const notes = expense.notes ?? '';
  return (
    notes.startsWith(PLANNER_LIABILITY_PREFIX) ||
    notes.startsWith(PLANNER_SUBSCRIPTION_PREFIX) ||
    notes.startsWith(PLANNER_BILL_PREFIX)
  );
}

export function subscriptionPaymentExpenseNote(subscriptionId: string, paymentDateMillis: number): string {
  return `${PLANNER_SUBSCRIPTION_PREFIX}${subscriptionId}:paid:${startOfDay(paymentDateMillis)}`;
}

export function billPaymentExpenseNote(billId: string, paymentDateMillis: number): string {
  return `${PLANNER_BILL_PREFIX}${billId}:paid:${startOfDay(paymentDateMillis)}`;
}

export function listSubscriptionPaymentExpenses(
  expenses: readonly Expense[],
  subscriptionId: string
): Expense[] {
  const prefix = `${PLANNER_SUBSCRIPTION_PREFIX}${subscriptionId}:paid:`;
  return expenses.filter((e) => (e.notes ?? '').startsWith(prefix));
}

export function listBillPaymentExpenses(expenses: readonly Expense[], billId: string): Expense[] {
  const prefix = `${PLANNER_BILL_PREFIX}${billId}:paid:`;
  return expenses.filter((e) => (e.notes ?? '').startsWith(prefix));
}

export function findSubscriptionPaymentExpense(
  expenses: readonly Expense[],
  subscriptionId: string,
  paymentDateMillis: number
): Expense | undefined {
  const day = startOfDay(paymentDateMillis);
  const exactNote = subscriptionPaymentExpenseNote(subscriptionId, day);
  const exact = expenses.find((e) => e.notes === exactNote);
  if (exact) return exact;

  const prefix = `${PLANNER_SUBSCRIPTION_PREFIX}${subscriptionId}:paid:`;
  return expenses.find((e) => {
    const notes = e.notes ?? '';
    if (!notes.startsWith(prefix)) return false;
    const rawMillis = Number(notes.slice(prefix.length));
    return Number.isFinite(rawMillis) && startOfDay(rawMillis) === day;
  });
}

export function findBillPaymentExpense(
  expenses: readonly Expense[],
  billId: string,
  paymentDateMillis: number
): Expense | undefined {
  const day = startOfDay(paymentDateMillis);
  const exactNote = billPaymentExpenseNote(billId, day);
  const exact = expenses.find((e) => e.notes === exactNote);
  if (exact) return exact;

  const prefix = `${PLANNER_BILL_PREFIX}${billId}:paid:`;
  return expenses.find((e) => {
    const notes = e.notes ?? '';
    if (!notes.startsWith(prefix)) return false;
    const rawMillis = Number(notes.slice(prefix.length));
    return Number.isFinite(rawMillis) && startOfDay(rawMillis) === day;
  });
}

export function buildSubscriptionPaymentExpense(
  sub: Pick<Subscription, 'id' | 'name' | 'category' | 'userEmail'>,
  paymentDateMillis: number,
  amount: number
): Omit<Expense, 'id'> {
  const day = startOfDay(paymentDateMillis);
  return {
    userEmail: sub.userEmail,
    title: `${sub.name} subscription payment`,
    amount,
    category: sub.category,
    dateMillis: day,
    notes: subscriptionPaymentExpenseNote(sub.id, day),
    receiptPath: null,
  };
}

export function buildBillPaymentExpense(
  bill: Pick<Bill, 'id' | 'name' | 'category' | 'userEmail'>,
  paymentDateMillis: number,
  amount: number
): Omit<Expense, 'id'> {
  const day = startOfDay(paymentDateMillis);
  return {
    userEmail: bill.userEmail,
    title: `${bill.name} bill payment`,
    amount,
    category: billExpenseCategory(bill.name) || bill.category || 'Utilities',
    dateMillis: day,
    notes: billPaymentExpenseNote(bill.id, day),
    receiptPath: null,
  };
}

export function subscriptionPaymentExpensesNeedSync(
  sub: Subscription,
  expenses: readonly Expense[]
): boolean {
  const history = parseSubscriptionPaymentHistory(sub.paymentHistoryJson);
  return history.some((payment) => {
    const existing = findSubscriptionPaymentExpense(expenses, sub.id, payment.paymentDateMillis);
    if (!existing) return true;
    const expected = buildSubscriptionPaymentExpense(sub, payment.paymentDateMillis, sub.cost);
    return (
      existing.title !== expected.title ||
      existing.amount !== expected.amount ||
      existing.category !== expected.category ||
      existing.notes !== expected.notes
    );
  });
}

export function billPaymentExpensesNeedSync(bill: Bill, expenses: readonly Expense[]): boolean {
  const history = parseBillPaymentHistory(bill.paymentHistoryJson);
  return history.some((payment) => {
    const existing = findBillPaymentExpense(expenses, bill.id, payment.paymentDateMillis);
    if (!existing) return true;
    const expected = buildBillPaymentExpense(bill, payment.paymentDateMillis, bill.amount);
    return (
      existing.title !== expected.title ||
      existing.amount !== expected.amount ||
      existing.category !== expected.category ||
      existing.notes !== expected.notes
    );
  });
}

export async function syncSubscriptionPaymentExpenses(
  uid: string,
  sub: Subscription,
  expenses: readonly Expense[]
): Promise<boolean> {
  const history = parseSubscriptionPaymentHistory(sub.paymentHistoryJson);
  let changed = false;

  for (const payment of history) {
    const existing = findSubscriptionPaymentExpense(expenses, sub.id, payment.paymentDateMillis);
    const payload = buildSubscriptionPaymentExpense(sub, payment.paymentDateMillis, sub.cost);

    if (existing) {
      if (
        existing.title !== payload.title ||
        existing.amount !== payload.amount ||
        existing.category !== payload.category ||
        existing.notes !== payload.notes
      ) {
        await saveCloudExpense(uid, payload, existing.id);
        changed = true;
      }
      continue;
    }

    await saveCloudExpense(uid, payload);
    changed = true;
  }

  return changed;
}

export async function syncBillPaymentExpenses(
  uid: string,
  bill: Bill,
  expenses: readonly Expense[]
): Promise<boolean> {
  const history = parseBillPaymentHistory(bill.paymentHistoryJson);
  let changed = false;

  for (const payment of history) {
    const existing = findBillPaymentExpense(expenses, bill.id, payment.paymentDateMillis);
    const payload = buildBillPaymentExpense(bill, payment.paymentDateMillis, bill.amount);

    if (existing) {
      if (
        existing.title !== payload.title ||
        existing.amount !== payload.amount ||
        existing.category !== payload.category ||
        existing.notes !== payload.notes
      ) {
        await saveCloudExpense(uid, payload, existing.id);
        changed = true;
      }
      continue;
    }

    await saveCloudExpense(uid, payload);
    changed = true;
  }

  return changed;
}

export function liabilityExpenseCategory(liability: Liability): string {
  if (isCreditCardLoanLiability(liability) || liability.loanType === 'CREDIT_CARD') {
    return 'Credit-card';
  }
  return 'Loan-Liability';
}

export function buildLiabilityInstallmentExpenseTitle(
  liability: Liability,
  installmentIndex: number,
  totalInstallments: number
): string {
  if (isLoanLiability(liability)) {
    return `${liability.name} — EMI ${installmentIndex + 1}/${totalInstallments}`;
  }
  return `${liability.name} — Payment ${installmentIndex + 1}/${totalInstallments}`;
}

export function installmentExpenseAmount(liability: Liability, installmentIndex: number): number {
  const schedule = mergeLiabilitySchedule(liability);
  const inst = schedule[installmentIndex];
  if (inst && inst.amount > 0) return inst.amount;
  if (isLoanLiability(liability)) return getEffectiveLoanEmi(liability);
  return liability.amount / Math.max(1, schedule.length);
}

import { billExpenseCategory } from '@/src/constants/billPurposes';
import { deleteCloudExpense, saveCloudExpense } from '@/src/services/expensesCloud';
import type { Bill, Expense, Liability, Subscription } from '@/src/types/models';
import {
  getEffectiveLoanEmi,
  isCreditCardLoanLiability,
  isLoanLiability,
  mergeLiabilitySchedule,
  parsePaymentHistory,
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

export function plannerLiabilityHistoryExpenseNote(liabilityId: string, recordId: string): string {
  return `${PLANNER_LIABILITY_PREFIX}${liabilityId}:history:${recordId}`;
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

export function findPlannerLiabilityHistoryExpense(
  expenses: readonly Expense[],
  liabilityId: string,
  recordId: string
): Expense | undefined {
  const note = plannerLiabilityHistoryExpenseNote(liabilityId, recordId);
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

export function listLiabilityPaymentExpenses(
  expenses: readonly Expense[],
  liabilityId: string
): Expense[] {
  const prefix = `${PLANNER_LIABILITY_PREFIX}${liabilityId}:`;
  return expenses.filter((e) => (e.notes ?? '').startsWith(prefix));
}

function installmentIndexFromExpenseNotes(notes: string | null | undefined): number | null {
  const match = (notes ?? '').match(/:installment:(\d+)$/);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isFinite(index) ? index : null;
}

function historyRecordIdFromExpenseNotes(notes: string | null | undefined): string | null {
  const match = (notes ?? '').match(/:history:(.+)$/);
  return match?.[1] ?? null;
}

export function buildLiabilityInstallmentExpense(
  liability: Liability,
  installmentIndex: number,
  paymentDateMillis: number,
  amount: number,
  totalInstallments: number
): Omit<Expense, 'id'> {
  return {
    userEmail: liability.userEmail,
    title: buildLiabilityInstallmentExpenseTitle(liability, installmentIndex, totalInstallments),
    amount,
    category: liabilityExpenseCategory(liability),
    dateMillis: paymentDateMillis,
    notes: plannerLiabilityExpenseNote(liability.id, installmentIndex),
    receiptPath: null,
  };
}

export function buildLiabilityHistoryExpense(
  liability: Liability,
  recordId: string,
  paymentDateMillis: number,
  amount: number,
  financialYearLabel?: string
): Omit<Expense, 'id'> {
  const fy = financialYearLabel ? ` (${financialYearLabel})` : '';
  return {
    userEmail: liability.userEmail,
    title: `${liability.name} — Payment${fy}`,
    amount,
    category: liabilityExpenseCategory(liability),
    dateMillis: paymentDateMillis,
    notes: plannerLiabilityHistoryExpenseNote(liability.id, recordId),
    receiptPath: null,
  };
}

export function liabilityPaymentExpensesNeedSync(
  liability: Liability,
  expenses: readonly Expense[]
): boolean {
  const schedule = mergeLiabilitySchedule(liability);
  const paidIndexes = new Set<number>();

  for (let i = 0; i < schedule.length; i++) {
    const inst = schedule[i];
    if (!inst.isPaymentDone) continue;
    paidIndexes.add(i);
    const existing = findPlannerLiabilityExpense(expenses, liability.id, i);
    if (!existing) return true;
    const amount = inst.amount > 0 ? inst.amount : installmentExpenseAmount(liability, i);
    const expected = buildLiabilityInstallmentExpense(
      liability,
      i,
      inst.paymentDateMillis ?? existing.dateMillis,
      amount,
      schedule.length
    );
    if (
      existing.title !== expected.title ||
      existing.amount !== expected.amount ||
      existing.category !== expected.category ||
      existing.notes !== expected.notes
    ) {
      return true;
    }
  }

  const history = isLoanLiability(liability) ? [] : parsePaymentHistory(liability.paymentHistoryJson);
  const historyIds = new Set(history.map((r) => r.id));
  for (const record of history) {
    const existing = findPlannerLiabilityHistoryExpense(expenses, liability.id, record.id);
    if (!existing) return true;
    const expected = buildLiabilityHistoryExpense(
      liability,
      record.id,
      record.paymentDateMillis,
      record.amount,
      record.financialYearLabel
    );
    if (
      existing.title !== expected.title ||
      existing.amount !== expected.amount ||
      existing.category !== expected.category ||
      existing.notes !== expected.notes
    ) {
      return true;
    }
  }

  return listLiabilityPaymentExpenses(expenses, liability.id).some((expense) => {
    const notes = expense.notes ?? '';
    if (notes.includes(':installment:')) {
      const index = installmentIndexFromExpenseNotes(notes);
      return index == null || !paidIndexes.has(index);
    }
    if (notes.includes(':history:')) {
      const recordId = historyRecordIdFromExpenseNotes(notes);
      return recordId == null || !historyIds.has(recordId);
    }
    return true;
  });
}

/** Create/update/delete Expenses rows to match paid installments and annual payment history. */
export async function syncLiabilityPaymentExpenses(
  uid: string,
  liability: Liability,
  expenses: readonly Expense[]
): Promise<boolean> {
  const schedule = mergeLiabilitySchedule(liability);
  let changed = false;
  const paidIndexes = new Set<number>();

  for (let i = 0; i < schedule.length; i++) {
    const inst = schedule[i];
    if (!inst.isPaymentDone) continue;
    paidIndexes.add(i);

    const amount = inst.amount > 0 ? inst.amount : installmentExpenseAmount(liability, i);
    const paymentDateMillis = inst.paymentDateMillis ?? Date.now();
    const payload = buildLiabilityInstallmentExpense(
      liability,
      i,
      paymentDateMillis,
      amount,
      schedule.length
    );
    const existing = findPlannerLiabilityExpense(expenses, liability.id, i);

    if (existing) {
      if (
        existing.title !== payload.title ||
        existing.amount !== payload.amount ||
        existing.category !== payload.category ||
        existing.dateMillis !== payload.dateMillis ||
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

  const history = isLoanLiability(liability) ? [] : parsePaymentHistory(liability.paymentHistoryJson);
  const historyIds = new Set(history.map((r) => r.id));

  for (const record of history) {
    const payload = buildLiabilityHistoryExpense(
      liability,
      record.id,
      record.paymentDateMillis,
      record.amount,
      record.financialYearLabel
    );
    const existing = findPlannerLiabilityHistoryExpense(expenses, liability.id, record.id);
    if (existing) {
      if (
        existing.title !== payload.title ||
        existing.amount !== payload.amount ||
        existing.category !== payload.category ||
        existing.dateMillis !== payload.dateMillis ||
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

  for (const expense of listLiabilityPaymentExpenses(expenses, liability.id)) {
    const notes = expense.notes ?? '';
    if (notes.includes(':installment:')) {
      const index = installmentIndexFromExpenseNotes(notes);
      if (index != null && paidIndexes.has(index)) continue;
      await deleteCloudExpense(uid, expense.id);
      changed = true;
      continue;
    }
    if (notes.includes(':history:')) {
      const recordId = historyRecordIdFromExpenseNotes(notes);
      if (recordId != null && historyIds.has(recordId)) continue;
      await deleteCloudExpense(uid, expense.id);
      changed = true;
      continue;
    }
    await deleteCloudExpense(uid, expense.id);
    changed = true;
  }

  return changed;
}

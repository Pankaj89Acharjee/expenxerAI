import type { Bill, Subscription } from '@/src/types/models';

export const RECURRING_PAYMENT_WINDOW_DAYS = 10;
export type SubscriptionPaymentRecord = {
  id: string;
  paymentDateMillis: number;
  amount: number;
};

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function advanceBillingDate(fromMillis: number, billingCycle: string): number {
  const d = new Date(fromMillis);
  if (billingCycle === 'YEARLY') {
    d.setFullYear(d.getFullYear() + 1);
  } else if (billingCycle === 'QUARTERLY') {
    d.setMonth(d.getMonth() + 3);
  } else if (billingCycle === 'HALF_YEARLY') {
    d.setMonth(d.getMonth() + 6);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.getTime();
}

/** Keep the user-selected billing due date — past dates stay overdue until paid. */
export function normalizeNextPaymentDate(
  anchorMillis: number,
  _billingCycle?: string,
  _now = Date.now()
): number {
  return anchorMillis;
}

export function paymentWindowOpensMillis(nextPaymentMillis: number): number {
  return startOfDay(nextPaymentMillis - RECURRING_PAYMENT_WINDOW_DAYS * 86400000);
}

export function canRecordRecurringPayment(nextPaymentMillis: number, now = Date.now()): boolean {
  return startOfDay(now) >= paymentWindowOpensMillis(nextPaymentMillis);
}

export type RecurringPaymentStatus = 'paid' | 'due_soon' | 'overdue' | 'locked';

export function daysUntilPaymentWindow(nextPaymentMillis: number, now = Date.now()): number {
  const opens = paymentWindowOpensMillis(nextPaymentMillis);
  return Math.max(0, Math.ceil((opens - startOfDay(now)) / 86400000));
}

export function isPaidForCurrentCycle(
  nextPaymentMillis: number,
  lastPaidMillis: number | null | undefined
): boolean {
  if (!lastPaidMillis) return false;
  return lastPaidMillis >= paymentWindowOpensMillis(nextPaymentMillis);
}

export function getRecurringPaymentStatus(
  nextPaymentMillis: number,
  lastPaidMillis: number | null | undefined,
  now = Date.now()
): RecurringPaymentStatus {
  if (isPaidForCurrentCycle(nextPaymentMillis, lastPaidMillis)) return 'paid';
  const today = startOfDay(now);
  const dueDay = startOfDay(nextPaymentMillis);
  if (today > dueDay) return 'overdue';
  if (canRecordRecurringPayment(nextPaymentMillis, now)) return 'due_soon';
  return 'locked';
}

export function recurringPaymentStatusLabel(status: RecurringPaymentStatus): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'due_soon':
      return 'Due soon';
    case 'overdue':
      return 'Overdue';
    default:
      return 'Upcoming';
  }
}

/**
 * True when lastPaidMillis was recent enough to represent "paid this current cycle".
 * After payment, nextPaymentMillis advances so isPaidForCurrentCycle returns false
 * (new window hasn't opened yet). This helper fills that gap.
 */
export function wasRecentlyPaid(
  lastPaidMillis: number | null | undefined,
  now = Date.now()
): boolean {
  if (!lastPaidMillis) return false;
  const daysSince = (now - lastPaidMillis) / 86_400_000;
  return daysSince < 62; // safe for monthly and quarterly cycles
}

export function recordRecurringPayment<T extends Pick<Subscription, 'nextPaymentMillis' | 'billingCycle' | 'lastPaidMillis'>>(
  item: T,
  paymentDateMillis: number
): T {
  return {
    ...item,
    lastPaidMillis: paymentDateMillis,
    nextPaymentMillis: advanceBillingDate(item.nextPaymentMillis, item.billingCycle),
  };
}

export function parseSubscriptionPaymentHistory(json: string | null | undefined): SubscriptionPaymentRecord[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => ({
        id: String(row?.id ?? ''),
        paymentDateMillis: Number(row?.paymentDateMillis ?? 0),
        amount: Number(row?.amount ?? 0),
      }))
      .filter((row) => row.id && row.paymentDateMillis > 0 && row.amount >= 0)
      .sort((a, b) => b.paymentDateMillis - a.paymentDateMillis);
  } catch {
    return [];
  }
}

export type BillPaymentRecord = SubscriptionPaymentRecord;

export function parseBillPaymentHistory(json: string | null | undefined): BillPaymentRecord[] {
  return parseSubscriptionPaymentHistory(json);
}

export function appendSubscriptionPaymentHistory(
  subscription: Subscription,
  paymentDateMillis: number,
  amount: number
): Subscription {
  const current = parseSubscriptionPaymentHistory(subscription.paymentHistoryJson);
  const next: SubscriptionPaymentRecord[] = [
    {
      id: `${paymentDateMillis}_${Math.round(amount * 100)}`,
      paymentDateMillis,
      amount,
    },
    ...current,
  ];
  return {
    ...subscription,
    paymentHistoryJson: JSON.stringify(next),
  };
}

export function appendBillPaymentHistory(
  bill: Bill,
  paymentDateMillis: number,
  amount: number
): Bill {
  const current = parseBillPaymentHistory(bill.paymentHistoryJson);
  const next: BillPaymentRecord[] = [
    {
      id: `${paymentDateMillis}_${Math.round(amount * 100)}`,
      paymentDateMillis,
      amount,
    },
    ...current,
  ];
  return {
    ...bill,
    paymentHistoryJson: JSON.stringify(next),
  };
}

export type RecurringPaymentItem = {
  id: string;
  kind: 'subscription' | 'bill';
  name: string;
  amount: number;
  billingCycle: string;
  nextPaymentMillis: number;
  lastPaidMillis: number | null;
  status: RecurringPaymentStatus;
  windowOpensMillis: number;
  category: string;
};

function toRecurringItem(
  kind: RecurringPaymentItem['kind'],
  id: string,
  name: string,
  amount: number,
  billingCycle: string,
  nextPaymentMillis: number,
  lastPaidMillis: number | null | undefined,
  category: string,
  now: number
): RecurringPaymentItem {
  return {
    id,
    kind,
    name,
    amount,
    billingCycle,
    nextPaymentMillis,
    lastPaidMillis: lastPaidMillis ?? null,
    status: getRecurringPaymentStatus(nextPaymentMillis, lastPaidMillis, now),
    windowOpensMillis: paymentWindowOpensMillis(nextPaymentMillis),
    category,
  };
}

export function listActiveRecurringPayments(
  subscriptions: readonly Subscription[],
  bills: readonly Bill[],
  now = Date.now()
): RecurringPaymentItem[] {
  const items: RecurringPaymentItem[] = [];

  for (const sub of subscriptions) {
    if (!sub.isActive) continue;
    items.push(
      toRecurringItem(
        'subscription',
        sub.id,
        sub.name,
        sub.cost,
        sub.billingCycle,
        sub.nextPaymentMillis,
        sub.lastPaidMillis,
        sub.category,
        now
      )
    );
  }

  for (const bill of bills) {
    if (!bill.isActive) continue;
    items.push(
      toRecurringItem(
        'bill',
        bill.id,
        bill.name,
        bill.amount,
        bill.billingCycle,
        bill.nextPaymentMillis,
        bill.lastPaidMillis,
        bill.category,
        now
      )
    );
  }

  return items.sort((a, b) => a.nextPaymentMillis - b.nextPaymentMillis);
}

export function summarizeRecurringPayments(items: readonly RecurringPaymentItem[]) {
  return {
    dueSoonCount: items.filter((i) => i.status === 'due_soon').length,
    overdueCount: items.filter((i) => i.status === 'overdue').length,
    paidCount: items.filter((i) => i.status === 'paid').length,
    lockedCount: items.filter((i) => i.status === 'locked').length,
    dueSoonTotal: items
      .filter((i) => i.status === 'due_soon' || i.status === 'overdue')
      .reduce((sum, i) => sum + i.amount, 0),
  };
}

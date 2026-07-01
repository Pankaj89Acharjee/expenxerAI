import type { Bill, Liability, Subscription } from '@/src/types/models';
import { getLiabilityRemainingAmount, isLiabilityFullyPaid } from '@/src/utils/liabilitySchedule';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toMonthlyAmount(amount: number, billingCycle: string): number {
  switch (billingCycle) {
    case 'YEARLY':
      return amount / 12;
    case 'HALF_YEARLY':
      return amount / 6;
    case 'QUARTERLY':
      return amount / 3;
    case 'MONTHLY':
    default:
      return amount;
  }
}

export function sumLiabilityRemaining(liabilities: Liability[]): number {
  return round2(
    liabilities
      .filter((l) => !isLiabilityFullyPaid(l))
      .reduce((s, l) => s + getLiabilityRemainingAmount(l), 0)
  );
}

export function sumActiveSubscriptionsMonthly(subscriptions: Subscription[]): number {
  return round2(
    subscriptions
      .filter((s) => s.isActive)
      .reduce((sum, s) => sum + toMonthlyAmount(s.cost, s.billingCycle), 0)
  );
}

export function sumActiveBillsMonthly(bills: Bill[]): number {
  return round2(
    bills
      .filter((b) => b.isActive)
      .reduce((sum, b) => sum + toMonthlyAmount(b.amount, b.billingCycle), 0)
  );
}

export type PlannerBreakdown = {
  liabilityRemaining: number;
  subscriptionsMonthly: number;
  billsMonthly: number;
  committedMonthly: number;
};

export function computePlannerBreakdown(
  liabilities: Liability[],
  subscriptions: Subscription[],
  bills: Bill[]
): PlannerBreakdown {
  const liabilityRemaining = sumLiabilityRemaining(liabilities);
  const subscriptionsMonthly = sumActiveSubscriptionsMonthly(subscriptions);
  const billsMonthly = sumActiveBillsMonthly(bills);
  return {
    liabilityRemaining,
    subscriptionsMonthly,
    billsMonthly,
    committedMonthly: round2(subscriptionsMonthly + billsMonthly),
  };
}

export function nextUnpaidLiability(liabilities: Liability[]): Liability | null {
  return (
    liabilities
      .filter((l) => !isLiabilityFullyPaid(l))
      .sort((a, b) => a.dueDateMillis - b.dueDateMillis)[0] ?? null
  );
}

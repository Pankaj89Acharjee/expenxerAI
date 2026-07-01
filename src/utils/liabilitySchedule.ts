import type { Liability, LiabilityInstallment } from '@/src/types/models';

export const LIABILITY_FREQUENCIES = ['YEARLY', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY'] as const;
export type LiabilityFrequency = (typeof LIABILITY_FREQUENCIES)[number];

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getInstallmentCount(frequency: string): number {
  switch (frequency) {
    case 'HALF_YEARLY':
      return 6;
    case 'QUARTERLY':
      return 4;
    case 'MONTHLY':
      return 12;
    case 'YEARLY':
    default:
      return 12;
  }
}

export function frequencyPlanLabel(frequency: string): string {
  const count = getInstallmentCount(frequency);
  switch (frequency) {
    case 'HALF_YEARLY':
      return `Half-yearly plan — ${count} payments`;
    case 'QUARTERLY':
      return `Quarterly plan — ${count} payments`;
    case 'MONTHLY':
      return `Monthly plan — ${count} payments`;
    default:
      return `Annual plan — ${count} payments`;
  }
}

export function daysUntil(ms: number): number {
  return Math.ceil((ms - Date.now()) / 86400000);
}

export function daysLeftLabel(ms: number): string {
  const d = daysUntil(ms);
  if (d < 0) return `${Math.abs(d)} days overdue`;
  if (d === 0) return 'Due today';
  return `${d} days left`;
}

export function parseInstallments(json: string): LiabilityInstallment[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeInstallments(installments: LiabilityInstallment[]): string {
  return JSON.stringify(installments);
}

export function buildSchedule(
  totalAmount: number,
  frequency: string,
  dueDateMillis: number
): LiabilityInstallment[] {
  const count = getInstallmentCount(frequency);
  const end = dueDateMillis;
  const now = Date.now();
  const start = Math.min(now, end - Math.max(count - 1, 0) * 30 * 86400000);
  const interval = count > 1 ? (end - start) / (count - 1) : 0;
  const share = totalAmount / count;

  return Array.from({ length: count }, (_, i) => {
    const dueMillis = count > 1 ? start + interval * i : end;
    const d = new Date(dueMillis);
    const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      index: i,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
      monthYear,
      amount: round2(share),
      dueDateMillis: dueMillis,
      isPaymentDone: false,
      paymentDateMillis: null,
      isDue: false,
    } satisfies LiabilityInstallment;
  });
}

export function recalculateSchedule(
  installments: LiabilityInstallment[],
  totalAmount: number
): LiabilityInstallment[] {
  const paidSum = installments
    .filter((i) => i.isPaymentDone)
    .reduce((s, i) => s + i.amount, 0);
  const remaining = Math.max(0, totalAmount - paidSum);
  const eligible = installments.filter((i) => !i.isPaymentDone && !i.isDue);
  const share = eligible.length > 0 ? remaining / eligible.length : 0;

  return installments.map((inst) => {
    if (inst.isPaymentDone) return inst;
    if (inst.isDue) return { ...inst, amount: 0 };
    return { ...inst, amount: round2(share) };
  });
}

export function mergeLiabilitySchedule(liability: Liability): LiabilityInstallment[] {
  const existing = parseInstallments(liability.paymentScheduleJson ?? '');
  const expectedCount = getInstallmentCount(liability.frequency);

  if (!existing.length || existing.length !== expectedCount) {
    return buildSchedule(liability.amount, liability.frequency, liability.dueDateMillis);
  }

  const unpaidSum = existing
    .filter((i) => !i.isPaymentDone)
    .reduce((s, i) => s + i.amount, 0);
  const paidSum = existing
    .filter((i) => i.isPaymentDone)
    .reduce((s, i) => s + i.amount, 0);

  if (Math.abs(paidSum + unpaidSum - liability.amount) > 0.5) {
    return recalculateSchedule(existing, liability.amount);
  }

  return existing;
}

export function getLiabilityRemainingAmount(liability: Liability): number {
  if (liability.isPaid) return 0;
  const schedule = mergeLiabilitySchedule(liability);
  if (!schedule.length) return liability.amount;
  const unpaid = schedule
    .filter((i) => !i.isPaymentDone)
    .reduce((s, i) => s + i.amount, 0);
  return round2(unpaid);
}

export function isLiabilityFullyPaid(liability: Liability): boolean {
  return getLiabilityRemainingAmount(liability) <= 0.01;
}

export function updateInstallment(
  installments: LiabilityInstallment[],
  index: number,
  patch: Partial<Pick<LiabilityInstallment, 'isPaymentDone' | 'paymentDateMillis' | 'isDue' | 'dueDateMillis'>>,
  totalAmount: number
): LiabilityInstallment[] {
  const next = installments.map((inst, i) => {
    if (i !== index) return inst;
    const updated = { ...inst, ...patch };
    if (patch.isPaymentDone && !updated.paymentDateMillis) {
      updated.paymentDateMillis = Date.now();
    }
    if (patch.isPaymentDone) {
      updated.isDue = false;
    }
    return updated;
  });
  return recalculateSchedule(next, totalAmount);
}

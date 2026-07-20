import type { Liability, LiabilityInstallment, LiabilityPaymentRecord } from '@/src/types/models';
import { loanTypeLabel } from '@/src/constants/loanTypes';
import { calculateMonthlyEmi, calculateTotalPayable } from '@/src/utils/emiCalculator';

export const LIABILITY_FREQUENCIES = ['YEARLY', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY'] as const;
export type LiabilityFrequency = (typeof LIABILITY_FREQUENCIES)[number];

export function isAnnualFrequency(frequency: string): boolean {
  return frequency === 'YEARLY';
}

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

/** Calendar months between consecutive installments for each plan type. */
export function getInstallmentMonthStep(frequency: string): number {
  switch (frequency) {
    case 'HALF_YEARLY':
      return 2;
    case 'QUARTERLY':
      return 3;
    case 'MONTHLY':
    case 'YEARLY':
    default:
      return 1;
  }
}

export function subtractMonthsFromMillis(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

export function addMonthsToMillis(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

export function isLoanLiability(liability: Liability): boolean {
  return liability.kind === 'LOAN' || liability.kind === 'CREDIT_CARD_LOAN';
}

export function isCreditCardLoanLiability(liability: Liability): boolean {
  return liability.kind === 'CREDIT_CARD_LOAN';
}

export function isStandardLoanLiability(liability: Liability): boolean {
  return liability.kind === 'LOAN';
}

export function getLiabilityKind(liability: Liability): 'ANNUAL' | 'LOAN' | 'CREDIT_CARD_LOAN' {
  if (liability.kind === 'CREDIT_CARD_LOAN') return 'CREDIT_CARD_LOAN';
  if (liability.kind === 'LOAN') return 'LOAN';
  return 'ANNUAL';
}

export function getLiabilityKindLabel(liability: Liability): string {
  if (isCreditCardLoanLiability(liability)) return 'Card EMI';
  return isLoanLiability(liability) ? 'EMI' : 'Annual';
}

export function getLiabilityTypeLabel(liability: Liability): string {
  if (isCreditCardLoanLiability(liability)) return 'Credit Card Loan';
  if (isLoanLiability(liability)) return loanTypeLabel(liability.loanType);
  return liability.frequency.replace('_', ' ');
}

export function getExpectedInstallmentCount(liability: Liability): number {
  if (isLoanLiability(liability)) {
    return Math.max(1, liability.tenureMonths ?? 1);
  }
  return getInstallmentCount(liability.frequency);
}

export function getEffectiveLoanEmi(liability: Liability): number {
  const principal = liability.principal ?? liability.amount ?? 0;
  const tenure = liability.tenureMonths ?? 0;
  if (principal > 0 && tenure > 0) {
    return calculateMonthlyEmi(principal, liability.interestRatePercent ?? 0, tenure);
  }
  return liability.emiAmount ?? 0;
}

export function getLoanTotalPayable(liability: Liability): number {
  const principal = liability.principal ?? liability.amount ?? 0;
  const tenure = liability.tenureMonths ?? 0;
  if (principal > 0 && tenure > 0) {
    return calculateTotalPayable(principal, liability.interestRatePercent ?? 0, tenure);
  }
  const emi = liability.emiAmount ?? 0;
  return round2(emi * tenure);
}

export function getLoanPaidEmiCount(liability: Liability): number {
  const schedule = mergeLiabilitySchedule(liability);
  return schedule.filter((i) => i.isPaymentDone).length;
}

export function getLoanRemainingAmount(liability: Liability): number {
  const tenure = liability.tenureMonths ?? 0;
  const emi = getEffectiveLoanEmi(liability);
  if (emi <= 0 || tenure <= 0) return 0;
  const paidCount = getLoanPaidEmiCount(liability);
  return round2(Math.max(0, emi * (tenure - paidCount)));
}

export type LoanEmiSummary = {
  liabilityId: string;
  name: string;
  kindLabel: string;
  typeLabel: string;
  lender: string | null;
  emiAmount: number;
  tenureMonths: number;
  paidCount: number;
  remainingCount: number;
  totalPayable: number;
  paidAmount: number;
  remainingAmount: number;
  nextDueMillis: number | null;
  nextInstallmentIndex: number | null;
  lastPaidMillis: number | null;
  status: 'overdue' | 'pending' | 'on_track' | 'completed';
  /** Current calendar-month EMI cycle */
  hasCurrentMonthEmi: boolean;
  currentMonthPaid: boolean;
  currentMonthDueMillis: number | null;
  currentMonthPaidMillis: number | null;
  currentMonthAmount: number;
  currentMonthOverdue: boolean;
  currentMonthInstallmentIndex: number | null;
};

export function getLoanEmiSummary(liability: Liability, now = Date.now()): LoanEmiSummary {
  const schedule = normalizeInstallments(mergeLiabilitySchedule(liability), now);
  const emi = getEffectiveLoanEmi(liability);
  const tenure = liability.tenureMonths ?? 0;
  const paidInstallments = schedule.filter((i) => i.isPaymentDone);
  const paidCount = paidInstallments.length;
  const nextUnpaid = schedule.find((i) => !i.isPaymentDone && !i.isDue) ?? null;
  const lastPaid = paidInstallments
    .filter((i) => i.paymentDateMillis)
    .sort((a, b) => (b.paymentDateMillis ?? 0) - (a.paymentDateMillis ?? 0))[0];

  let status: LoanEmiSummary['status'] = 'completed';
  if (paidCount < tenure) {
    const hasOverdue = schedule.some((i) => !i.isPaymentDone && i.isOverdue);
    status = hasOverdue ? 'overdue' : nextUnpaid ? 'pending' : 'on_track';
  }

  const currentMonth = getCurrentMonthEmiStatus(liability, now);

  return {
    liabilityId: liability.id,
    name: liability.name,
    kindLabel: getLiabilityKindLabel(liability),
    typeLabel: getLiabilityTypeLabel(liability),
    lender: liability.lender ?? null,
    emiAmount: emi,
    tenureMonths: tenure,
    paidCount,
    remainingCount: Math.max(0, tenure - paidCount),
    totalPayable: getLoanTotalPayable(liability),
    paidAmount: round2(paidCount * emi),
    remainingAmount: getLoanRemainingAmount(liability),
    nextDueMillis: nextUnpaid?.dueDateMillis ?? null,
    nextInstallmentIndex: nextUnpaid?.index ?? null,
    lastPaidMillis: lastPaid?.paymentDateMillis ?? null,
    status,
    hasCurrentMonthEmi: currentMonth.hasEmi,
    currentMonthPaid: currentMonth.hasEmi && currentMonth.isPaid,
    currentMonthDueMillis: currentMonth.dueDateMillis,
    currentMonthPaidMillis: currentMonth.paymentDateMillis,
    currentMonthAmount: currentMonth.amount,
    currentMonthOverdue: currentMonth.isOverdue,
    currentMonthInstallmentIndex: currentMonth.installmentIndex,
  };
}

export function listLoanEmiSummaries(liabilities: readonly Liability[], now = Date.now()): LoanEmiSummary[] {
  return liabilities
    .filter(isLoanLiability)
    .map((liability) => getLoanEmiSummary(liability, now))
    .sort((a, b) => {
      const rank = { overdue: 0, pending: 1, on_track: 2, completed: 3 };
      const byStatus = rank[a.status] - rank[b.status];
      if (byStatus !== 0) return byStatus;
      return (a.nextDueMillis ?? Infinity) - (b.nextDueMillis ?? Infinity);
    });
}

export function summarizeLoanEmiPayments(summaries: readonly LoanEmiSummary[]) {
  const withCurrentMonth = summaries.filter((s) => s.hasCurrentMonthEmi);
  return {
    overdueCount: withCurrentMonth.filter((s) => !s.currentMonthPaid && s.currentMonthOverdue).length,
    dueCount: withCurrentMonth.filter((s) => !s.currentMonthPaid && !s.currentMonthOverdue).length,
    paidCount: withCurrentMonth.filter((s) => s.currentMonthPaid).length,
    pendingCount: summaries.filter((s) => s.status === 'pending' || s.status === 'on_track').length,
    completedCount: summaries.filter((s) => s.status === 'completed').length,
    totalRemaining: round2(summaries.reduce((sum, item) => sum + item.remainingAmount, 0)),
    monthlyEmiTotal: round2(
      summaries.filter((s) => s.remainingAmount > 0).reduce((sum, item) => sum + item.emiAmount, 0)
    ),
  };
}

export function buildLoanEmiSchedule(
  emiAmount: number,
  tenureMonths: number,
  firstEmiDueMillis: number,
  now = Date.now()
): LiabilityInstallment[] {
  const count = Math.max(1, tenureMonths);
  const baseEmi = round2(emiAmount);

  return Array.from({ length: count }, (_, i) => {
    const dueMillis = addMonthsToMillis(firstEmiDueMillis, i);
    const d = new Date(dueMillis);
    const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      index: i,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
      monthYear,
      amount: baseEmi,
      dueDateMillis: dueMillis,
      isPaymentDone: false,
      paymentDateMillis: null,
      isDue: false,
      paymentStatus: 'pending',
      isOverdue: dueMillis < startOfToday(now),
    } satisfies LiabilityInstallment;
  });
}

export function recalculateLoanSchedule(
  installments: LiabilityInstallment[],
  emiAmount: number
): LiabilityInstallment[] {
  const baseEmi = round2(emiAmount);
  return installments.map((inst) => {
    if (inst.isPaymentDone) return inst;
    if (inst.isDue) return { ...inst, amount: 0 };
    return { ...inst, amount: baseEmi };
  });
}

function sameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function installmentDueMillis(
  finalDueDateMillis: number,
  installmentIndex: number,
  installmentCount: number,
  monthStep: number
): number {
  const monthsBack = (installmentCount - 1 - installmentIndex) * monthStep;
  return subtractMonthsFromMillis(finalDueDateMillis, monthsBack);
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

export function parsePaymentHistory(json?: string | null): LiabilityPaymentRecord[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializePaymentHistory(records: LiabilityPaymentRecord[]): string {
  return JSON.stringify(records);
}

export function getFinancialYearLabel(dueDateMillis: number): string {
  const d = new Date(dueDateMillis);
  return `FY ${d.getFullYear()}-${String(d.getFullYear() + 1).slice(-2)}`;
}

export function advanceDueDateByFrequency(dueDateMillis: number, frequency: string): number {
  const d = new Date(dueDateMillis);
  switch (frequency) {
    case 'HALF_YEARLY':
      d.setMonth(d.getMonth() + 6);
      break;
    case 'QUARTERLY':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'MONTHLY':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'YEARLY':
    default:
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.getTime();
}

export function getPaymentHistorySummary(liability: Liability): {
  count: number;
  totalPaid: number;
  records: LiabilityPaymentRecord[];
} {
  const records = parsePaymentHistory(liability.paymentHistoryJson).sort(
    (a, b) => b.paymentDateMillis - a.paymentDateMillis
  );
  const totalPaid = records.reduce((sum, record) => sum + record.amount, 0);
  return { count: records.length, totalPaid: round2(totalPaid), records };
}

/** Record payment for the current cycle and reopen the liability for the next period. */
export function completeLiabilityPayment(
  liability: Liability,
  paymentDateMillis: number
): Liability {
  const history = parsePaymentHistory(liability.paymentHistoryJson);
  history.push({
    id: `${Date.now()}-${history.length}`,
    dueDateMillis: liability.dueDateMillis,
    paymentDateMillis,
    amount: liability.amount,
    financialYearLabel: getFinancialYearLabel(liability.dueDateMillis),
  });

  const nextDueDateMillis = advanceDueDateByFrequency(liability.dueDateMillis, liability.frequency);
  const nextSchedule = buildSchedule(liability.amount, liability.frequency, nextDueDateMillis);

  return {
    ...liability,
    dueDateMillis: nextDueDateMillis,
    paymentDateMillis: null,
    isPaid: false,
    paymentHistoryJson: serializePaymentHistory(history),
    paymentScheduleJson: serializeInstallments(nextSchedule),
  };
}

export function shouldRecordPayment(
  previous: Liability | null,
  paymentDateMillis: number | null | undefined
): paymentDateMillis is number {
  return paymentDateMillis != null && paymentDateMillis !== previous?.paymentDateMillis;
}

export function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isInstallmentPaid(inst: Pick<LiabilityInstallment, 'isPaymentDone' | 'paymentStatus' | 'paymentDateMillis'>): boolean {
  return (
    Boolean(inst.isPaymentDone) ||
    inst.paymentStatus === 'done' ||
    (inst.paymentDateMillis != null && inst.paymentDateMillis > 0)
  );
}

export function normalizeInstallment(
  inst: LiabilityInstallment,
  now = Date.now()
): LiabilityInstallment {
  const isDone = isInstallmentPaid(inst);
  const paymentStatus: 'pending' | 'done' = isDone ? 'done' : 'pending';
  const isOverdue = !isDone && inst.dueDateMillis < startOfToday(now);
  return {
    ...inst,
    isPaymentDone: isDone,
    paymentStatus,
    isOverdue,
  };
}

export function normalizeInstallments(
  installments: LiabilityInstallment[],
  now = Date.now()
): LiabilityInstallment[] {
  return installments.map((inst) => normalizeInstallment(inst, now));
}

export function installmentsNeedStatusSync(
  existing: LiabilityInstallment[],
  normalized: LiabilityInstallment[]
): boolean {
  return normalized.some((inst, index) => {
    const prev = existing[index];
    if (!prev) return true;
    return (
      inst.paymentStatus !== prev.paymentStatus ||
      Boolean(inst.isOverdue) !== Boolean(prev.isOverdue)
    );
  });
}

/** Mark overdue unpaid installments as pending and persist payment status in the schedule JSON. */
export function syncLiabilityPaymentStatuses(
  liability: Liability,
  now = Date.now()
): { liability: Liability; changed: boolean } {
  const existing = parseInstallments(liability.paymentScheduleJson ?? '');
  if (!existing.length) return { liability, changed: false };

  const normalized = normalizeInstallments(existing, now);
  const changed = installmentsNeedStatusSync(existing, normalized);
  if (!changed) return { liability, changed: false };

  return {
    liability: {
      ...liability,
      paymentScheduleJson: serializeInstallments(normalized),
    },
    changed: true,
  };
}

export function syncAllLiabilityPaymentStatuses(
  liabilities: readonly Liability[],
  now = Date.now()
): { liabilities: Liability[]; changed: Liability[] } {
  const next = liabilities.map((liability) => syncLiabilityPaymentStatuses(liability, now).liability);
  const changed = liabilities
    .map((liability, index) => ({ original: liability, synced: next[index] }))
    .filter(({ original, synced }) => original.paymentScheduleJson !== synced.paymentScheduleJson)
    .map(({ synced }) => synced);
  return { liabilities: next, changed };
}

export type LiabilityInstallmentSummary = {
  pendingCount: number;
  overdueCount: number;
  doneCount: number;
  totalUnpaidCount: number;
};

export function computeLiabilityInstallmentSummary(
  liabilities: readonly Liability[],
  now = Date.now()
): LiabilityInstallmentSummary {
  let pendingCount = 0;
  let overdueCount = 0;
  let doneCount = 0;

  for (const liability of liabilities) {
    const schedule = normalizeInstallments(mergeLiabilitySchedule(liability), now);
    for (const inst of schedule) {
      if (isInstallmentPaid(inst)) {
        doneCount += 1;
      } else if (inst.isOverdue) {
        overdueCount += 1;
      } else {
        pendingCount += 1;
      }
    }
  }

  return {
    pendingCount,
    overdueCount,
    doneCount,
    totalUnpaidCount: pendingCount + overdueCount,
  };
}

export function buildSchedule(
  totalAmount: number,
  frequency: string,
  dueDateMillis: number
): LiabilityInstallment[] {
  const count = getInstallmentCount(frequency);
  const monthStep = getInstallmentMonthStep(frequency);
  const share = totalAmount / count;
  const now = Date.now();

  return Array.from({ length: count }, (_, i) => {
    const dueMillis = installmentDueMillis(dueDateMillis, i, count, monthStep);
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
      paymentStatus: 'pending',
      isOverdue: dueMillis < startOfToday(now),
    } satisfies LiabilityInstallment;
  });
}

function scheduleUsesCalendarDueDates(
  installments: LiabilityInstallment[],
  frequency: string,
  dueDateMillis: number
): boolean {
  const count = getInstallmentCount(frequency);
  const monthStep = getInstallmentMonthStep(frequency);
  if (installments.length !== count) return false;

  return installments.every((inst, i) =>
    sameCalendarDay(
      inst.dueDateMillis,
      installmentDueMillis(dueDateMillis, i, count, monthStep)
    )
  );
}

function rebaseInstallmentDates(
  installments: LiabilityInstallment[],
  frequency: string,
  dueDateMillis: number,
  totalAmount: number
): LiabilityInstallment[] {
  const fresh = buildSchedule(totalAmount, frequency, dueDateMillis);
  const rebased = installments.map((inst, i) => {
    const next = fresh[i];
    if (!next) return inst;
    return {
      ...next,
      isPaymentDone: inst.isPaymentDone,
      paymentDateMillis: inst.paymentDateMillis,
      isDue: inst.isDue,
      amount: inst.amount,
    };
  });
  return normalizeInstallments(recalculateSchedule(rebased, totalAmount));
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

  if (isLoanLiability(liability)) {
    const emiAmount = getEffectiveLoanEmi(liability);
    const tenureMonths = liability.tenureMonths ?? 0;
    const expectedCount = getExpectedInstallmentCount(liability);
    const totalPayable = getLoanTotalPayable(liability);

    if (!existing.length || existing.length !== expectedCount || emiAmount <= 0) {
      return buildLoanEmiSchedule(emiAmount, tenureMonths, liability.dueDateMillis);
    }

    const unpaidSum = existing
      .filter((i) => !i.isPaymentDone)
      .reduce((s, i) => s + i.amount, 0);
    const paidSum = existing
      .filter((i) => i.isPaymentDone)
      .reduce((s, i) => s + i.amount, 0);

    if (Math.abs(paidSum + unpaidSum - totalPayable) > 0.5) {
      return normalizeInstallments(recalculateLoanSchedule(existing, emiAmount));
    }

    return normalizeInstallments(existing);
  }

  const expectedCount = getInstallmentCount(liability.frequency);

  if (!existing.length || existing.length !== expectedCount) {
    return buildSchedule(liability.amount, liability.frequency, liability.dueDateMillis);
  }

  if (
    !scheduleUsesCalendarDueDates(existing, liability.frequency, liability.dueDateMillis)
  ) {
    return rebaseInstallmentDates(
      existing,
      liability.frequency,
      liability.dueDateMillis,
      liability.amount
    );
  }

  const unpaidSum = existing
    .filter((i) => !i.isPaymentDone)
    .reduce((s, i) => s + i.amount, 0);
  const paidSum = existing
    .filter((i) => i.isPaymentDone)
    .reduce((s, i) => s + i.amount, 0);

  if (Math.abs(paidSum + unpaidSum - liability.amount) > 0.5) {
    return normalizeInstallments(recalculateSchedule(existing, liability.amount));
  }

  return normalizeInstallments(existing);
}

export type MonthlyLiabilityBucket = {
  monthYear: string;
  label: string;
  dueDateMillis: number;
  total: number;
  pendingTotal: number;
  doneTotal: number;
  status: 'overdue' | 'pending' | 'done';
  installmentCount: number;
  pendingCount: number;
  doneCount: number;
  overdueCount: number;
};

export type MonthlyLiabilityItemDetail = {
  liabilityId: string;
  liabilityName: string;
  installmentIndex: number;
  amount: number;
  dueDateMillis: number;
  status: 'overdue' | 'pending' | 'done';
  paymentDateMillis: number | null;
  kindLabel: string;
  typeLabel: string;
  /** True when this row comes from payment history (annual cycle), not an open schedule row. */
  fromHistory?: boolean;
};

function monthYearFromMillis(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromMillis(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function getMonthlyLiabilityDetails(
  liabilities: readonly Liability[],
  monthYear: string,
  now = Date.now()
): MonthlyLiabilityItemDetail[] {
  const items: MonthlyLiabilityItemDetail[] = [];

  for (const liability of liabilities) {
    const schedule = normalizeInstallments(mergeLiabilitySchedule(liability), now);
    const coveredKeys = new Set<string>();

    schedule.forEach((inst, installmentIndex) => {
      if (inst.monthYear !== monthYear) return;
      const isDone = isInstallmentPaid(inst);
      coveredKeys.add(`${liability.id}:${inst.monthYear}:${inst.dueDateMillis}`);
      items.push({
        liabilityId: liability.id,
        liabilityName: liability.name,
        installmentIndex,
        amount: inst.amount,
        dueDateMillis: inst.dueDateMillis,
        status: isDone ? 'done' : inst.isOverdue ? 'overdue' : 'pending',
        paymentDateMillis: inst.paymentDateMillis,
        kindLabel: getLiabilityKindLabel(liability),
        typeLabel: getLiabilityTypeLabel(liability),
      });
    });

    // Annual form payments live in history after the schedule advances — still show them as Done.
    if (!isLoanLiability(liability)) {
      for (const record of parsePaymentHistory(liability.paymentHistoryJson)) {
        const recordMonth = monthYearFromMillis(record.dueDateMillis);
        if (recordMonth !== monthYear) continue;
        const key = `${liability.id}:${recordMonth}:${record.dueDateMillis}`;
        if (coveredKeys.has(key)) continue;
        coveredKeys.add(key);
        items.push({
          liabilityId: liability.id,
          liabilityName: liability.name,
          installmentIndex: -1,
          amount: record.amount,
          dueDateMillis: record.dueDateMillis,
          status: 'done',
          paymentDateMillis: record.paymentDateMillis,
          kindLabel: getLiabilityKindLabel(liability),
          typeLabel: getLiabilityTypeLabel(liability),
          fromHistory: true,
        });
      }
    }
  }

  return items.sort((a, b) => {
    const rank = { overdue: 0, pending: 1, done: 2 };
    const byStatus = rank[a.status] - rank[b.status];
    if (byStatus !== 0) return byStatus;
    return a.dueDateMillis - b.dueDateMillis;
  });
}

export function settleInstallmentOnLiability(
  liability: Liability,
  installmentIndex: number,
  paymentDateMillis = Date.now()
): Liability {
  const schedule = mergeLiabilitySchedule(liability);
  const totalAmount = isLoanLiability(liability)
    ? getLoanTotalPayable(liability)
    : liability.amount;
  const updated = updateInstallment(
    schedule,
    installmentIndex,
    { isPaymentDone: true, paymentDateMillis },
    totalAmount,
    isLoanLiability(liability) ? { loanEmiAmount: getEffectiveLoanEmi(liability) } : undefined
  );
  return {
    ...liability,
    paymentScheduleJson: serializeInstallments(updated),
  };
}

/** Group manage-plan installments by month with pending/done status. */
export function computeMonthlyLiabilityTotals(liabilities: readonly Liability[]): MonthlyLiabilityBucket[] {
  const map = new Map<string, MonthlyLiabilityBucket>();

  const touch = (
    monthYear: string,
    label: string,
    dueDateMillis: number,
    amount: number,
    isDone: boolean,
    isOverdue: boolean
  ) => {
    const existing = map.get(monthYear);
    if (existing) {
      if (isDone) {
        existing.doneTotal = round2(existing.doneTotal + amount);
        existing.doneCount += 1;
      } else {
        existing.pendingTotal = round2(existing.pendingTotal + amount);
        existing.pendingCount += 1;
        if (isOverdue) existing.overdueCount += 1;
      }
      existing.installmentCount += 1;
      existing.dueDateMillis = Math.min(existing.dueDateMillis, dueDateMillis);
      return;
    }
    map.set(monthYear, {
      monthYear,
      label,
      dueDateMillis,
      pendingTotal: isDone ? 0 : round2(amount),
      doneTotal: isDone ? round2(amount) : 0,
      total: round2(amount),
      status: isDone ? 'done' : 'pending',
      installmentCount: 1,
      pendingCount: isDone ? 0 : 1,
      doneCount: isDone ? 1 : 0,
      overdueCount: !isDone && isOverdue ? 1 : 0,
    });
  };

  for (const liability of liabilities) {
    const schedule = normalizeInstallments(mergeLiabilitySchedule(liability));
    const covered = new Set<string>();

    for (const inst of schedule) {
      const isDone = isInstallmentPaid(inst);
      covered.add(`${liability.id}:${inst.monthYear}:${inst.dueDateMillis}`);
      touch(inst.monthYear, inst.label, inst.dueDateMillis, inst.amount, isDone, Boolean(inst.isOverdue));
    }

    if (!isLoanLiability(liability)) {
      for (const record of parsePaymentHistory(liability.paymentHistoryJson)) {
        const monthYear = monthYearFromMillis(record.dueDateMillis);
        const key = `${liability.id}:${monthYear}:${record.dueDateMillis}`;
        if (covered.has(key)) continue;
        covered.add(key);
        touch(
          monthYear,
          monthLabelFromMillis(record.dueDateMillis),
          record.dueDateMillis,
          record.amount,
          true,
          false
        );
      }
    }
  }

  return Array.from(map.values())
    .map((bucket) => {
      const status: MonthlyLiabilityBucket['status'] =
        bucket.overdueCount > 0 ? 'overdue' : bucket.pendingCount > 0 ? 'pending' : 'done';
      return {
        ...bucket,
        status,
        total: bucket.pendingCount > 0 ? bucket.pendingTotal : bucket.doneTotal,
      };
    })
    .sort((a, b) => a.dueDateMillis - b.dueDateMillis);
}

export function getNextUnpaidInstallment(liability: Liability): LiabilityInstallment | null {
  const schedule = mergeLiabilitySchedule(liability);
  return schedule.find((inst) => !inst.isPaymentDone && !inst.isDue) ?? null;
}

export type CurrentMonthEmiStatus = {
  hasEmi: boolean;
  isPaid: boolean;
  dueDateMillis: number | null;
  paymentDateMillis: number | null;
  amount: number;
  installmentIndex: number | null;
  isOverdue: boolean;
};

/** Current calendar-month EMI row for bank / credit-card loans. */
export function getCurrentMonthEmiStatus(liability: Liability, now = Date.now()): CurrentMonthEmiStatus {
  const empty: CurrentMonthEmiStatus = {
    hasEmi: false,
    isPaid: false,
    dueDateMillis: null,
    paymentDateMillis: null,
    amount: 0,
    installmentIndex: null,
    isOverdue: false,
  };

  if (!isLoanLiability(liability)) return empty;

  const schedule = normalizeInstallments(mergeLiabilitySchedule(liability), now);
  const today = new Date(now);
  const y = today.getFullYear();
  const m = today.getMonth();
  const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;

  let inst =
    schedule.find((i) => i.monthYear === monthKey) ??
    schedule.find((i) => {
      const d = new Date(i.dueDateMillis);
      return d.getFullYear() === y && d.getMonth() === m;
    });

  if (!inst) {
    const paidThisMonth = schedule
      .filter((i) => i.isPaymentDone && i.paymentDateMillis)
      .filter((i) => {
        const paid = new Date(i.paymentDateMillis!);
        return paid.getFullYear() === y && paid.getMonth() === m;
      })
      .sort((a, b) => (b.paymentDateMillis ?? 0) - (a.paymentDateMillis ?? 0))[0];
    if (!paidThisMonth) return empty;
    inst = paidThisMonth;
  }

  if (inst.isPaymentDone) {
    return {
      hasEmi: true,
      isPaid: true,
      dueDateMillis: inst.dueDateMillis,
      paymentDateMillis: inst.paymentDateMillis,
      amount: inst.amount,
      installmentIndex: inst.index,
      isOverdue: false,
    };
  }

  return {
    hasEmi: true,
    isPaid: false,
    dueDateMillis: inst.dueDateMillis,
    paymentDateMillis: null,
    amount: inst.amount,
    installmentIndex: inst.index,
    isOverdue: Boolean(inst.isOverdue),
  };
}

/** Paid badge for planner list rows (bottom-right). */
export function getLiabilityListPaidBadge(
  liability: Liability,
  now = Date.now()
): { isPaid: boolean; paymentDateMillis: number | null } {
  const schedule = mergeLiabilitySchedule(liability);
  const today = new Date(now);
  const y = today.getFullYear();
  const m = today.getMonth();

  const paidThisMonth = schedule
    .filter((inst) => {
      if (!inst.isPaymentDone || !inst.paymentDateMillis) return false;
      const due = new Date(inst.dueDateMillis);
      const paid = new Date(inst.paymentDateMillis);
      return (
        (due.getFullYear() === y && due.getMonth() === m) ||
        (paid.getFullYear() === y && paid.getMonth() === m)
      );
    })
    .sort((a, b) => (b.paymentDateMillis ?? 0) - (a.paymentDateMillis ?? 0));

  if (paidThisMonth.length > 0) {
    return { isPaid: true, paymentDateMillis: paidThisMonth[0].paymentDateMillis ?? null };
  }

  if (isLoanLiability(liability)) {
    const emi = getCurrentMonthEmiStatus(liability, now);
    if (emi.hasEmi && emi.isPaid) {
      return { isPaid: true, paymentDateMillis: emi.paymentDateMillis };
    }
    return { isPaid: false, paymentDateMillis: null };
  }

  const history = getPaymentHistorySummary(liability);
  const last = history.records[0];
  if (last) {
    const paid = new Date(last.paymentDateMillis);
    const withinRecent =
      (paid.getFullYear() === y && paid.getMonth() === m) ||
      now - last.paymentDateMillis < 45 * 86_400_000;
    if (withinRecent) {
      return { isPaid: true, paymentDateMillis: last.paymentDateMillis };
    }
  }

  if (liability.isPaid && liability.paymentDateMillis) {
    return { isPaid: true, paymentDateMillis: liability.paymentDateMillis };
  }

  return { isPaid: false, paymentDateMillis: null };
}

export function getLiabilityRemainingAmount(liability: Liability): number {
  if (liability.isPaid) return 0;
  if (isLoanLiability(liability)) {
    return getLoanRemainingAmount(liability);
  }
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
  totalAmount: number,
  options?: { loanEmiAmount?: number }
): LiabilityInstallment[] {
  const next = installments.map((inst, i) => {
    if (i !== index) return inst;
    const updated = { ...inst, ...patch };
    if (patch.isPaymentDone && !updated.paymentDateMillis) {
      updated.paymentDateMillis = Date.now();
    }
    if (patch.isPaymentDone) {
      updated.isDue = false;
      updated.paymentStatus = 'done';
      updated.isOverdue = false;
    } else if (patch.isPaymentDone === false) {
      updated.paymentStatus = 'pending';
    }
    return normalizeInstallment(updated);
  });
  const recalced =
    options?.loanEmiAmount != null
      ? recalculateLoanSchedule(next, options.loanEmiAmount)
      : recalculateSchedule(next, totalAmount);
  return normalizeInstallments(recalced);
}

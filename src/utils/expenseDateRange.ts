const DAY_MS = 86_400_000;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type DailyTrendPoint = {
  key: string;
  day: string;
  dateLabel: string;
  dayStart: number;
  total: number;
};

function localDateKey(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Last 7 calendar days (oldest → today), bucketed at local midnight. */
export function getLastSevenDaysTrend(
  expenses: readonly { dateMillis: number; amount: number }[],
  now = Date.now()
): DailyTrendPoint[] {
  const todayStart = startOfDay(now);
  const points: DailyTrendPoint[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const dayStart = todayStart - offset * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const d = new Date(dayStart);
    const total = expenses
      .filter((e) => e.dateMillis >= dayStart && e.dateMillis < dayEnd)
      .reduce((sum, e) => sum + e.amount, 0);

    points.push({
      key: localDateKey(dayStart),
      day: DAY_LABELS[d.getDay()],
      dateLabel: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      dayStart,
      total,
    });
  }

  return points;
}

export const EXPENSE_TIME_PERIODS = [
  { key: 'month', label: 'This month', shortLabel: 'Month', days: null },
  { key: '7d', label: '7 days', shortLabel: '7d', days: 7 },
  { key: '30d', label: '30 days', shortLabel: '30d', days: 30 },
  { key: '60d', label: '60 days', shortLabel: '60d', days: 60 },
  { key: '90d', label: '90 days', shortLabel: '90d', days: 90 },
  { key: '6m', label: '6 months', shortLabel: '6mo', days: 180 },
  { key: '1y', label: '1 year', shortLabel: '1y', days: 365 },
  { key: 'custom', label: 'Custom', shortLabel: 'Custom', days: null },
] as const;

export type ExpenseTimePeriodKey = (typeof EXPENSE_TIME_PERIODS)[number]['key'];

export type ExpenseDateRange = {
  start: number;
  end: number;
  label: string;
};

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function calendarMonthBounds(year: number, month: number): { start: number; endExclusive: number } {
  const start = new Date(year, month, 1).getTime();
  const endExclusive = new Date(year, month + 1, 1).getTime();
  return { start, endExclusive };
}

export function isExpenseInRange(dateMillis: number, range: ExpenseDateRange): boolean {
  return dateMillis >= range.start && dateMillis <= range.end;
}

export function sumExpensesInRange(
  expenses: readonly { dateMillis: number; amount: number }[],
  range: ExpenseDateRange
): number {
  return expenses
    .filter((e) => isExpenseInRange(e.dateMillis, range))
    .reduce((sum, e) => sum + e.amount, 0);
}

/** Current calendar month expense range and total. */
export function getCurrentMonthExpenseRange(now = Date.now()): ExpenseDateRange {
  const today = new Date(now);
  const { start, endExclusive } = calendarMonthBounds(today.getFullYear(), today.getMonth());
  const label = today.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return { start, end: endExclusive - 1, label };
}

export function getCurrentMonthExpenseTotal(
  expenses: readonly { dateMillis: number; amount: number }[],
  now = Date.now()
): number {
  return sumExpensesInRange(expenses, getCurrentMonthExpenseRange(now));
}

/** Previous calendar month, or rolling 30 days when the month gap is too large or data is sparse. */
export function getLastMonthExpenseSummary(
  expenses: readonly { dateMillis: number; amount: number }[],
  now = Date.now()
): { total: number; hint: string } {
  const today = new Date(now);
  const prevMonthIndex = today.getMonth() - 1;
  const prevYear = prevMonthIndex < 0 ? today.getFullYear() - 1 : today.getFullYear();
  const normalizedMonth = prevMonthIndex < 0 ? 11 : prevMonthIndex;

  const { start: calStart, endExclusive: calEnd } = calendarMonthBounds(prevYear, normalizedMonth);
  const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const daysIntoCurrentMonth = Math.floor((now - startOfCurrentMonth) / DAY_MS);
  const monthLabel = new Date(prevYear, normalizedMonth, 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  });

  const calendarRange: ExpenseDateRange = {
    start: calStart,
    end: calEnd - 1,
    label: monthLabel,
  };

  const calendarExpenses = expenses.filter(
    (e) => e.dateMillis >= calStart && e.dateMillis < calEnd
  );
  const calendarTotal = calendarExpenses.reduce((sum, e) => sum + e.amount, 0);
  const newestCalendar = calendarExpenses.length
    ? Math.max(...calendarExpenses.map((e) => e.dateMillis))
    : null;
  const dataGapDays = newestCalendar ? (now - newestCalendar) / DAY_MS : Number.POSITIVE_INFINITY;

  const GAP_FROM_MONTH_END_THRESHOLD = 20;
  const DATA_GAP_THRESHOLD = 31;
  const shouldUseRolling =
    daysIntoCurrentMonth > GAP_FROM_MONTH_END_THRESHOLD ||
    calendarTotal === 0 ||
    dataGapDays > DATA_GAP_THRESHOLD;

  if (!shouldUseRolling) {
    return { total: calendarTotal, hint: monthLabel };
  }

  const rollingRange: ExpenseDateRange = {
    start: now - 30 * DAY_MS,
    end: now,
    label: 'last 30 days',
  };

  return {
    total: sumExpensesInRange(expenses, rollingRange),
    hint: 'last 30 days',
  };
}

export function getExpenseRangeForPeriod(
  period: ExpenseTimePeriodKey,
  customStart: number,
  customEnd: number,
  now = Date.now()
): ExpenseDateRange {
  if (period === 'month') {
    return getCurrentMonthExpenseRange(now);
  }

  if (period === 'custom') {
    const start = startOfDay(Math.min(customStart, customEnd));
    const end = endOfDay(Math.max(customStart, customEnd));
    const startLabel = new Date(start).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    const endLabel = new Date(end).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    return {
      start,
      end,
      label: `${startLabel} – ${endLabel}`,
    };
  }

  const preset = EXPENSE_TIME_PERIODS.find((p) => p.key === period) ?? EXPENSE_TIME_PERIODS[1];
  return {
    start: now - (preset.days ?? 30) * DAY_MS,
    end: now,
    label: preset.label,
  };
}

export function getPeriodMeta(period: ExpenseTimePeriodKey) {
  return EXPENSE_TIME_PERIODS.find((p) => p.key === period) ?? EXPENSE_TIME_PERIODS[1];
}

export type MonthlySpendPoint = {
  key: string;
  month: string;
  monthIndex: number;
  year: number;
  total: number;
};

/** Jan–Dec of the calendar year containing `now`, with expense totals per month. */
export function getAnnualMonthlySpendTrend(
  expenses: readonly { dateMillis: number; amount: number }[],
  now = Date.now()
): MonthlySpendPoint[] {
  const year = new Date(now).getFullYear();
  const points: MonthlySpendPoint[] = [];
  for (let month = 0; month < 12; month += 1) {
    const { start, endExclusive } = calendarMonthBounds(year, month);
    const total = expenses
      .filter((e) => e.dateMillis >= start && e.dateMillis < endExclusive)
      .reduce((sum, e) => sum + e.amount, 0);
    const labelDate = new Date(year, month, 1);
    points.push({
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      month: labelDate.toLocaleDateString('en-IN', { month: 'short' }),
      monthIndex: month,
      year,
      total,
    });
  }
  return points;
}

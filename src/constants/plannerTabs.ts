export type PlannerTab =
  | 'Loans'
  | 'CreditCards'
  | 'Liabilities'
  | 'Subscriptions'
  | 'Bills'
  | 'Templates';

export const PLANNER_TABS: readonly PlannerTab[] = [
  'Loans',
  'CreditCards',
  'Liabilities',
  'Subscriptions',
  'Bills',
  'Templates',
];

export const PLANNER_TAB_HINTS: Record<PlannerTab, string> = {
  Loans: 'Personal, home, gold, vehicle, and other bank loans with EMI schedules.',
  CreditCards: 'Credit card outstanding converted to EMI — track monthly card loan payments.',
  Liabilities: 'Large periodic obligations (insurance, tax). Not monthly services.',
  Subscriptions: 'Recurring digital services — streaming, SaaS, apps.',
  Bills: 'Fixed household bills — rent, electricity, school fees.',
  Templates: 'Reusable monthly budget presets. Apply to set category limits.',
};

export const PLANNER_TAB_LABELS: Record<PlannerTab, string> = {
  Loans: 'Loans & EMIs',
  CreditCards: 'Credit Card Loans',
  Liabilities: 'Annual Liabilities',
  Subscriptions: 'Subscriptions',
  Bills: 'Bills',
  Templates: 'Budget Templates',
};

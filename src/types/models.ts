export interface Expense {
  id: string;
  userEmail: string;
  title: string;
  amount: number;
  category: string;
  dateMillis: number;
  notes: string;
  receiptPath?: string | null;
  isSettled?: boolean;
  settlementNote?: string | null;
  settlementDateMillis?: number | null;
}

export interface Liability {
  id: string;
  userEmail: string;
  name: string;
  amount: number;
  frequency: string;
  category: string;
  dueDateMillis: number;
  isPaid: boolean;
  autoRecalculate: boolean;
}

export interface Subscription {
  id: string;
  userEmail: string;
  name: string;
  cost: number;
  billingCycle: string;
  nextPaymentMillis: number;
  category: string;
  isAlertEnabled: boolean;
  lastPaidMillis?: number | null;
}

export interface SavingGoal {
  id: string;
  userEmail: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  targetDateMillis: number;
  initialMonthlyContribution: number;
  currentRequiredMonthly: number;
  deficit: number;
  surplus: number;
  forecastText: string;
  missedMonthsCount: number;
  creationDateMillis: number;
}

export interface SplitGroup {
  id: string;
  userEmail: string;
  name: string;
  members: string[];
}

export interface GroupExpense {
  id: string;
  userEmail: string;
  groupId: string;
  title: string;
  amount: number;
  paidBy: string;
  splitType: string;
  splitsJson: string;
  dateMillis: number;
}

export interface NotificationLog {
  id: string;
  userEmail: string;
  title: string;
  message: string;
  timestamp: number;
  type: string;
}

export interface UserProfile {
  email: string;
  displayName: string;
  photoUrl?: string | null;
  monthlyIncome: number;
  baseSavingsRatePercent: number;
  alertPreference: boolean;
  designation?: string | null;
  addressLine?: string | null;
  town?: string | null;
  policeStation?: string | null;
  district?: string | null;
  pinCode?: string | null;
  state?: string | null;
  areaOfInterest?: string | null;
  splitwiseHandle?: string | null;
}

export function defaultProfileExtras(): Pick<
  UserProfile,
  | 'designation'
  | 'addressLine'
  | 'town'
  | 'policeStation'
  | 'district'
  | 'pinCode'
  | 'state'
  | 'areaOfInterest'
  | 'splitwiseHandle'
> {
  return {
    designation: null,
    addressLine: null,
    town: null,
    policeStation: null,
    district: null,
    pinCode: null,
    state: null,
    areaOfInterest: null,
    splitwiseHandle: null,
  };
}

export interface BudgetTemplate {
  id: string;
  userEmail: string;
  name: string;
  monthlyIncome: number;
  allocationsJson: string;
  savingsGoalsJson: string;
}

export interface CategoryBudget {
  id: string;
  userEmail: string;
  category: string;
  limitAmount: number;
  monthYear: string;
}

export interface DebtFlow {
  debtor: string;
  creditor: string;
  amount: number;
}

export interface ChatMessage {
  text: string;
  isUser: boolean;
}

export interface Expense {
  id: number;
  userEmail: string;
  title: string;
  amount: number;
  category: string;
  dateMillis: number;
  notes: string;
  receiptPath?: string | null;
}

export interface Liability {
  id: number;
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
  id: number;
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
  id: number;
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
  id: number;
  userEmail: string;
  name: string;
  members: string[];
}

export interface GroupExpense {
  id: number;
  userEmail: string;
  groupId: number;
  title: string;
  amount: number;
  paidBy: string;
  splitType: string;
  splitsJson: string;
  dateMillis: number;
}

export interface NotificationLog {
  id: number;
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
}

export interface BudgetTemplate {
  id: number;
  userEmail: string;
  name: string;
  monthlyIncome: number;
  allocationsJson: string;
  savingsGoalsJson: string;
}

export interface CategoryBudget {
  id: number;
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

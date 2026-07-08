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

export type LiabilityKind = 'ANNUAL' | 'LOAN' | 'CREDIT_CARD_LOAN';
export type LoanType =
  | 'PERSONAL_LOAN'
  | 'HOME_LOAN'
  | 'GOLD_LOAN'
  | 'CAR_LOAN'
  | 'BIKE_LOAN'
  | 'EDUCATION_LOAN'
  | 'BUSINESS_LOAN'
  | 'AGRICULTURE_LOAN'
  | 'VEHICLE_LOAN'
  | 'OTHER'
  | 'CREDIT_CARD';

export interface Liability {
  id: string;
  userEmail: string;
  name: string;
  amount: number;
  frequency: string;
  dueDateMillis: number;
  isPaid: boolean;
  autoRecalculate: boolean;
  paymentScheduleJson?: string;
  paymentDateMillis?: number | null;
  paymentHistoryJson?: string;
  kind?: LiabilityKind;
  loanType?: LoanType | null;
  principal?: number | null;
  emiAmount?: number | null;
  tenureMonths?: number | null;
  interestRatePercent?: number | null;
  lender?: string | null;
}

export interface LiabilityPaymentRecord {
  id: string;
  dueDateMillis: number;
  paymentDateMillis: number;
  amount: number;
  financialYearLabel: string;
}

export interface LiabilityInstallment {
  index: number;
  label: string;
  monthYear: string;
  amount: number;
  dueDateMillis: number;
  isPaymentDone: boolean;
  paymentDateMillis: number | null;
  isDue: boolean;
  paymentStatus?: 'pending' | 'done';
  isOverdue?: boolean;
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
  isActive: boolean;
  lastPaidMillis?: number | null;
  paymentHistoryJson?: string;
}

export interface Bill {
  id: string;
  userEmail: string;
  name: string;
  amount: number;
  billingCycle: string;
  nextPaymentMillis: number;
  category: string;
  isAlertEnabled: boolean;
  isActive: boolean;
  lastPaidMillis?: number | null;
  paymentHistoryJson?: string;
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

export interface ChatAttachment {
  id: string;
  uri: string;
  mimeType: string;
  name: string;
  storageUrl?: string | null;
}

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestampMillis: number;
  sessionId: string;
  attachments?: ChatAttachment[];
}

export interface ChatSession {
  id: string;
  userEmail: string;
  title: string;
  createdAtMillis: number;
  lastMessageAtMillis: number;
}

export const ADVISOR_WELCOME_TEXT =
  'Hello! I am your Expenxer Advisor. I have full context of your expenses, budgets, liabilities, and splits. How may I help you?';

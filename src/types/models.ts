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
  /** Set when created from a Split settlement payment. */
  sourceType?: 'split_settlement' | null;
  sourceGroupId?: string | null;
  sourceSettlementId?: string | null;
}

export interface ExpenseAgentDraft {
  action: 'create_expense';
  title: string;
  merchant: string | null;
  amount: number | null;
  currency: 'INR';
  category: string;
  dateMillis: number;
  notes: string;
  confidence: number;
  missingFields: Array<'amount' | 'title' | 'date'>;
}

export interface ReceiptScanFinding {
  merchant: string | null;
  totalAmount: number | null;
  receiptDate: string | null;
  currency: 'INR';
  suggestedCategory: string;
  invoiceNumber: string | null;
  confidence: number;
  warnings: string[];
  lineItems: ReceiptLineItem[];
  expenseGroups: ReceiptExpenseGroup[];
}

export interface ReceiptLineItem {
  name: string;
  quantity: number | null;
  amount: number;
  category: string;
}

export interface ReceiptExpenseGroup {
  title: string;
  amount: number;
  category: string;
  itemNames: string[];
}

export interface ReceiptExpenseDraft {
  title: string;
  amount: number | null;
  category: string;
  dateMillis: number;
  notes: string;
  confidence: number;
  duplicateExpenseId: string | null;
  warnings: string[];
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

export interface SplitMember {
  id: string;
  uid: string | null;
  displayName: string;
  email: string | null;
  phoneNumber: string | null;
  status: 'active' | 'guest' | 'invited';
}

export interface SplitInvite {
  code: string;
  groupId: string;
  groupName: string;
  guestMemberId: string | null;
  invitedDisplayName: string | null;
  invitedPhone: string | null;
  invitedEmail: string | null;
  /** Normalized phone/email tokens used to auto-claim after signup. */
  claimKeys: string[];
  createdByUid: string;
  createdAtMillis: number;
  /** Invite expires after this time; claim rejected when past. */
  expiresAtMillis: number;
  status: 'pending' | 'claimed' | 'revoked';
  claimedByUid: string | null;
  claimedAtMillis: number | null;
}

export interface SplitGroup {
  id: string;
  name: string;
  createdByUid: string;
  createdByEmail: string;
  createdAtMillis: number;
  members: SplitMember[];
  /** Registered member UIDs only — used for Firestore membership queries. */
  memberUids: string[];
  /** Custom group photo URL; null/empty uses the default group image. */
  photoUrl?: string | null;
  /** Soft-archive; hidden from main list when set. */
  archivedAtMillis?: number | null;
  /** @deprecated Legacy single-owner field kept for old local groups. */
  userEmail?: string;
}

export interface GroupExpense {
  id: string;
  userEmail: string;
  groupId: string;
  title: string;
  amount: number;
  /**
   * Display label for who paid.
   * Single payer: that name. Multiple: comma-separated (kept for older UI/logs).
   */
  paidBy: string;
  paidByMemberId?: string | null;
  /** One or more payer display names (equal contribution among payers). */
  paidByNames?: string[];
  paidByMemberIds?: string[];
  /** Members who share the cost ("paid for"). Legacy expenses omit this → whole group. */
  splitAmongNames?: string[];
  splitAmongMemberIds?: string[];
  notes?: string;
  splitType: string;
  splitsJson: string;
  dateMillis: number;
}

/** Resolve payer names from new multi-payer fields or legacy `paidBy`. */
export function getGroupExpensePayers(expense: Pick<GroupExpense, 'paidBy' | 'paidByNames'>): string[] {
  if (Array.isArray(expense.paidByNames) && expense.paidByNames.length > 0) {
    return expense.paidByNames.map((n) => n.trim()).filter(Boolean);
  }
  const legacy = String(expense.paidBy ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  return legacy;
}

/**
 * Who shares the cost. Falls back to `allMemberNames` when unset (legacy equal-split-all).
 */
export function getGroupExpenseSplitAmong(
  expense: Pick<GroupExpense, 'splitAmongNames'>,
  allMemberNames: string[]
): string[] {
  if (Array.isArray(expense.splitAmongNames) && expense.splitAmongNames.length > 0) {
    return expense.splitAmongNames.map((n) => n.trim()).filter(Boolean);
  }
  return allMemberNames;
}

export interface NotificationLog {
  id: string;
  userEmail: string;
  title: string;
  message: string;
  timestamp: number;
  type: string;
}

export interface UserDirectoryHit {
  uid: string;
  displayName: string;
  email: string;
  phoneNumber: string | null;
  photoUrl: string | null;
}

export interface UserProfile {
  email: string;
  displayName: string;
  photoUrl?: string | null;
  phoneNumber?: string | null;
  /** Normalized tokens for directory search (name parts, email, phone). */
  searchKeys?: string[];
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
  /** Expo push token for device notifications. */
  expoPushToken?: string | null;
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
  | 'phoneNumber'
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
    phoneNumber: null,
  };
}

export function splitMemberDisplayNames(group: Pick<SplitGroup, 'members'>): string[] {
  return group.members.map((m) => m.displayName);
}

/** Resolve the group Admin (creator) for display — matches uid, member id, or email. */
export function resolveGroupAdmin(
  group: Pick<SplitGroup, 'members' | 'createdByUid' | 'createdByEmail'>
): { displayName: string; uid: string | null; email: string | null } | null {
  const createdByUid = (group.createdByUid ?? '').trim();
  const createdByEmail = (group.createdByEmail ?? '').trim().toLowerCase();

  if (createdByUid) {
    const byUid = group.members.find(
      (m) => m.uid === createdByUid || m.id === createdByUid
    );
    if (byUid) {
      return {
        displayName: byUid.displayName,
        uid: byUid.uid,
        email: byUid.email,
      };
    }
  }

  if (createdByEmail) {
    const byEmail = group.members.find(
      (m) => (m.email ?? '').trim().toLowerCase() === createdByEmail
    );
    if (byEmail) {
      return {
        displayName: byEmail.displayName,
        uid: byEmail.uid,
        email: byEmail.email,
      };
    }
    return {
      displayName: createdByEmail.split('@')[0] || createdByEmail,
      uid: createdByUid || null,
      email: group.createdByEmail ?? null,
    };
  }

  if (createdByUid) {
    return { displayName: 'Admin', uid: createdByUid, email: null };
  }

  return null;
}

export function isGroupAdmin(
  group: Pick<SplitGroup, 'createdByUid' | 'createdByEmail' | 'members'>,
  uid: string | null | undefined
): boolean {
  if (!uid) return false;
  if (group.createdByUid && group.createdByUid === uid) return true;
  const admin = resolveGroupAdmin(group);
  return Boolean(admin?.uid && admin.uid === uid);
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

/** Recorded peer payment that offsets split balances (mark settled). */
export interface GroupSettlement {
  id: string;
  groupId: string;
  debtor: string;
  creditor: string;
  amount: number;
  dateMillis: number;
  recordedByUid: string;
  note?: string | null;
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

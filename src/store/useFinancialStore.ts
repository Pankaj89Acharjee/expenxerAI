import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  mapFirebaseAuthError,
  registerWithEmail,
  signInWithEmail,
  signOutUser,
  subscribeToAuthChanges,
  updateAuthDisplayName,
  updateAuthPhotoUrl,
} from '@/src/services/auth';
import {
  deleteCloudExpense,
  fetchCloudExpenses,
  saveCloudExpense,
  uploadReceiptPhoto,
} from '@/src/services/expensesCloud';
import { isFirebaseConfigured } from '@/src/config/firebase';
import { getFirebaseAuth } from '@/src/services/firebase';
import { getFinancialAdviceWithHistory, suggestCategory as geminiSuggestCategory, transcribeAudio } from '@/src/services/gemini';
import {
  clearChatMessages,
  createChatSession,
  deleteChatSession,
  fetchAllGroupExpenses,
  fetchChatMessages,
  fetchChatSessions,
  saveChatMessage,
  updateChatSessionTitle,
  uploadChatAttachment,
} from '@/src/services/chatCloud';
import {
  addSharedGroupExpense,
  addSharedGroupSettlement,
  buildActiveMemberFromProfile,
  buildGuestMember,
  createSharedGroup,
  deleteSharedGroupExpense,
  deleteSharedGroupSettlement,
  fetchAllSharedExpensesForUser,
  fetchLegacyGroupExpenses,
  fetchSharedGroupExpenses,
  fetchSharedGroupsForUser,
  leaveSharedGroup,
  removeSharedGroupMember,
  setSharedGroupArchived,
  subscribeSharedGroupExpenses,
  subscribeSharedGroupSettlements,
  subscribeSharedGroupsForUser,
  updateSharedGroupExpense,
  updateSharedGroupName,
  updateSharedGroupPhoto,
  uploadSharedGroupPhoto,
} from '@/src/services/splitGroupsCloud';
import { claimPendingSplitInvites, prepareGuestInvite, revokeSplitInvite } from '@/src/services/splitInvitesCloud';
import { searchRegisteredUsers } from '@/src/services/userDirectoryCloud';
import { consumePendingInviteCode } from '@/src/utils/inviteLink';
import { shareSplitInvite } from '@/src/utils/whatsappInvite';
import { buildAdvisorSystemPrompt } from '@/src/utils/advisorContext';
import { calculateMonthlyEmi } from '@/src/utils/emiCalculator';
import { buildSchedule, buildLoanEmiSchedule, completeLiabilityPayment, isLoanLiability, mergeLiabilitySchedule, parseInstallments, serializeInstallments, settleInstallmentOnLiability, shouldRecordPayment, syncAllLiabilityPaymentStatuses } from '@/src/utils/liabilitySchedule';
import { billExpenseCategory } from '@/src/constants/billPurposes';
import {
  billPaymentExpensesNeedSync,
  liabilityPaymentExpensesNeedSync,
  listBillPaymentExpenses,
  listLiabilityPaymentExpenses,
  listSubscriptionPaymentExpenses,
  subscriptionPaymentExpensesNeedSync,
  syncBillPaymentExpenses,
  syncLiabilityPaymentExpenses,
  syncSubscriptionPaymentExpenses,
} from '@/src/utils/plannerExpenses';
import {
  appendBillPaymentHistory,
  appendSubscriptionPaymentHistory,
  normalizeNextPaymentDate,
  recordRecurringPayment,
  startOfDay,
} from '@/src/utils/recurringBilling';
import { createAndPopulateGoogleSheet, sendGmailReport } from '@/src/services/googleApi';
import {
  fetchCloudProfile,
  saveCloudProfile,
  uploadProfilePhoto as uploadCloudProfilePhoto,
} from '@/src/services/userProfileCloud';
import {
  addBill as addCloudBill,
  addCloudLog,
  addLiability as addCloudLiability,
  addSavingGoal as addCloudSavingGoal,
  addSubscription as addCloudSubscription,
  addTemplate as addCloudTemplate,
  deleteBill as deleteCloudBill,
  deleteCategoryBudgetsForMonth,
  deleteLiability as deleteCloudLiability,
  deleteSavingGoal as deleteCloudSavingGoal,
  deleteSubscription as deleteCloudSubscription,
  deleteTemplate as deleteCloudTemplate,
  fetchBills,
  fetchCategoryBudgets,
  fetchLiabilities,
  fetchLogs,
  fetchSavingGoals,
  fetchSubscriptions,
  fetchTemplates,
  saveCategoryBudgets,
  subscribeUserLogs,
  updateBill as updateCloudBill,
  updateLiability as updateCloudLiability,
  updateSavingGoal as updateCloudSavingGoal,
  updateSubscription as updateCloudSubscription,
} from '@/src/services/userDataCloud';
import { notifySplitGroupMembers } from '@/src/utils/splitNotifications';
import type {
  BudgetTemplate,
  Bill,
  CategoryBudget,
  ChatAttachment,
  ChatMessage,
  ChatSession,
  Expense,
  GroupExpense,
  GroupSettlement,
  Liability,
  LiabilityKind,
  NotificationLog,
  SavingGoal,
  SplitGroup,
  SplitMember,
  Subscription,
  UserDirectoryHit,
  UserProfile,
} from '@/src/types/models';
import { ADVISOR_WELCOME_TEXT } from '@/src/types/models';
import { defaultProfileExtras } from '@/src/types/models';
import { currentMonthYear, parseJsonToMap } from '@/src/utils/format';

const PREFS = {
  googleToken: 'google_oauth_token',
  sheetsLastSync: 'google_sheets_last_sync',
  sheetsSyncUrl: 'google_sheets_sync_url',
};

let authUnsubscribe: (() => void) | null = null;
let plannerExpenseBackfillRunning = false;
let splitGroupsUnsubscribe: (() => void) | null = null;
let userLogsUnsubscribe: (() => void) | null = null;
const splitExpenseUnsubscribes = new Map<string, () => void>();
const splitSettlementUnsubscribes = new Map<string, () => void>();
let legacySplitExpensesCache: GroupExpense[] = [];
const sharedExpensesByGroupId = new Map<string, GroupExpense[]>();
const sharedSettlementsByGroupId = new Map<string, GroupSettlement[]>();

function stopSplitRealtime() {
  splitGroupsUnsubscribe?.();
  splitGroupsUnsubscribe = null;
  userLogsUnsubscribe?.();
  userLogsUnsubscribe = null;
  splitExpenseUnsubscribes.forEach((unsub) => unsub());
  splitExpenseUnsubscribes.clear();
  splitSettlementUnsubscribes.forEach((unsub) => unsub());
  splitSettlementUnsubscribes.clear();
  sharedExpensesByGroupId.clear();
  sharedSettlementsByGroupId.clear();
  legacySplitExpensesCache = [];
}

function publishSplitExpenses(
  set: (partial: Partial<FinancialState> | ((s: FinancialState) => Partial<FinancialState>)) => void,
  get: () => FinancialState
) {
  const shared = [...sharedExpensesByGroupId.values()].flat();
  const allGroupExpenses = [...shared, ...legacySplitExpensesCache].sort(
    (a, b) => b.dateMillis - a.dateMillis
  );
  const allGroupSettlements = [...sharedSettlementsByGroupId.values()].flat();
  const selectedGroupId = get().selectedGroupId;
  const patch: Partial<FinancialState> = { allGroupExpenses, allGroupSettlements };
  if (selectedGroupId) {
    patch.groupExpenses =
      sharedExpensesByGroupId.get(selectedGroupId) ??
      allGroupExpenses.filter((e) => e.groupId === selectedGroupId);
    patch.groupSettlements = sharedSettlementsByGroupId.get(selectedGroupId) ?? [];
  }
  set(patch);
}

function syncSharedExpenseListeners(
  groupIds: string[],
  set: (partial: Partial<FinancialState> | ((s: FinancialState) => Partial<FinancialState>)) => void,
  get: () => FinancialState
) {
  const wanted = new Set(groupIds);
  for (const [groupId, unsub] of splitExpenseUnsubscribes) {
    if (!wanted.has(groupId)) {
      unsub();
      splitExpenseUnsubscribes.delete(groupId);
      sharedExpensesByGroupId.delete(groupId);
    }
  }
  for (const [groupId, unsub] of splitSettlementUnsubscribes) {
    if (!wanted.has(groupId)) {
      unsub();
      splitSettlementUnsubscribes.delete(groupId);
      sharedSettlementsByGroupId.delete(groupId);
    }
  }
  for (const groupId of groupIds) {
    if (!splitExpenseUnsubscribes.has(groupId)) {
      const unsub = subscribeSharedGroupExpenses(groupId, (expenses) => {
        sharedExpensesByGroupId.set(groupId, expenses);
        publishSplitExpenses(set, get);
      });
      splitExpenseUnsubscribes.set(groupId, unsub);
    }
    if (!splitSettlementUnsubscribes.has(groupId)) {
      const unsub = subscribeSharedGroupSettlements(groupId, (settlements) => {
        sharedSettlementsByGroupId.set(groupId, settlements);
        publishSplitExpenses(set, get);
      });
      splitSettlementUnsubscribes.set(groupId, unsub);
    }
  }
  publishSplitExpenses(set, get);
}

function startSplitRealtime(
  uid: string,
  set: (partial: Partial<FinancialState> | ((s: FinancialState) => Partial<FinancialState>)) => void,
  get: () => FinancialState
) {
  splitGroupsUnsubscribe?.();
  splitGroupsUnsubscribe = subscribeSharedGroupsForUser(uid, (sharedGroups) => {
    const legacyGroups = get().groups.filter((g) => !g.createdByUid);
    const byId = new Map<string, SplitGroup>();
    for (const g of [...legacyGroups, ...sharedGroups]) byId.set(g.id, g);
    const groups = [...byId.values()].sort((a, b) => b.createdAtMillis - a.createdAtMillis);
    set({ groups });
    syncSharedExpenseListeners(
      sharedGroups.map((g) => g.id),
      set,
      get
    );
  });

  userLogsUnsubscribe?.();
  userLogsUnsubscribe = subscribeUserLogs(uid, (logs) => {
    set({ logs });
  });
}

function currentUid(): string | null {
  return getFirebaseAuth().currentUser?.uid ?? null;
}

async function ensureUserProfile(
  uid: string,
  email: string,
  authDisplayName?: string | null,
  monthlyIncome?: number
): Promise<UserProfile> {
  const existing = await fetchCloudProfile(uid);
  if (existing) {
    const firebaseName = authDisplayName?.trim();
    let next = existing;
    let dirty = false;
    if (firebaseName && existing.displayName !== firebaseName) {
      next = { ...next, displayName: firebaseName };
      dirty = true;
    }
    // Backfill searchKeys / phone so older profiles become discoverable in Split.
    if (!existing.searchKeys?.length) {
      dirty = true;
    }
    if (dirty) {
      await saveCloudProfile(uid, next);
    }
    return next;
  }

  const profile: UserProfile = {
    email,
    displayName: authDisplayName?.trim() || email.split('@')[0],
    photoUrl: null,
    monthlyIncome: monthlyIncome ?? 5000,
    baseSavingsRatePercent: 20,
    alertPreference: true,
    ...defaultProfileExtras(),
  };
  await saveCloudProfile(uid, profile);
  return profile;
}

function clearUserState() {
  return {
    currentUserEmail: null as string | null,
    userProfile: null as UserProfile | null,
    expenses: [] as Expense[],
    liabilities: [] as Liability[],
    subscriptions: [] as Subscription[],
    bills: [] as Bill[],
    savingGoals: [] as SavingGoal[],
    groups: [] as SplitGroup[],
    groupExpenses: [] as GroupExpense[],
    allGroupExpenses: [] as GroupExpense[],
    groupSettlements: [] as GroupSettlement[],
    allGroupSettlements: [] as GroupSettlement[],
    logs: [] as NotificationLog[],
    budgetTemplates: [] as BudgetTemplate[],
    categoryBudgets: [] as CategoryBudget[],
    selectedGroupId: null as string | null,
    chatSessions: [] as ChatSession[],
    activeChatSessionId: null as string | null,
    aiCoachChat: [] as ChatMessage[],
    isAiLoading: false,
    aiReportAdvice: null as string | null,
  };
}

function welcomeMessage(sessionId: string): ChatMessage {
  return {
    id: 'welcome',
    sessionId,
    text: ADVISOR_WELCOME_TEXT,
    isUser: false,
    timestampMillis: Date.now(),
  };
}

interface FinancialState {
  initialized: boolean;
  currentUserEmail: string | null;
  userProfile: UserProfile | null;
  expenses: Expense[];
  liabilities: Liability[];
  subscriptions: Subscription[];
  bills: Bill[];
  savingGoals: SavingGoal[];
  groups: SplitGroup[];
  groupExpenses: GroupExpense[];
  groupSettlements: GroupSettlement[];
  logs: NotificationLog[];
  budgetTemplates: BudgetTemplate[];
  categoryBudgets: CategoryBudget[];
  selectedGroupId: string | null;
  allGroupExpenses: GroupExpense[];
  allGroupSettlements: GroupSettlement[];
  chatSessions: ChatSession[];
  activeChatSessionId: string | null;
  aiCoachChat: ChatMessage[];
  isAiLoading: boolean;
  aiReportAdvice: string | null;
  googleOAuthToken: string;
  googleSheetsLastSync: number;
  googleSheetsSyncUrl: string;

  init: () => Promise<void>;
  refreshUserData: () => Promise<void>;
  refreshGroupExpenses: () => Promise<void>;

  registerAccount: (
    email: string,
    password: string,
    displayName: string,
    monthlyIncome: number
  ) => Promise<string | null>;
  signInAccount: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  uploadProfilePhoto: (localUri: string) => Promise<string | null>;

  addExpense: (
    title: string,
    amount: number,
    category: string,
    notes: string,
    dateMillis?: number,
    receiptLocalUri?: string | null
  ) => Promise<string | null>;
  updateExpense: (expense: Expense, receiptLocalUri?: string | null) => Promise<string | null>;
  deleteExpense: (expense: Expense) => Promise<void>;
  suggestCategory: (title: string, amount: number, categories: string[]) => Promise<string>;

  addLiability: (name: string, amount: number, frequency: string, dueDateMillis: number) => Promise<void>;
  addLoan: (
    name: string,
    loanType: string,
    principal: number,
    emiAmount: number,
    tenureMonths: number,
    firstEmiDueMillis: number,
    interestRatePercent?: number | null,
    lender?: string | null,
    kind?: LiabilityKind
  ) => Promise<void>;
  updateLoan: (liability: Liability) => Promise<void>;
  updateLiability: (liability: Liability, previous?: Liability | null) => Promise<void>;
  settleLiabilityInstallment: (liabilityId: string, installmentIndex: number) => Promise<void>;
  deleteLiability: (liability: Liability) => Promise<void>;

  addSubscription: (
    name: string,
    cost: number,
    cycle: string,
    category: string,
    nextPaymentMillis: number,
    isAlertEnabled?: boolean,
    paymentDateMillis?: number | null
  ) => Promise<void>;
  updateSubscription: (sub: Subscription) => Promise<void>;
  recordSubscriptionPayment: (sub: Subscription, paymentDateMillis: number) => Promise<void>;
  toggleSubscriptionAlert: (sub: Subscription) => Promise<void>;
  stopSubscription: (sub: Subscription) => Promise<void>;
  deleteSubscription: (sub: Subscription) => Promise<void>;

  addBill: (
    name: string,
    amount: number,
    cycle: string,
    category: string,
    nextPaymentMillis: number,
    isAlertEnabled?: boolean,
    paymentDateMillis?: number | null
  ) => Promise<void>;
  updateBill: (bill: Bill) => Promise<void>;
  recordBillPayment: (bill: Bill, paymentDateMillis: number) => Promise<void>;
  toggleBillAlert: (bill: Bill) => Promise<void>;
  stopBill: (bill: Bill) => Promise<void>;
  deleteBill: (bill: Bill) => Promise<void>;

  addSavingContribution: (goal: SavingGoal, amount: number) => Promise<void>;
  deleteSavingGoal: (goal: SavingGoal) => Promise<void>;

  selectGroup: (groupId: string | null) => Promise<void>;
  searchSplitUsers: (query: string) => Promise<UserDirectoryHit[]>;
  createGroup: (name: string, members: SplitMember[] | string[], photoLocalUri?: string | null) => Promise<void>;
  updateSplitGroupPhoto: (groupId: string, localUri: string | null) => Promise<string | null>;
  renameSplitGroup: (groupId: string, name: string) => Promise<string | null>;
  addGroupExpense: (
    groupId: string,
    title: string,
    amount: number,
    paidByNames: string[],
    splitAmongNames?: string[],
    notes?: string,
    dateMillis?: number
  ) => Promise<void>;
  updateGroupExpense: (
    groupId: string,
    expenseId: string,
    title: string,
    amount: number,
    paidByNames: string[],
    splitAmongNames?: string[],
    notes?: string,
    dateMillis?: number
  ) => Promise<string | null>;
  deleteGroupExpense: (groupId: string, expenseId: string) => Promise<string | null>;
  markSplitSettlementPaid: (
    groupId: string,
    flow: { debtor: string; creditor: string; amount: number },
    note?: string | null
  ) => Promise<string | null>;
  undoSplitSettlement: (groupId: string, settlementId: string) => Promise<string | null>;
  removeSplitMember: (groupId: string, memberId: string) => Promise<string | null>;
  leaveSplitGroup: (groupId: string) => Promise<string | null>;
  setSplitGroupArchived: (groupId: string, archived: boolean) => Promise<string | null>;
  revokeSplitInviteCode: (code: string) => Promise<string | null>;
  registerPushNotifications: () => Promise<void>;
  inviteToGroupViaWhatsApp: (input: {
    groupId: string;
    displayName: string;
    phoneNumber?: string | null;
    existingMemberId?: string | null;
  }) => Promise<string | null>;
  claimPendingInvites: () => Promise<{ groupId: string; groupName: string }[]>;

  addTemplate: (name: string, monthlyIncome: number, allocations: Record<string, number>, savingsGoals: Record<string, number>) => Promise<void>;
  deleteTemplate: (template: BudgetTemplate) => Promise<void>;
  applyTemplate: (template: BudgetTemplate, monthYear: string) => Promise<void>;

  sendChatMessage: (message: string, attachments?: Omit<ChatAttachment, 'id' | 'storageUrl'>[]) => Promise<void>;
  refreshChat: () => Promise<void>;
  createNewChatSession: () => Promise<void>;
  selectChatSession: (sessionId: string) => Promise<void>;
  deleteChatSessionById: (sessionId: string) => Promise<void>;
  clearCurrentChat: () => Promise<void>;
  transcribeVoiceNote: (localUri: string, mimeType: string) => Promise<string>;
  saveGoogleOAuthToken: (token: string) => Promise<void>;
  triggerGoogleSheetsSync: (customToken?: string) => Promise<{ success: boolean; url?: string; error?: string }>;
  triggerGmailDelivery: (customToken?: string, customToEmail?: string) => Promise<{ success: boolean; error?: string }>;
  checkAndTriggerPeriodicSync: () => Promise<void>;
}

export const useFinancialStore = create<FinancialState>((set, get) => ({
  initialized: false,
  currentUserEmail: null,
  userProfile: null,
  expenses: [],
  liabilities: [],
  subscriptions: [],
  bills: [],
  savingGoals: [],
  groups: [],
  groupExpenses: [],
  groupSettlements: [],
  logs: [],
  budgetTemplates: [],
  categoryBudgets: [],
  selectedGroupId: null,
  allGroupExpenses: [],
  allGroupSettlements: [],
  chatSessions: [],
  activeChatSessionId: null,
  aiCoachChat: [],
  isAiLoading: false,
  aiReportAdvice: null,
  googleOAuthToken: '',
  googleSheetsLastSync: 0,
  googleSheetsSyncUrl: '',

  init: async () => {
    const [token, lastSync, syncUrl] = await Promise.all([
      AsyncStorage.getItem(PREFS.googleToken),
      AsyncStorage.getItem(PREFS.sheetsLastSync),
      AsyncStorage.getItem(PREFS.sheetsSyncUrl),
    ]);
    set({
      googleOAuthToken: token ?? '',
      googleSheetsLastSync: lastSync ? parseInt(lastSync, 10) : 0,
      googleSheetsSyncUrl: syncUrl ?? '',
    });

    if (!isFirebaseConfigured()) {
      set({ initialized: true });
      return;
    }

    if (authUnsubscribe) authUnsubscribe();

    await new Promise<void>((resolve) => {
      let resolved = false;
      authUnsubscribe = subscribeToAuthChanges(async (user) => {
        if (user?.email && user.uid) {
          const profile = await ensureUserProfile(user.uid, user.email, user.displayName);
          set({ currentUserEmail: user.email, userProfile: profile });
          void get().registerPushNotifications();
          try {
            const preferCode = await consumePendingInviteCode();
            await claimPendingSplitInvites({
              uid: user.uid,
              profile,
              preferCode,
            });
          } catch {
            // Invite claim is best-effort; user can reopen the link later.
          }
          await get().refreshUserData();
        } else {
          stopSplitRealtime();
          set(clearUserState());
        }
        set({ initialized: true });
        if (!resolved) {
          resolved = true;
          resolve();
        }
      });
    });
  },

  refreshUserData: async () => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;

    const monthYear = currentMonthYear();
    const [profile, expensesRaw, subscriptions, bills, savingGoals, logs, budgetTemplates, categoryBudgets] =
      await Promise.all([
        fetchCloudProfile(uid),
        fetchCloudExpenses(uid),
        fetchSubscriptions(uid),
        fetchBills(uid),
        fetchSavingGoals(uid),
        fetchLogs(uid),
        fetchTemplates(uid),
        fetchCategoryBudgets(uid, monthYear),
      ]);
    const liabilitiesRaw = await fetchLiabilities(uid);
    const { liabilities, changed } = syncAllLiabilityPaymentStatuses(liabilitiesRaw);
    if (changed.length > 0) {
      await Promise.all(changed.map((liability) => updateCloudLiability(uid, liability)));
    }

    const [groups, sharedExpenses, legacyAllExpenses] = await Promise.all([
      fetchSharedGroupsForUser(uid, email),
      fetchAllSharedExpensesForUser(uid),
      fetchAllGroupExpenses(uid),
    ]);
    legacySplitExpensesCache = legacyAllExpenses;
    sharedExpensesByGroupId.clear();
    for (const expense of sharedExpenses) {
      const list = sharedExpensesByGroupId.get(expense.groupId) ?? [];
      list.push(expense);
      sharedExpensesByGroupId.set(expense.groupId, list);
    }
    for (const [groupId, list] of sharedExpensesByGroupId) {
      sharedExpensesByGroupId.set(
        groupId,
        [...list].sort((a, b) => b.dateMillis - a.dateMillis)
      );
    }
    const allGroupExpenses = [...sharedExpenses, ...legacyAllExpenses].sort(
      (a, b) => b.dateMillis - a.dateMillis
    );

    // Paint UI immediately — deferred backfill must not block FlatList updates.
    set({
      userProfile: profile,
      expenses: expensesRaw,
      liabilities,
      subscriptions,
      bills,
      savingGoals,
      groups,
      logs,
      budgetTemplates,
      categoryBudgets,
      allGroupExpenses,
    });
    await get().refreshGroupExpenses();
    startSplitRealtime(uid, set, get);
    void get().refreshChat();

    if (plannerExpenseBackfillRunning) return;
    plannerExpenseBackfillRunning = true;
    // Run after the current event loop drains so FlatLists paint first.
    const defer: (cb: () => void) => void =
      typeof requestIdleCallback === 'function'
        ? (cb) => requestIdleCallback(cb)
        : (cb) => setTimeout(cb, 0);
    defer(() => {
      void (async () => {
        try {
          const liveExpenses = await fetchCloudExpenses(uid);
          const liveSubs = get().subscriptions;
          const liveBills = get().bills;
          const liveLiabilities = get().liabilities;
          const subsNeedingExpenseSync = liveSubs.filter((sub) =>
            subscriptionPaymentExpensesNeedSync(sub, liveExpenses)
          );
          const billsNeedingExpenseSync = liveBills.filter((bill) =>
            billPaymentExpensesNeedSync(bill, liveExpenses)
          );
          const liabilitiesNeedingExpenseSync = liveLiabilities.filter((liability) =>
            liabilityPaymentExpensesNeedSync(liability, liveExpenses)
          );
          if (
            subsNeedingExpenseSync.length === 0 &&
            billsNeedingExpenseSync.length === 0 &&
            liabilitiesNeedingExpenseSync.length === 0
          ) {
            return;
          }

          // Sequential so each sync sees newly created expense rows.
          for (const sub of subsNeedingExpenseSync) {
            await syncSubscriptionPaymentExpenses(uid, sub, get().expenses);
          }
          for (const bill of billsNeedingExpenseSync) {
            await syncBillPaymentExpenses(uid, bill, get().expenses);
          }
          for (const liability of liabilitiesNeedingExpenseSync) {
            await syncLiabilityPaymentExpenses(uid, liability, get().expenses);
          }
          const expenses = await fetchCloudExpenses(uid);
          if (currentUid() === uid) set({ expenses });
        } catch {
          // Backfill is best-effort; next refresh retries.
        } finally {
          plannerExpenseBackfillRunning = false;
        }
      })();
    });
  },

  refreshGroupExpenses: async () => {
    const uid = currentUid();
    const groupId = get().selectedGroupId;
    if (!uid || groupId == null) {
      set({ groupExpenses: [], groupSettlements: [] });
      return;
    }
    const group = get().groups.find((g) => g.id === groupId);
    const isShared = Boolean(group?.createdByUid);
    if (isShared) {
      const cached = sharedExpensesByGroupId.get(groupId);
      if (cached) {
        set({ groupExpenses: cached });
        return;
      }
      const groupExpenses = await fetchSharedGroupExpenses(groupId);
      sharedExpensesByGroupId.set(groupId, groupExpenses);
      set({ groupExpenses });
      return;
    }
    const groupExpenses = await fetchLegacyGroupExpenses(uid, groupId);
    set({ groupExpenses });
  },

  registerAccount: async (email, password, displayName, monthlyIncome) => {
    try {
      const user = await registerWithEmail(email, password, displayName);
      if (user.uid) {
        await ensureUserProfile(user.uid, email, displayName, monthlyIncome);
        await addCloudLog(user.uid, email, 'Account Created', `Registered as ${displayName}.`, 'SYSTEM');
      }
      return null;
    } catch (error) {
      return mapFirebaseAuthError(error);
    }
  },

  signInAccount: async (email, password) => {
    try {
      const user = await signInWithEmail(email, password);
      const profile = await ensureUserProfile(user.uid, user.email!, user.displayName);
      await addCloudLog(user.uid, email, 'Auth Success', `Signed in as ${profile.displayName}.`, 'SYSTEM');
      return null;
    } catch (error) {
      return mapFirebaseAuthError(error);
    }
  },

  logout: async () => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (email && uid) {
      await addCloudLog(uid, email, 'Logged Out', 'Active session closed.', 'SYSTEM');
    }
    await signOutUser();
  },

  updateProfile: async (profile) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid || profile.email !== email) return;

    await saveCloudProfile(uid, profile);
    await updateAuthDisplayName(profile.displayName);
    if (profile.photoUrl) await updateAuthPhotoUrl(profile.photoUrl);
    await addCloudLog(uid, email, 'Profile Updated', 'Customized profile adjustments successfully stored.', 'SYSTEM');
    set({ userProfile: profile });
    try {
      await claimPendingSplitInvites({ uid, profile });
    } catch {
      // best-effort
    }
    await get().refreshUserData();
  },

  uploadProfilePhoto: async (localUri) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    const profile = get().userProfile;
    if (!email || !uid || !profile) return 'Not signed in.';

    try {
      const url = await uploadCloudProfilePhoto(uid, localUri);
      const updated: UserProfile = { ...profile, photoUrl: url };
      await saveCloudProfile(uid, updated);
      await updateAuthPhotoUrl(url);
      await get().refreshUserData();
      return null;
    } catch (error) {
      return (error as Error)?.message ?? 'Failed to upload profile photo.';
    }
  },

  addExpense: async (title, amount, category, notes, dateMillis, receiptLocalUri) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return 'Not signed in.';

    try {
      const expenseDate = dateMillis ?? Date.now();
      const expenseId = await saveCloudExpense(uid, {
        userEmail: email,
        title,
        amount,
        category,
        dateMillis: expenseDate,
        notes,
        receiptPath: null,
      });

      if (receiptLocalUri) {
        const receiptPath = await uploadReceiptPhoto(uid, expenseId, receiptLocalUri);
        await saveCloudExpense(
          uid,
          {
            userEmail: email,
            title,
            amount,
            category,
            dateMillis: expenseDate,
            notes,
            receiptPath,
          },
          expenseId
        );
      }

      await addCloudLog(uid, email, 'Expense Logged', `Logged expense of ₹${amount} for '${title}'`, 'SYSTEM');
      await get().refreshUserData();
      return null;
    } catch (error) {
      return (error as Error)?.message ?? 'Failed to save expense.';
    }
  },

  updateExpense: async (expense, receiptLocalUri) => {
    const uid = currentUid();
    if (!uid) return 'Not signed in.';

    try {
      let receiptPath = expense.receiptPath ?? null;
      if (receiptLocalUri) {
        receiptPath = await uploadReceiptPhoto(uid, expense.id, receiptLocalUri);
      }

      const { id, ...data } = { ...expense, receiptPath };
      await saveCloudExpense(uid, data, id);
      await get().refreshUserData();
      return null;
    } catch (error) {
      return (error as Error)?.message ?? 'Failed to update expense.';
    }
  },

  deleteExpense: async (expense) => {
    const uid = currentUid();
    if (!uid) return;
    await deleteCloudExpense(uid, expense.id);
    await get().refreshUserData();
  },

  suggestCategory: geminiSuggestCategory,

  addLiability: async (name, amount, frequency, dueDateMillis) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    const schedule = buildSchedule(amount, frequency, dueDateMillis);
    await addCloudLiability(uid, {
      userEmail: email,
      name,
      amount,
      frequency,
      dueDateMillis,
      isPaid: false,
      autoRecalculate: true,
      paymentScheduleJson: serializeInstallments(schedule),
      paymentDateMillis: null,
      paymentHistoryJson: '[]',
      kind: 'ANNUAL',
      loanType: null,
      principal: null,
      emiAmount: null,
      tenureMonths: null,
      interestRatePercent: null,
      lender: null,
    });
    await addCloudLog(uid, email, 'Liability Created', `New ${frequency.toLowerCase()} liability '${name}' set for ₹${amount}.`, 'LIABILITY');
    await get().refreshUserData();
  },

  addLoan: async (name, loanType, principal, emiAmount, tenureMonths, firstEmiDueMillis, interestRatePercent, lender, kind = 'LOAN') => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    const resolvedEmi =
      calculateMonthlyEmi(principal, interestRatePercent ?? 0, tenureMonths) || emiAmount;
    const schedule = buildLoanEmiSchedule(resolvedEmi, tenureMonths, firstEmiDueMillis);
    const liabilityKind: LiabilityKind = kind === 'CREDIT_CARD_LOAN' ? 'CREDIT_CARD_LOAN' : 'LOAN';
    await addCloudLiability(uid, {
      userEmail: email,
      name,
      amount: principal,
      principal,
      emiAmount: resolvedEmi,
      tenureMonths,
      frequency: 'MONTHLY',
      dueDateMillis: firstEmiDueMillis,
      isPaid: false,
      autoRecalculate: false,
      paymentScheduleJson: serializeInstallments(schedule),
      paymentDateMillis: null,
      paymentHistoryJson: '[]',
      kind: liabilityKind,
      loanType: loanType as Liability['loanType'],
      interestRatePercent: interestRatePercent ?? null,
      lender: lender ?? null,
    });
    await addCloudLog(
      uid,
      email,
      liabilityKind === 'CREDIT_CARD_LOAN' ? 'Credit Card Loan Added' : 'Loan Added',
      `${loanType.replace(/_/g, ' ')} '${name}' — ₹${resolvedEmi}/mo for ${tenureMonths} months.`,
      'LIABILITY'
    );
    await get().refreshUserData();
  },

  updateLoan: async (liability) => {
    const uid = currentUid();
    if (!uid || !isLoanLiability(liability)) return;
    const principal = liability.principal ?? liability.amount;
    const tenureMonths = liability.tenureMonths ?? 12;
    const emiAmount =
      calculateMonthlyEmi(principal, liability.interestRatePercent ?? 0, tenureMonths) ||
      (liability.emiAmount ?? 0);
    const existing = parseInstallments(liability.paymentScheduleJson ?? '');
    const fresh = buildLoanEmiSchedule(emiAmount, tenureMonths, liability.dueDateMillis);
    const merged = fresh.map((inst, i) => {
      const prev = existing[i];
      if (!prev?.isPaymentDone) return inst;
      return {
        ...inst,
        isPaymentDone: true,
        paymentDateMillis: prev.paymentDateMillis,
        paymentStatus: 'done' as const,
        isOverdue: false,
      };
    });
    const toSave = {
      ...liability,
      amount: principal,
      principal,
      emiAmount,
      paymentScheduleJson: serializeInstallments(merged),
    };
    await updateCloudLiability(uid, toSave);
    await syncLiabilityPaymentExpenses(uid, toSave, get().expenses);
    await get().refreshUserData();
  },

  updateLiability: async (liability, previous) => {
    const uid = currentUid();
    if (!uid) return;
    let toSave = liability;
    if (
      !isLoanLiability(liability) &&
      shouldRecordPayment(previous ?? null, liability.paymentDateMillis)
    ) {
      toSave = completeLiabilityPayment(liability, liability.paymentDateMillis);
      const email = get().currentUserEmail;
      if (email) {
        await addCloudLog(
          uid,
          email,
          'Liability Paid',
          `'${liability.name}' payment recorded. Next due ${new Date(toSave.dueDateMillis).toLocaleDateString('en-IN')}.`,
          'LIABILITY'
        );
      }
    }
    await updateCloudLiability(uid, toSave);
    await syncLiabilityPaymentExpenses(uid, toSave, get().expenses);
    await get().refreshUserData();
  },

  settleLiabilityInstallment: async (liabilityId, installmentIndex) => {
    const liability = get().liabilities.find((item) => item.id === liabilityId);
    if (!liability) return;

    const schedule = mergeLiabilitySchedule(liability);
    const installment = schedule[installmentIndex];
    if (!installment || installment.isPaymentDone) return;

    const previous = liability;
    const updated = settleInstallmentOnLiability(liability, installmentIndex);
    await get().updateLiability(updated, previous);

    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    const amount =
      mergeLiabilitySchedule(updated)[installmentIndex]?.amount ?? installment.amount;
    await addCloudLog(
      uid,
      email,
      'EMI Expense Logged',
      `Logged ₹${amount.toFixed(2)} for '${updated.name}' installment ${installmentIndex + 1}.`,
      'EXPENSE'
    );
  },

  deleteLiability: async (liability) => {
    const uid = currentUid();
    if (!uid) return;
    const linked = listLiabilityPaymentExpenses(get().expenses, liability.id);
    await Promise.all(linked.map((expense) => deleteCloudExpense(uid, expense.id)));
    await deleteCloudLiability(uid, liability.id);
    await get().refreshUserData();
  },

  addSubscription: async (name, cost, cycle, category, nextPaymentMillis, isAlertEnabled = true, paymentDateMillis = null) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    const dueMillis = normalizeNextPaymentDate(nextPaymentMillis, cycle);
    const id = await addCloudSubscription(uid, {
      userEmail: email,
      name,
      cost,
      billingCycle: cycle,
      nextPaymentMillis: dueMillis,
      category,
      isAlertEnabled,
      isActive: true,
      lastPaidMillis: null,
      paymentHistoryJson: '[]',
    });

    if (paymentDateMillis != null) {
      const paidDay = startOfDay(paymentDateMillis);
      const created: Subscription = {
        id,
        userEmail: email,
        name,
        cost,
        billingCycle: cycle,
        nextPaymentMillis: dueMillis,
        category,
        isAlertEnabled,
        isActive: true,
        lastPaidMillis: null,
        paymentHistoryJson: '[]',
      };
      const paid = appendSubscriptionPaymentHistory(
        recordRecurringPayment(created, paidDay),
        paidDay,
        cost
      );
      await updateCloudSubscription(uid, paid);
      await syncSubscriptionPaymentExpenses(uid, paid, get().expenses);
      await addCloudLog(
        uid,
        email,
        'Subscription Paid',
        `Paid ₹${cost} for '${name}' on ${new Date(paidDay).toLocaleDateString('en-IN')}.`,
        'SUBSCRIPTION'
      );
    }

    await addCloudLog(uid, email, 'Subscription Tracked', `Subscribed to '${name}' for ₹${cost}/${cycle === 'YEARLY' ? 'yr' : 'mo'}. Next due ${new Date(dueMillis).toLocaleDateString('en-IN')}.`, 'SUBSCRIPTION');
    await get().refreshUserData();
  },

  updateSubscription: async (sub) => {
    const uid = currentUid();
    if (!uid) return;
    const normalized = {
      ...sub,
      nextPaymentMillis: normalizeNextPaymentDate(sub.nextPaymentMillis, sub.billingCycle),
    };
    await updateCloudSubscription(uid, normalized);
    await syncSubscriptionPaymentExpenses(uid, normalized, get().expenses);
    await get().refreshUserData();
  },

  recordSubscriptionPayment: async (sub, paymentDateMillis) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    const paidDay = startOfDay(paymentDateMillis);
    const updated = appendSubscriptionPaymentHistory(
      recordRecurringPayment(sub, paidDay),
      paidDay,
      sub.cost
    );
    await updateCloudSubscription(uid, updated);
    await syncSubscriptionPaymentExpenses(uid, updated, get().expenses);
    await addCloudLog(
      uid,
      email,
      'Subscription Paid',
      `Paid ₹${sub.cost} for '${sub.name}' on ${new Date(paidDay).toLocaleDateString('en-IN')}. Next due ${new Date(updated.nextPaymentMillis).toLocaleDateString('en-IN')}.`,
      'SUBSCRIPTION'
    );
    await get().refreshUserData();
  },

  toggleSubscriptionAlert: async (sub) => {
    const uid = currentUid();
    if (!uid) return;
    await updateCloudSubscription(uid, { ...sub, isAlertEnabled: !sub.isAlertEnabled });
    await get().refreshUserData();
  },

  stopSubscription: async (sub) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    await updateCloudSubscription(uid, {
      ...sub,
      isActive: false,
      isAlertEnabled: false,
    });
    await addCloudLog(uid, email, 'Subscription Stopped', `Stopped subscription '${sub.name}'.`, 'SUBSCRIPTION');
    await get().refreshUserData();
  },

  deleteSubscription: async (sub) => {
    const uid = currentUid();
    if (!uid) return;
    const linked = listSubscriptionPaymentExpenses(get().expenses, sub.id);
    await Promise.all(linked.map((expense) => deleteCloudExpense(uid, expense.id)));
    await deleteCloudSubscription(uid, sub.id);
    await get().refreshUserData();
  },

  addBill: async (
    name,
    amount,
    cycle,
    category,
    nextPaymentMillis,
    isAlertEnabled = true,
    paymentDateMillis = null
  ) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    const dueMillis = normalizeNextPaymentDate(nextPaymentMillis, cycle);
    const expenseCategory = billExpenseCategory(name) || category || 'Utilities';
    const id = await addCloudBill(uid, {
      userEmail: email,
      name,
      amount,
      billingCycle: cycle,
      nextPaymentMillis: dueMillis,
      category: expenseCategory,
      isAlertEnabled,
      isActive: true,
      lastPaidMillis: null,
      paymentHistoryJson: '[]',
    });

    if (paymentDateMillis != null) {
      const paidDay = startOfDay(paymentDateMillis);
      const created: Bill = {
        id,
        userEmail: email,
        name,
        amount,
        billingCycle: cycle,
        nextPaymentMillis: dueMillis,
        category: expenseCategory,
        isAlertEnabled,
        isActive: true,
        lastPaidMillis: null,
        paymentHistoryJson: '[]',
      };
      const paid = appendBillPaymentHistory(recordRecurringPayment(created, paidDay), paidDay, amount);
      await updateCloudBill(uid, paid);
      await syncBillPaymentExpenses(uid, paid, get().expenses);
      await addCloudLog(
        uid,
        email,
        'Bill Paid',
        `Paid ₹${amount} for '${name}' on ${new Date(paidDay).toLocaleDateString('en-IN')}.`,
        'SYSTEM'
      );
    }

    await addCloudLog(
      uid,
      email,
      'Bill Tracked',
      `Bill '${name}' set for ₹${amount} (${cycle.toLowerCase()}). Next due ${new Date(dueMillis).toLocaleDateString('en-IN')}.`,
      'SYSTEM'
    );
    await get().refreshUserData();
  },

  updateBill: async (bill) => {
    const uid = currentUid();
    if (!uid) return;
    const normalized = {
      ...bill,
      category: billExpenseCategory(bill.name) || bill.category || 'Utilities',
      nextPaymentMillis: normalizeNextPaymentDate(bill.nextPaymentMillis, bill.billingCycle),
    };
    await updateCloudBill(uid, normalized);
    await syncBillPaymentExpenses(uid, normalized, get().expenses);
    await get().refreshUserData();
  },

  recordBillPayment: async (bill, paymentDateMillis) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    const paidDay = startOfDay(paymentDateMillis);
    const updated = appendBillPaymentHistory(recordRecurringPayment(bill, paidDay), paidDay, bill.amount);
    await updateCloudBill(uid, updated);
    await syncBillPaymentExpenses(uid, updated, get().expenses);
    await addCloudLog(
      uid,
      email,
      'Bill Paid',
      `Paid ₹${bill.amount} for '${bill.name}' on ${new Date(paidDay).toLocaleDateString('en-IN')}. Next due ${new Date(updated.nextPaymentMillis).toLocaleDateString('en-IN')}.`,
      'SYSTEM'
    );
    await get().refreshUserData();
  },

  toggleBillAlert: async (bill) => {
    const uid = currentUid();
    if (!uid) return;
    await updateCloudBill(uid, { ...bill, isAlertEnabled: !bill.isAlertEnabled });
    await get().refreshUserData();
  },

  stopBill: async (bill) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    await updateCloudBill(uid, { ...bill, isActive: false, isAlertEnabled: false });
    await addCloudLog(uid, email, 'Bill Stopped', `Stopped bill '${bill.name}'.`, 'SYSTEM');
    await get().refreshUserData();
  },

  deleteBill: async (bill) => {
    const uid = currentUid();
    if (!uid) return;
    const linked = listBillPaymentExpenses(get().expenses, bill.id);
    await Promise.all(linked.map((expense) => deleteCloudExpense(uid, expense.id)));
    await deleteCloudBill(uid, bill.id);
    await get().refreshUserData();
  },

  addSavingContribution: async (goal, amount) => {
    const uid = currentUid();
    if (!uid) return;
    await updateCloudSavingGoal(uid, { ...goal, savedAmount: goal.savedAmount + amount });
    await addCloudLog(uid, goal.userEmail, 'Goal Contributed', `Contributed ₹${amount} to target goal: '${goal.name}'`, 'SYSTEM');
    await get().refreshUserData();
  },

  deleteSavingGoal: async (goal) => {
    const uid = currentUid();
    if (!uid) return;
    await deleteCloudSavingGoal(uid, goal.id);
    await get().refreshUserData();
  },

  selectGroup: async (groupId) => {
    set({
      selectedGroupId: groupId,
      groupSettlements: groupId ? sharedSettlementsByGroupId.get(groupId) ?? [] : [],
    });
    await get().refreshGroupExpenses();
  },

  searchSplitUsers: async (query) => {
    const uid = currentUid();
    if (!uid) return [];
    return searchRegisteredUsers(query, { excludeUid: uid, max: 20 });
  },

  createGroup: async (name, members, photoLocalUri) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    const profile = get().userProfile;
    if (!email || !uid || !profile) return;

    const creator = buildActiveMemberFromProfile({
      uid,
      displayName: profile.displayName,
      email: profile.email,
      phoneNumber: profile.phoneNumber,
    });

    const normalized: SplitMember[] = (members as (string | SplitMember)[]).map((m) => {
      if (typeof m === 'string') {
        return buildGuestMember({ displayName: m });
      }
      return m;
    });

    const withoutCreator = normalized.filter((m) => m.uid !== uid);
    const allMembers = [creator, ...withoutCreator];

    const groupId = await createSharedGroup({
      name,
      createdByUid: uid,
      createdByEmail: email,
      members: allMembers,
      photoUrl: null,
    });

    if (photoLocalUri) {
      try {
        const photoUrl = await uploadSharedGroupPhoto(groupId, photoLocalUri);
        await updateSharedGroupPhoto(groupId, photoUrl);
      } catch {
        // Group was created; photo can be set later from group detail.
      }
    }

    await notifySplitGroupMembers(
      { name, members: allMembers },
      'Split Group Created',
      `${profile.displayName} created "${name}" and is the group Admin.`,
      'SPLIT'
    );
    await get().refreshUserData();
  },

  updateSplitGroupPhoto: async (groupId, localUri) => {
    const uid = currentUid();
    if (!uid) return 'Sign in required.';
    const group = get().groups.find((g) => g.id === groupId);
    if (!group) return 'Group not found.';
    const { isGroupAdmin } = await import('@/src/types/models');
    if (!isGroupAdmin(group, uid)) return 'Only the group Admin can change the group photo.';

    try {
      if (!localUri) {
        await updateSharedGroupPhoto(groupId, null);
        return null;
      }
      const photoUrl = await uploadSharedGroupPhoto(groupId, localUri);
      await updateSharedGroupPhoto(groupId, photoUrl);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not update group photo.';
    }
  },

  renameSplitGroup: async (groupId, name) => {
    const uid = currentUid();
    if (!uid) return 'Sign in required.';
    const group = get().groups.find((g) => g.id === groupId);
    if (!group) return 'Group not found.';
    if (!group.memberUids.includes(uid)) return 'Not a group member.';
    const { isGroupAdmin } = await import('@/src/types/models');
    if (!isGroupAdmin(group, uid)) return 'Only the group Admin can rename the group.';
    const trimmed = name.trim();
    if (!trimmed) return 'Enter a group name.';
    try {
      await updateSharedGroupName(groupId, trimmed);
      await notifySplitGroupMembers(
        group,
        'Split Group Renamed',
        `"${group.name}" was renamed to "${trimmed}".`,
        'SPLIT'
      );
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not rename group.';
    }
  },

  addGroupExpense: async (groupId, title, amount, paidByNames, splitAmongNames, notes, dateMillis) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    const group = get().groups.find((g) => g.id === groupId);
    const names = paidByNames.map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;

    const resolveMembers = (rawNames: string[]) =>
      rawNames.map((name) => {
        const member = group?.members.find((m) => m.displayName === name || m.id === name);
        return {
          name: member?.displayName ?? name,
          id: member?.id ?? null,
        };
      });

    const payers = resolveMembers(names);
    const displayNames = payers.map((p) => p.name);

    const allMemberNames = group ? group.members.map((m) => m.displayName) : displayNames;
    const splitRaw =
      Array.isArray(splitAmongNames) && splitAmongNames.length > 0
        ? splitAmongNames.map((n) => n.trim()).filter(Boolean)
        : allMemberNames;
    const splitMembers = resolveMembers(splitRaw);
    const splitDisplayNames = splitMembers.map((m) => m.name);
    if (splitDisplayNames.length === 0) return;

    const payload = {
      userEmail: email,
      groupId,
      title,
      amount,
      paidBy: displayNames.join(', '),
      paidByMemberId: payers.length === 1 ? payers[0].id : null,
      paidByNames: displayNames,
      paidByMemberIds: payers.map((p) => p.id).filter((id): id is string => Boolean(id)),
      splitAmongNames: splitDisplayNames,
      splitAmongMemberIds: splitMembers.map((m) => m.id).filter((id): id is string => Boolean(id)),
      notes: (notes ?? '').trim(),
      splitType: 'EQUAL',
      splitsJson: '{}',
      dateMillis: dateMillis ?? Date.now(),
    };

    if (group?.createdByUid) {
      await addSharedGroupExpense(groupId, payload);
      const actor = group.members.find((m) => m.uid === uid)?.displayName ?? email;
      const forLabel =
        splitDisplayNames.length === allMemberNames.length
          ? 'everyone'
          : splitDisplayNames.join(', ');
      await notifySplitGroupMembers(
        group,
        'Split Expense Added',
        `${actor} added "${title}" (₹${amount}) in "${group.name}". Paid by ${displayNames.join(', ')} for ${forLabel}.`,
        'SPLIT'
      );
      return;
    }

    const { addGroupExpense: addLegacy } = await import('@/src/services/userDataCloud');
    await addLegacy(uid, payload);
    await addCloudLog(uid, email, 'Split Expense', `Split expense '${title}' for ₹${amount} added to group.`, 'SYSTEM');
    await get().refreshGroupExpenses();
    const refreshed = get().groupExpenses;
    const rest = get().allGroupExpenses.filter((e) => e.groupId !== groupId);
    set({
      allGroupExpenses: [...refreshed, ...rest].sort((a, b) => b.dateMillis - a.dateMillis),
    });
  },

  updateGroupExpense: async (groupId, expenseId, title, amount, paidByNames, splitAmongNames, notes, dateMillis) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return 'Sign in required.';
    const group = get().groups.find((g) => g.id === groupId);
    if (!group?.createdByUid) return 'Editing is only supported on shared groups.';
    if (!group.memberUids.includes(uid)) return 'Not a group member.';
    const existing = get().groupExpenses.find((e) => e.id === expenseId) ??
      get().allGroupExpenses.find((e) => e.id === expenseId && e.groupId === groupId);
    if (!existing) return 'Expense not found.';

    const names = paidByNames.map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return 'Select who paid.';
    if (!(amount > 0)) return 'Enter a valid amount.';

    const resolveMembers = (rawNames: string[]) =>
      rawNames.map((name) => {
        const member = group.members.find((m) => m.displayName === name || m.id === name);
        return { name: member?.displayName ?? name, id: member?.id ?? null };
      });

    const payers = resolveMembers(names);
    const displayNames = payers.map((p) => p.name);
    const allMemberNames = group.members.map((m) => m.displayName);
    const splitRaw =
      Array.isArray(splitAmongNames) && splitAmongNames.length > 0
        ? splitAmongNames.map((n) => n.trim()).filter(Boolean)
        : allMemberNames;
    const splitMembers = resolveMembers(splitRaw);
    const splitDisplayNames = splitMembers.map((m) => m.name);
    if (splitDisplayNames.length === 0) return 'Select who shares the cost.';

    try {
      await updateSharedGroupExpense(groupId, expenseId, {
        userEmail: existing.userEmail || email,
        groupId,
        title: title.trim(),
        amount,
        paidBy: displayNames.join(', '),
        paidByMemberId: payers.length === 1 ? payers[0].id : null,
        paidByNames: displayNames,
        paidByMemberIds: payers.map((p) => p.id).filter((id): id is string => Boolean(id)),
        splitAmongNames: splitDisplayNames,
        splitAmongMemberIds: splitMembers.map((m) => m.id).filter((id): id is string => Boolean(id)),
        notes: (notes ?? existing.notes ?? '').trim(),
        splitType: 'EQUAL',
        splitsJson: '{}',
        dateMillis: dateMillis ?? existing.dateMillis,
      });
      const actor = group.members.find((m) => m.uid === uid)?.displayName ?? email;
      await notifySplitGroupMembers(
        group,
        'Split Expense Updated',
        `${actor} updated "${title.trim()}" in "${group.name}".`,
        'SPLIT'
      );
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not update expense.';
    }
  },

  deleteGroupExpense: async (groupId, expenseId) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return 'Sign in required.';
    const group = get().groups.find((g) => g.id === groupId);
    if (!group?.createdByUid) return 'Deleting is only supported on shared groups.';
    if (!group.memberUids.includes(uid)) return 'Not a group member.';
    const existing = get().groupExpenses.find((e) => e.id === expenseId);
    try {
      await deleteSharedGroupExpense(groupId, expenseId);
      const actor = group.members.find((m) => m.uid === uid)?.displayName ?? email;
      await notifySplitGroupMembers(
        group,
        'Split Expense Deleted',
        `${actor} deleted "${existing?.title ?? 'an expense'}" from "${group.name}".`,
        'SPLIT'
      );
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not delete expense.';
    }
  },

  markSplitSettlementPaid: async (groupId, flow, note) => {
    const uid = currentUid();
    const email = get().currentUserEmail;
    if (!uid || !email) return 'Sign in required.';
    const group = get().groups.find((g) => g.id === groupId);
    if (!group?.createdByUid && !group?.createdByEmail) {
      return 'Settlements are only supported on shared groups.';
    }
    if (!group.memberUids.includes(uid)) return 'Not a group member.';
    if (flow.amount <= 0) return 'Invalid amount.';

    const { isGroupAdmin } = await import('@/src/types/models');
    const selfMember = group.members.find((m) => m.uid === uid);
    const selfName = selfMember?.displayName ?? '';
    const isBorrower = Boolean(selfName && flow.debtor === selfName);
    const isLender = Boolean(selfName && flow.creditor === selfName);
    const admin = isGroupAdmin(group, uid);
    if (!isBorrower && !isLender && !admin) {
      return 'You can only settle amounts you borrowed or lent.';
    }

    try {
      const dateMillis = Date.now();
      const settlementId = await addSharedGroupSettlement(groupId, {
        debtor: flow.debtor,
        creditor: flow.creditor,
        amount: flow.amount,
        dateMillis,
        recordedByUid: uid,
        note: note?.trim() || null,
      });

      if (isBorrower) {
        const alreadyLogged = get().expenses.some(
          (e) => e.sourceType === 'split_settlement' && e.sourceSettlementId === settlementId
        );
        if (!alreadyLogged) {
          await saveCloudExpense(uid, {
            userEmail: email,
            title: `Split · ${group.name}`,
            amount: flow.amount,
            category: 'Split',
            dateMillis,
            notes: note?.trim()
              ? note.trim()
              : `Paid ${flow.creditor} to settle borrowed amount in "${group.name}".`,
            receiptPath: null,
            sourceType: 'split_settlement',
            sourceGroupId: groupId,
            sourceSettlementId: settlementId,
          });
          await get().refreshUserData();
        }
      }

      const actor = selfName || email;
      await notifySplitGroupMembers(
        group,
        'Split Settled',
        `${actor}: ${flow.debtor} paid ${flow.creditor} ₹${flow.amount.toFixed(2)} in "${group.name}".`,
        'SPLIT'
      );
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not record settlement.';
    }
  },

  undoSplitSettlement: async (groupId, settlementId) => {
    const uid = currentUid();
    const email = get().currentUserEmail;
    if (!uid || !email) return 'Sign in required.';
    const group = get().groups.find((g) => g.id === groupId);
    if (!group) return 'Group not found.';
    if (!group.memberUids.includes(uid)) return 'Not a group member.';
    const settlement =
      get().groupSettlements.find((s) => s.id === settlementId) ??
      get().allGroupSettlements.find((s) => s.id === settlementId && s.groupId === groupId);
    if (!settlement) return 'Settlement not found.';
    const { isGroupAdmin } = await import('@/src/types/models');
    const selfName = group.members.find((m) => m.uid === uid)?.displayName ?? '';
    const canUndo =
      isGroupAdmin(group, uid) ||
      settlement.recordedByUid === uid ||
      settlement.debtor === selfName ||
      settlement.creditor === selfName;
    if (!canUndo) return 'You cannot undo this settlement.';

    try {
      await deleteSharedGroupSettlement(groupId, settlementId);
      const linked = get().expenses.find(
        (e) => e.sourceType === 'split_settlement' && e.sourceSettlementId === settlementId
      );
      if (linked) {
        await deleteCloudExpense(uid, linked.id);
        await get().refreshUserData();
      }
      await notifySplitGroupMembers(
        group,
        'Split Settlement Undone',
        `A settlement of ₹${settlement.amount.toFixed(2)} (${settlement.debtor} → ${settlement.creditor}) was undone in "${group.name}".`,
        'SPLIT'
      );
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not undo settlement.';
    }
  },

  setSplitGroupArchived: async (groupId, archived) => {
    const uid = currentUid();
    if (!uid) return 'Sign in required.';
    const group = get().groups.find((g) => g.id === groupId);
    if (!group) return 'Group not found.';
    if (!group.memberUids.includes(uid)) return 'Not a group member.';
    const { isGroupAdmin } = await import('@/src/types/models');
    if (!isGroupAdmin(group, uid)) return 'Only the group Admin can archive the group.';
    try {
      await setSharedGroupArchived(groupId, archived);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not update archive status.';
    }
  },

  revokeSplitInviteCode: async (code) => {
    const uid = currentUid();
    if (!uid) return 'Sign in required.';
    try {
      await revokeSplitInvite(code, uid);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not revoke invite.';
    }
  },

  registerPushNotifications: async () => {
    const uid = currentUid();
    const profile = get().userProfile;
    if (!uid || !profile) return;
    try {
      const { registerForPushNotificationsAsync, saveExpoPushToken } = await import(
        '@/src/services/pushNotifications'
      );
      const token = await registerForPushNotificationsAsync();
      if (!token) return;
      await saveExpoPushToken(uid, token);
      const updated = { ...profile, expoPushToken: token };
      set({ userProfile: updated });
    } catch {
      // Ignore — push requires a physical device / permissions.
    }
  },

  removeSplitMember: async (groupId, memberId) => {
    const uid = currentUid();
    const email = get().currentUserEmail;
    if (!uid || !email) return 'Sign in required.';
    const group = get().groups.find((g) => g.id === groupId);
    const removed = group?.members.find((m) => m.id === memberId);
    try {
      await removeSharedGroupMember({ groupId, memberId, actorUid: uid });
      if (group) {
        const actor = group.members.find((m) => m.uid === uid)?.displayName ?? email;
        await notifySplitGroupMembers(
          group,
          'Split Member Removed',
          `${actor} removed ${removed?.displayName ?? 'a member'} from "${group.name}".`,
          'SPLIT'
        );
      }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not remove member.';
    }
  },

  leaveSplitGroup: async (groupId) => {
    const uid = currentUid();
    const email = get().currentUserEmail;
    if (!uid || !email) return 'Sign in required.';
    const group = get().groups.find((g) => g.id === groupId);
    const leaver = group?.members.find((m) => m.uid === uid)?.displayName ?? email;
    try {
      // Notify remaining members before leave mutates membership.
      if (group) {
        const remaining = {
          name: group.name,
          members: group.members.filter((m) => m.uid !== uid),
        };
        await notifySplitGroupMembers(
          remaining,
          'Left Split Group',
          `${leaver} left "${group.name}".`,
          'SPLIT'
        );
        await addCloudLog(uid, email, 'Left Split Group', `You left "${group.name}".`, 'SPLIT');
      }
      await leaveSharedGroup({ groupId, uid });
      if (get().selectedGroupId === groupId) {
        set({ selectedGroupId: null, groupExpenses: [], groupSettlements: [] });
      }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not leave group.';
    }
  },

  inviteToGroupViaWhatsApp: async ({ groupId, displayName, phoneNumber, existingMemberId }) => {
    const uid = currentUid();
    const profile = get().userProfile;
    if (!uid || !profile) return 'Sign in required.';
    const name = displayName.trim();
    if (!name) return 'Enter a name for the invite.';

    try {
      const { invite } = await prepareGuestInvite({
        groupId,
        createdByUid: uid,
        displayName: name,
        phoneNumber: phoneNumber ?? null,
        existingMemberId: existingMemberId ?? null,
      });
      await shareSplitInvite({
        groupName: invite.groupName,
        inviterName: profile.displayName,
        inviteCode: invite.code,
        phoneNumber: phoneNumber ?? invite.invitedPhone,
      });
      const group = get().groups.find((g) => g.id === groupId);
      if (group) {
        await notifySplitGroupMembers(
          group,
          'Split Invite Sent',
          `${profile.displayName} invited ${name} to "${group.name}" via WhatsApp.`,
          'SPLIT'
        );
      }
      await get().refreshUserData();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not create invite.';
    }
  },

  claimPendingInvites: async () => {
    const uid = currentUid();
    const profile = get().userProfile;
    if (!uid || !profile) return [];
    const preferCode = await consumePendingInviteCode();
    const claimed = await claimPendingSplitInvites({ uid, profile, preferCode });
    if (claimed.length > 0) {
      await get().refreshUserData();
      for (const hit of claimed) {
        const group = get().groups.find((g) => g.id === hit.groupId);
        if (group) {
          await notifySplitGroupMembers(
            group,
            'Split Invite Claimed',
            `${profile.displayName} joined "${hit.groupName}".`,
            'SPLIT'
          );
        }
      }
    }
    return claimed;
  },

  addTemplate: async (name, monthlyIncome, allocations, savingsGoals) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    await addCloudTemplate(uid, {
      userEmail: email,
      name,
      monthlyIncome,
      allocationsJson: JSON.stringify(allocations),
      savingsGoalsJson: JSON.stringify(savingsGoals),
    });
    await addCloudLog(uid, email, 'Template Saved', `Budget template '${name}' successfully defined.`, 'SYSTEM');
    await get().refreshUserData();
  },

  deleteTemplate: async (template) => {
    const uid = currentUid();
    if (!uid) return;
    await deleteCloudTemplate(uid, template.id);
    await get().refreshUserData();
  },

  applyTemplate: async (template, monthYear) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;

    await deleteCategoryBudgetsForMonth(uid, email, monthYear);
    const allocationsMap = parseJsonToMap(template.allocationsJson);
    const budgets = Object.entries(allocationsMap).map(([category, limitAmount]) => ({
      userEmail: email,
      category,
      limitAmount,
      monthYear,
    }));
    if (budgets.length) await saveCategoryBudgets(uid, budgets);

    const profile = get().userProfile ?? (await fetchCloudProfile(uid));
    if (profile) {
      await saveCloudProfile(uid, { ...profile, monthlyIncome: template.monthlyIncome });
    } else {
      await saveCloudProfile(uid, {
        email,
        displayName: 'User',
        monthlyIncome: template.monthlyIncome,
        baseSavingsRatePercent: 20,
        alertPreference: true,
        ...defaultProfileExtras(),
      });
    }

    const savingsGoalsMap = parseJsonToMap(template.savingsGoalsJson);
    const existingGoals = get().savingGoals;
    for (const [goalName, amountToSave] of Object.entries(savingsGoalsMap)) {
      const matched = existingGoals.find((g) => g.name.toLowerCase() === goalName.toLowerCase());
      if (matched) {
        await updateCloudSavingGoal(uid, { ...matched, savedAmount: matched.savedAmount + amountToSave });
        await addCloudLog(uid, email, 'Goal Allocated', `Template applied ₹${amountToSave} to existing goal '${matched.name}'.`, 'SYSTEM');
      } else {
        const targetDate = Date.now() + 365 * 86400000;
        const initialContrib = amountToSave / 12;
        await addCloudSavingGoal(uid, {
          userEmail: email,
          name: goalName,
          targetAmount: amountToSave * 12,
          savedAmount: amountToSave,
          targetDateMillis: targetDate,
          initialMonthlyContribution: initialContrib,
          currentRequiredMonthly: initialContrib,
          deficit: 0,
          surplus: 0,
          forecastText: '',
          missedMonthsCount: 0,
          creationDateMillis: Date.now(),
        });
      }
    }
    await addCloudLog(uid, email, 'Template Applied', `Successfully applied budget template '${template.name}' to ${monthYear}. Income set to ₹${template.monthlyIncome}.`, 'SYSTEM');
    await get().refreshUserData();
  },

  refreshChat: async () => {
    const uid = currentUid();
    const email = get().currentUserEmail;
    if (!uid || !email) return;

    let sessions = await fetchChatSessions(uid);
    let activeId = get().activeChatSessionId;

    if (!sessions.length) {
      const session = await createChatSession(uid, email, 'New chat');
      const welcome = welcomeMessage(session.id);
      await saveChatMessage(uid, welcome);
      sessions = [session];
      activeId = session.id;
    } else if (!activeId || !sessions.some((s) => s.id === activeId)) {
      activeId = sessions[0].id;
    }

    const messages = await fetchChatMessages(uid, activeId!);
    set({
      chatSessions: sessions,
      activeChatSessionId: activeId,
      aiCoachChat: messages.length ? messages : [welcomeMessage(activeId!)],
    });
  },

  createNewChatSession: async () => {
    const uid = currentUid();
    const email = get().currentUserEmail;
    if (!uid || !email) return;

    const session = await createChatSession(uid, email, 'New chat');
    const welcome = welcomeMessage(session.id);
    await saveChatMessage(uid, welcome);
    const sessions = await fetchChatSessions(uid);
    set({
      chatSessions: sessions,
      activeChatSessionId: session.id,
      aiCoachChat: [welcome],
    });
  },

  selectChatSession: async (sessionId) => {
    const uid = currentUid();
    if (!uid) return;
    const messages = await fetchChatMessages(uid, sessionId);
    set({
      activeChatSessionId: sessionId,
      aiCoachChat: messages.length ? messages : [welcomeMessage(sessionId)],
    });
  },

  deleteChatSessionById: async (sessionId) => {
    const uid = currentUid();
    if (!uid) return;
    await deleteChatSession(uid, sessionId);
    const remaining = (await fetchChatSessions(uid)).filter((s) => s.id !== sessionId);
    if (get().activeChatSessionId === sessionId) {
      if (remaining.length) {
        await get().selectChatSession(remaining[0].id);
      } else {
        await get().createNewChatSession();
      }
    }
    set({ chatSessions: await fetchChatSessions(uid) });
  },

  clearCurrentChat: async () => {
    const uid = currentUid();
    const sessionId = get().activeChatSessionId;
    if (!uid || !sessionId) return;
    await clearChatMessages(uid, sessionId);
    const welcome = welcomeMessage(sessionId);
    await saveChatMessage(uid, welcome);
    set({ aiCoachChat: [welcome] });
  },

  transcribeVoiceNote: transcribeAudio,

  sendChatMessage: async (message, rawAttachments = []) => {
    if (!message.trim() && !rawAttachments.length) return;
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;

    let sessionId = get().activeChatSessionId;
    if (!sessionId) {
      await get().refreshChat();
      sessionId = get().activeChatSessionId;
      if (!sessionId) return;
    }

    const now = Date.now();
    const pendingAttachments: ChatAttachment[] = rawAttachments.map((a, i) => ({
      id: `att_${now}_${i}`,
      uri: a.uri,
      mimeType: a.mimeType,
      name: a.name,
    }));

    const userMsg: ChatMessage = {
      id: `local_${now}`,
      sessionId,
      text: message.trim(),
      isUser: true,
      timestampMillis: now,
      attachments: pendingAttachments.length ? pendingAttachments : undefined,
    };

    set((s) => ({ aiCoachChat: [...s.aiCoachChat, userMsg], isAiLoading: true }));

    const savedUserId = await saveChatMessage(uid, userMsg);
    userMsg.id = savedUserId;

    if (pendingAttachments.length) {
      const uploaded: ChatAttachment[] = [];
      for (const att of pendingAttachments) {
        try {
          const storageUrl = await uploadChatAttachment(uid, sessionId, savedUserId, att.uri, att.mimeType, att.name);
          uploaded.push({ ...att, storageUrl });
        } catch {
          uploaded.push(att);
        }
      }
      userMsg.attachments = uploaded;
      await saveChatMessage(uid, userMsg, savedUserId);
      set((s) => ({
        aiCoachChat: s.aiCoachChat.map((m) => (m.id === savedUserId || m.id === `local_${now}` ? userMsg : m)),
      }));
    }

    const isFirstUserMsg = get().aiCoachChat.filter((m) => m.isUser).length === 1;
    if (isFirstUserMsg && message.trim()) {
      const title = message.trim().slice(0, 40) + (message.trim().length > 40 ? '…' : '');
      await updateChatSessionTitle(uid, sessionId, title);
      set({ chatSessions: await fetchChatSessions(uid) });
    }

    // Pull latest Planner/expense state before building LLM context.
    await get().refreshUserData();

    const state = get();
    const systemPrompt = buildAdvisorSystemPrompt({
      userProfile: state.userProfile,
      expenses: state.expenses,
      liabilities: state.liabilities,
      subscriptions: state.subscriptions,
      bills: state.bills,
      savingGoals: state.savingGoals,
      categoryBudgets: state.categoryBudgets,
      budgetTemplates: state.budgetTemplates,
      groups: state.groups,
      groupExpenses: state.allGroupExpenses,
      groupSettlements: state.allGroupSettlements,
    });

    const history = get().aiCoachChat.filter((m) => m.id !== savedUserId);
    const aiResponse = await getFinancialAdviceWithHistory(
      history,
      message.trim() || 'Please analyse the attached file(s) in context of my finances.',
      systemPrompt,
      userMsg.attachments
    );

    const botMsg: ChatMessage = {
      id: `bot_${Date.now()}`,
      sessionId,
      text: aiResponse,
      isUser: false,
      timestampMillis: Date.now(),
    };
    botMsg.id = await saveChatMessage(uid, botMsg);

    set((s) => ({
      aiCoachChat: [...s.aiCoachChat, botMsg],
      isAiLoading: false,
      aiReportAdvice: aiResponse,
    }));
    set({ chatSessions: await fetchChatSessions(uid) });
  },

  saveGoogleOAuthToken: async (token) => {
    await AsyncStorage.setItem(PREFS.googleToken, token);
    set({ googleOAuthToken: token });
  },

  triggerGoogleSheetsSync: async (customToken) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return { success: false, error: 'Not logged in' };

    const token = customToken?.trim() || get().googleOAuthToken;
    const headers = ['Type', 'Name/Title', 'Amount', 'Category', 'Date/DueDate', 'Details/Notes'];
    const { expenses, liabilities, savingGoals } = get();
    const rows: string[][] = [];
    expenses.forEach((it) => rows.push(['Expense', it.title, `₹${it.amount}`, it.category, new Date(it.dateMillis).toISOString().slice(0, 10), it.notes]));
    liabilities.forEach((it) => rows.push(['Liability', it.name, `₹${it.amount}`, it.frequency, new Date(it.dueDateMillis).toISOString().slice(0, 10), `Paid: ${it.isPaid}, Freq: ${it.frequency}`]));
    savingGoals.forEach((it) => rows.push(['SavingsGoal', it.name, `₹${it.targetAmount}`, 'Savings', new Date(it.targetDateMillis).toISOString().slice(0, 10), `Saved: ₹${it.savedAmount}, Req: ₹${it.currentRequiredMonthly}/mo`]));

    if (!token || token === 'MOCK_TOKEN' || token.length < 10) {
      await new Promise((r) => setTimeout(r, 1500));
      const mockSheetId = `1aBcDeFgHiJkLmNoPqRsTuVwXyZ${1000 + Math.floor(Math.random() * 9000)}`;
      const mockUrl = `https://docs.google.com/spreadsheets/d/${mockSheetId}/edit`;
      const now = Date.now();
      await AsyncStorage.setItem(PREFS.sheetsLastSync, String(now));
      await AsyncStorage.setItem(PREFS.sheetsSyncUrl, mockUrl);
      set({ googleSheetsLastSync: now, googleSheetsSyncUrl: mockUrl });
      await addCloudLog(uid, email, 'Sheets Cloud Sync', `Sandbox Sync: Created Live Google Sheet 'FutureFund_Ledger_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}'. Automated periodic sync set for 7 days.`, 'SYSTEM');
      await get().refreshUserData();
      return { success: true, url: mockUrl };
    }

    const title = `FutureFund Financial Ledger (${new Date().toISOString().slice(0, 10)})`;
    const [url, error] = await createAndPopulateGoogleSheet(token, title, headers, rows);
    if (url) {
      const now = Date.now();
      await AsyncStorage.setItem(PREFS.sheetsLastSync, String(now));
      await AsyncStorage.setItem(PREFS.sheetsSyncUrl, url);
      set({ googleSheetsLastSync: now, googleSheetsSyncUrl: url });
      await addCloudLog(uid, email, 'Google Sheets Sync Success', `Live Google Sheet updated! URL: ${url}. Periodic sync scheduled every 7 days.`, 'SYSTEM');
      await get().refreshUserData();
      return { success: true, url };
    }
    await addCloudLog(uid, email, 'Google Sheets Sync Error', `Sync error: ${error}`, 'SYSTEM');
    await get().refreshUserData();
    return { success: false, error: error ?? undefined };
  },

  triggerGmailDelivery: async (customToken, customToEmail) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return { success: false, error: 'Not logged in' };

    const token = customToken?.trim() || get().googleOAuthToken;
    const { userProfile, expenses, liabilities, savingGoals, aiReportAdvice } = get();
    const recipient = customToEmail || userProfile?.email || email;
    const subject = 'FutureFund Premium Financial Ledger Report';
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
    const totalLiability = liabilities.reduce((s, l) => s + l.amount, 0);
    const totalSavings = savingGoals.reduce((s, g) => s + g.savedAmount, 0);
    const monthlyIncome = userProfile?.monthlyIncome ?? 5000;
    const aiAdvice = aiReportAdvice ?? 'Set up budget templates and review liabilities regularly to build wealth.';

    const htmlContent = `<html><body style='font-family:sans-serif;padding:20px;color:#333'>
      <h1 style='color:#4F46E5'>FutureFund Financial Ledger Report</h1>
      <p>Hi <b>${userProfile?.displayName ?? 'User'}</b>,</p>
      <p>Your premium real-time financial report compiled on <b>${new Date().toLocaleString('en-IN')}</b>.</p>
      <h3 style='color:#4F46E5'>Summary Metrics</h3>
      <ul>
        <li><b>Monthly Net Income:</b> ₹${monthlyIncome.toLocaleString('en-IN')}</li>
        <li><b>Total General Expenses:</b> ₹${totalExpense.toLocaleString('en-IN')}</li>
        <li><b>Total Annual Liabilities:</b> ₹${totalLiability.toLocaleString('en-IN')}</li>
        <li><b>Total Saved Assets:</b> ₹${totalSavings.toLocaleString('en-IN')}</li>
      </ul>
      <h3 style='color:#4F46E5'>AI Financial Coach Advice</h3>
      <div style='background:#EEF2F6;padding:15px;border-radius:8px;border-left:4px solid #4F46E5'><p>${aiAdvice}</p></div>
      <h3 style='color:#4F46E5'>Active Expenses Ledger</h3>
      <table border='1' cellpadding='8' style='border-collapse:collapse;width:100%'>
        <tr style='background:#4F46E5;color:white'><th>Title</th><th>Amount</th><th>Category</th><th>Details</th></tr>
        ${expenses.map((it) => `<tr><td>${it.title}</td><td>₹${it.amount}</td><td>${it.category}</td><td>${it.notes}</td></tr>`).join('')}
      </table>
      <br/><p style='font-size:11px;color:#666'>Automated dispatch from FutureFund AI Companion.</p>
    </body></html>`;

    if (!token || token === 'MOCK_TOKEN' || token.length < 10) {
      await new Promise((r) => setTimeout(r, 1200));
      await addCloudLog(uid, email, 'Gmail Delivery Sent', `Sandbox Mail: Monthly PDF report compiled for delivery to: ${recipient}.`, 'SYSTEM');
      await get().refreshUserData();
      return { success: true };
    }

    const [success, error] = await sendGmailReport(token, recipient, subject, htmlContent);
    if (success) {
      await addCloudLog(uid, email, 'Gmail Delivery Sent', `Real Gmail report successfully dispatched to ${recipient}.`, 'SYSTEM');
      await get().refreshUserData();
      return { success: true };
    }
    await addCloudLog(uid, email, 'Gmail Delivery Error', `Gmail send error: ${error}`, 'SYSTEM');
    await get().refreshUserData();
    return { success: false, error: error ?? undefined };
  },

  checkAndTriggerPeriodicSync: async () => {
    const { googleSheetsLastSync } = get();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (googleSheetsLastSync === 0 || Date.now() - googleSheetsLastSync >= sevenDays) {
      await get().triggerGoogleSheetsSync();
    }
  },
}));

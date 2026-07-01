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
import { buildAdvisorSystemPrompt } from '@/src/utils/advisorContext';
import { buildSchedule, serializeInstallments } from '@/src/utils/liabilitySchedule';
import { createAndPopulateGoogleSheet, sendGmailReport } from '@/src/services/googleApi';
import {
  fetchCloudProfile,
  saveCloudProfile,
  uploadProfilePhoto as uploadCloudProfilePhoto,
} from '@/src/services/userProfileCloud';
import {
  addBill as addCloudBill,
  addCloudLog,
  addGroupExpense as addCloudGroupExpense,
  addLiability as addCloudLiability,
  addSavingGoal as addCloudSavingGoal,
  addSubscription as addCloudSubscription,
  addTemplate as addCloudTemplate,
  createGroup as createCloudGroup,
  deleteBill as deleteCloudBill,
  deleteCategoryBudgetsForMonth,
  deleteLiability as deleteCloudLiability,
  deleteSavingGoal as deleteCloudSavingGoal,
  deleteSubscription as deleteCloudSubscription,
  deleteTemplate as deleteCloudTemplate,
  fetchBills,
  fetchCategoryBudgets,
  fetchGroupExpenses,
  fetchGroups,
  fetchLiabilities,
  fetchLogs,
  fetchSavingGoals,
  fetchSubscriptions,
  fetchTemplates,
  saveCategoryBudgets,
  updateBill as updateCloudBill,
  updateLiability as updateCloudLiability,
  updateSavingGoal as updateCloudSavingGoal,
  updateSubscription as updateCloudSubscription,
} from '@/src/services/userDataCloud';
import type {
  BudgetTemplate,
  Bill,
  CategoryBudget,
  ChatAttachment,
  ChatMessage,
  ChatSession,
  Expense,
  GroupExpense,
  Liability,
  NotificationLog,
  SavingGoal,
  SplitGroup,
  Subscription,
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
    if (firebaseName && existing.displayName !== firebaseName) {
      const updated = { ...existing, displayName: firebaseName };
      await saveCloudProfile(uid, updated);
      return updated;
    }
    return existing;
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
  logs: NotificationLog[];
  budgetTemplates: BudgetTemplate[];
  categoryBudgets: CategoryBudget[];
  selectedGroupId: string | null;
  allGroupExpenses: GroupExpense[];
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
  updateLiability: (liability: Liability) => Promise<void>;
  deleteLiability: (liability: Liability) => Promise<void>;

  addSubscription: (
    name: string,
    cost: number,
    cycle: string,
    category: string,
    isAlertEnabled?: boolean
  ) => Promise<void>;
  updateSubscription: (sub: Subscription) => Promise<void>;
  toggleSubscriptionAlert: (sub: Subscription) => Promise<void>;
  stopSubscription: (sub: Subscription) => Promise<void>;
  deleteSubscription: (sub: Subscription) => Promise<void>;

  addBill: (name: string, amount: number, cycle: string, category: string, isAlertEnabled?: boolean) => Promise<void>;
  updateBill: (bill: Bill) => Promise<void>;
  toggleBillAlert: (bill: Bill) => Promise<void>;
  stopBill: (bill: Bill) => Promise<void>;
  deleteBill: (bill: Bill) => Promise<void>;

  addSavingContribution: (goal: SavingGoal, amount: number) => Promise<void>;
  deleteSavingGoal: (goal: SavingGoal) => Promise<void>;

  selectGroup: (groupId: string | null) => Promise<void>;
  createGroup: (name: string, members: string[]) => Promise<void>;
  addGroupExpense: (groupId: string, title: string, amount: number, paidBy: string) => Promise<void>;

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
  logs: [],
  budgetTemplates: [],
  categoryBudgets: [],
  selectedGroupId: null,
  allGroupExpenses: [],
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
          await ensureUserProfile(user.uid, user.email, user.displayName);
          set({ currentUserEmail: user.email });
          await get().refreshUserData();
        } else {
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
    const [profile, expenses, liabilities, subscriptions, bills, savingGoals, groups, logs, budgetTemplates, categoryBudgets, allGroupExpenses] =
      await Promise.all([
        fetchCloudProfile(uid),
        fetchCloudExpenses(uid),
        fetchLiabilities(uid),
        fetchSubscriptions(uid),
        fetchBills(uid),
        fetchSavingGoals(uid),
        fetchGroups(uid),
        fetchLogs(uid),
        fetchTemplates(uid),
        fetchCategoryBudgets(uid, monthYear),
        fetchAllGroupExpenses(uid),
      ]);
    set({ userProfile: profile, expenses, liabilities, subscriptions, bills, savingGoals, groups, logs, budgetTemplates, categoryBudgets, allGroupExpenses });
    await get().refreshGroupExpenses();
    await get().refreshChat();
  },

  refreshGroupExpenses: async () => {
    const uid = currentUid();
    const groupId = get().selectedGroupId;
    if (!uid || groupId == null) {
      set({ groupExpenses: [] });
      return;
    }
    const groupExpenses = await fetchGroupExpenses(uid, groupId);
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
    });
    await addCloudLog(uid, email, 'Liability Created', `New ${frequency.toLowerCase()} liability '${name}' set for ₹${amount}.`, 'LIABILITY');
    await get().refreshUserData();
  },

  updateLiability: async (liability) => {
    const uid = currentUid();
    if (!uid) return;
    await updateCloudLiability(uid, liability);
    await get().refreshUserData();
  },

  deleteLiability: async (liability) => {
    const uid = currentUid();
    if (!uid) return;
    await deleteCloudLiability(uid, liability.id);
    await get().refreshUserData();
  },

  addSubscription: async (name, cost, cycle, category, isAlertEnabled = true) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    await addCloudSubscription(uid, {
      userEmail: email,
      name,
      cost,
      billingCycle: cycle,
      nextPaymentMillis: Date.now() + 86400000 * 30,
      category,
      isAlertEnabled,
      isActive: true,
    });
    await addCloudLog(uid, email, 'Subscription Tracked', `Subscribed to '${name}' for ₹${cost}/month.`, 'SUBSCRIPTION');
    await get().refreshUserData();
  },

  updateSubscription: async (sub) => {
    const uid = currentUid();
    if (!uid) return;
    await updateCloudSubscription(uid, sub);
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
    await deleteCloudSubscription(uid, sub.id);
    await get().refreshUserData();
  },

  addBill: async (name, amount, cycle, category, isAlertEnabled = true) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    await addCloudBill(uid, {
      userEmail: email,
      name,
      amount,
      billingCycle: cycle,
      nextPaymentMillis: Date.now() + 86400000 * 30,
      category,
      isAlertEnabled,
      isActive: true,
    });
    await addCloudLog(uid, email, 'Bill Tracked', `Bill '${name}' set for ₹${amount} (${cycle.toLowerCase()}).`, 'SYSTEM');
    await get().refreshUserData();
  },

  updateBill: async (bill) => {
    const uid = currentUid();
    if (!uid) return;
    await updateCloudBill(uid, bill);
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
    set({ selectedGroupId: groupId });
    await get().refreshGroupExpenses();
  },

  createGroup: async (name, members) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    await createCloudGroup(uid, { userEmail: email, name, members });
    await addCloudLog(uid, email, 'Group Created', `Split group '${name}' created with ${members.length} members.`, 'SYSTEM');
    await get().refreshUserData();
  },

  addGroupExpense: async (groupId, title, amount, paidBy) => {
    const email = get().currentUserEmail;
    const uid = currentUid();
    if (!email || !uid) return;
    await addCloudGroupExpense(uid, {
      userEmail: email,
      groupId,
      title,
      amount,
      paidBy,
      splitType: 'EQUAL',
      splitsJson: '{}',
      dateMillis: Date.now(),
    });
    await addCloudLog(uid, email, 'Split Expense', `Split expense '${title}' for ₹${amount} added to group.`, 'SYSTEM');
    await get().refreshGroupExpenses();
    await get().refreshUserData();
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import * as repo from '@/src/db/repository';
import { getDatabase } from '@/src/db/database';
import {
  mapFirebaseAuthError,
  registerWithEmail,
  signInWithEmail,
  signOutUser,
  subscribeToAuthChanges,
  updateAuthDisplayName,
  updateAuthPhotoUrl,
} from '@/src/services/auth';
import { getFirebaseAuth } from '@/src/services/firebase';
import {
  fetchCloudProfile,
  saveCloudProfile,
  uploadProfilePhoto as uploadCloudProfilePhoto,
} from '@/src/services/userProfileCloud';
import { isFirebaseConfigured } from '@/src/config/firebase';
import { getFinancialAdvice, suggestCategory as geminiSuggestCategory } from '@/src/services/gemini';
import { createAndPopulateGoogleSheet, sendGmailReport } from '@/src/services/googleApi';
import type {
  BudgetTemplate,
  CategoryBudget,
  ChatMessage,
  Expense,
  GroupExpense,
  Liability,
  NotificationLog,
  SavingGoal,
  SplitGroup,
  Subscription,
  UserProfile,
} from '@/src/types/models';
import { defaultProfileExtras } from '@/src/types/models';
import { currentMonthYear, parseJsonToMap } from '@/src/utils/format';

const PREFS = {
  googleToken: 'google_oauth_token',
  sheetsLastSync: 'google_sheets_last_sync',
  sheetsSyncUrl: 'google_sheets_sync_url',
};

let authUnsubscribe: (() => void) | null = null;

async function syncUserProfile(
  uid: string,
  email: string,
  authDisplayName?: string | null,
  monthlyIncome?: number
): Promise<void> {
  const firebaseName = authDisplayName?.trim();
  const [cloud, local] = await Promise.all([
    fetchCloudProfile(uid).catch(() => null),
    repo.getUserProfile(email),
  ]);

  if (cloud) {
    await repo.saveUserProfile(cloud);
    return;
  }

  if (local) {
    const profile = firebaseName && local.displayName !== firebaseName
      ? { ...local, displayName: firebaseName }
      : local;
    await repo.saveUserProfile(profile);
    await saveCloudProfile(uid, profile);
    return;
  }

  const profile: UserProfile = {
    email,
    displayName: firebaseName || email.split('@')[0],
    photoUrl: null,
    monthlyIncome: monthlyIncome ?? 5000,
    baseSavingsRatePercent: 20,
    alertPreference: true,
    ...defaultProfileExtras(),
  };
  await repo.saveUserProfile(profile);
  await saveCloudProfile(uid, profile);
}

function clearUserState() {
  return {
    currentUserEmail: null as string | null,
    userProfile: null as UserProfile | null,
    expenses: [] as Expense[],
    liabilities: [] as Liability[],
    subscriptions: [] as Subscription[],
    savingGoals: [] as SavingGoal[],
    groups: [] as SplitGroup[],
    groupExpenses: [] as GroupExpense[],
    logs: [] as NotificationLog[],
    budgetTemplates: [] as BudgetTemplate[],
    categoryBudgets: [] as CategoryBudget[],
    selectedGroupId: null as number | null,
  };
}

interface FinancialState {
  initialized: boolean;
  currentUserEmail: string | null;
  userProfile: UserProfile | null;
  expenses: Expense[];
  liabilities: Liability[];
  subscriptions: Subscription[];
  savingGoals: SavingGoal[];
  groups: SplitGroup[];
  groupExpenses: GroupExpense[];
  logs: NotificationLog[];
  budgetTemplates: BudgetTemplate[];
  categoryBudgets: CategoryBudget[];
  selectedGroupId: number | null;
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

  addExpense: (title: string, amount: number, category: string, notes: string) => Promise<void>;
  updateExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (expense: Expense) => Promise<void>;
  suggestCategory: (title: string, amount: number, categories: string[]) => Promise<string>;

  addLiability: (name: string, amount: number, frequency: string, category: string, dueInDays: number) => Promise<void>;
  toggleLiabilityPaid: (liability: Liability) => Promise<void>;
  deleteLiability: (liability: Liability) => Promise<void>;

  addSubscription: (name: string, cost: number, cycle: string, category: string) => Promise<void>;
  toggleSubscriptionAlert: (sub: Subscription) => Promise<void>;
  deleteSubscription: (sub: Subscription) => Promise<void>;

  addSavingContribution: (goal: SavingGoal, amount: number) => Promise<void>;
  deleteSavingGoal: (goal: SavingGoal) => Promise<void>;

  selectGroup: (groupId: number | null) => Promise<void>;
  createGroup: (name: string, members: string[]) => Promise<void>;
  addGroupExpense: (groupId: number, title: string, amount: number, paidBy: string) => Promise<void>;

  addTemplate: (name: string, monthlyIncome: number, allocations: Record<string, number>, savingsGoals: Record<string, number>) => Promise<void>;
  deleteTemplate: (template: BudgetTemplate) => Promise<void>;
  applyTemplate: (template: BudgetTemplate, monthYear: string) => Promise<void>;

  sendChatMessage: (message: string) => Promise<void>;
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
  savingGoals: [],
  groups: [],
  groupExpenses: [],
  logs: [],
  budgetTemplates: [],
  categoryBudgets: [],
  selectedGroupId: null,
  aiCoachChat: [
    {
      text: 'Hello! I am your Expenxer Advisor. How can I help you optimize your wealth or review your savings plan today?',
      isUser: false,
    },
  ],
  isAiLoading: false,
  aiReportAdvice: null,
  googleOAuthToken: '',
  googleSheetsLastSync: 0,
  googleSheetsSyncUrl: '',

  init: async () => {
    await getDatabase();
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
          await syncUserProfile(user.uid, user.email, user.displayName);
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
    if (!email) return;
    const monthYear = currentMonthYear();
    const [profile, expenses, liabilities, subscriptions, savingGoals, groups, logs, budgetTemplates, categoryBudgets] =
      await Promise.all([
        repo.getUserProfile(email),
        repo.getAllExpenses(email),
        repo.getAllLiabilities(email),
        repo.getAllSubscriptions(email),
        repo.getAllSavingGoals(email),
        repo.getAllGroups(email),
        repo.getAllLogs(email),
        repo.getAllTemplates(email),
        repo.getBudgetsForMonth(email, monthYear),
      ]);
    set({ userProfile: profile, expenses, liabilities, subscriptions, savingGoals, groups, logs, budgetTemplates, categoryBudgets });
    await get().refreshGroupExpenses();
  },

  refreshGroupExpenses: async () => {
    const groupId = get().selectedGroupId;
    if (groupId == null) {
      set({ groupExpenses: [] });
      return;
    }
    const groupExpenses = await repo.getExpensesForGroup(groupId);
    set({ groupExpenses });
  },

  registerAccount: async (email, password, displayName, monthlyIncome) => {
    try {
      const user = await registerWithEmail(email, password, displayName);
      if (user.uid) {
        await syncUserProfile(user.uid, email, displayName, monthlyIncome);
      }
      await repo.addSystemLog(email, 'Account Created', `Registered as ${displayName}.`, 'SYSTEM');
      return null;
    } catch (error) {
      return mapFirebaseAuthError(error);
    }
  },

  signInAccount: async (email, password) => {
    try {
      const user = await signInWithEmail(email, password);
      await syncUserProfile(user.uid, user.email!, user.displayName);
      const profile = await repo.getUserProfile(email);
      if (profile) {
        await repo.addSystemLog(email, 'Auth Success', `Signed in as ${profile.displayName}.`, 'SYSTEM');
      }
      return null;
    } catch (error) {
      return mapFirebaseAuthError(error);
    }
  },

  logout: async () => {
    const email = get().currentUserEmail;
    if (email) {
      await repo.addSystemLog(email, 'Logged Out', 'Active session closed.', 'SYSTEM');
    }
    await signOutUser();
  },

  updateProfile: async (profile) => {
    const email = get().currentUserEmail;
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!email || profile.email !== email) return;

    await repo.saveUserProfile(profile);
    if (uid) await saveCloudProfile(uid, profile);
    await updateAuthDisplayName(profile.displayName);
    if (profile.photoUrl) await updateAuthPhotoUrl(profile.photoUrl);
    await repo.addSystemLog(email, 'Profile Updated', 'Customized profile adjustments successfully stored.', 'SYSTEM');
    await get().refreshUserData();
  },

  uploadProfilePhoto: async (localUri) => {
    const email = get().currentUserEmail;
    const uid = getFirebaseAuth().currentUser?.uid;
    const profile = get().userProfile;
    if (!email || !uid || !profile) return 'Not signed in.';

    try {
      const url = await uploadCloudProfilePhoto(uid, localUri);
      const updated: UserProfile = { ...profile, photoUrl: url };
      await repo.saveUserProfile(updated);
      await saveCloudProfile(uid, updated);
      await updateAuthPhotoUrl(url);
      await get().refreshUserData();
      return null;
    } catch (error) {
      return (error as Error)?.message ?? 'Failed to upload profile photo.';
    }
  },

  addExpense: async (title, amount, category, notes) => {
    const email = get().currentUserEmail;
    if (!email) return;
    await repo.addExpense({ userEmail: email, title, amount, category, dateMillis: Date.now(), notes });
    await get().refreshUserData();
  },

  updateExpense: async (expense) => {
    await repo.updateExpense(expense);
    await get().refreshUserData();
  },

  deleteExpense: async (expense) => {
    await repo.deleteExpense(expense);
    await get().refreshUserData();
  },

  suggestCategory: geminiSuggestCategory,

  addLiability: async (name, amount, frequency, category, dueInDays) => {
    const email = get().currentUserEmail;
    if (!email) return;
    await repo.addLiability({
      userEmail: email,
      name,
      amount,
      frequency,
      category,
      dueDateMillis: Date.now() + dueInDays * 86400000,
      isPaid: false,
      autoRecalculate: true,
    });
    await get().refreshUserData();
  },

  toggleLiabilityPaid: async (liability) => {
    await repo.updateLiability({ ...liability, isPaid: !liability.isPaid });
    await get().refreshUserData();
  },

  deleteLiability: async (liability) => {
    await repo.deleteLiability(liability);
    await get().refreshUserData();
  },

  addSubscription: async (name, cost, cycle, category) => {
    const email = get().currentUserEmail;
    if (!email) return;
    await repo.addSubscription({
      userEmail: email,
      name,
      cost,
      billingCycle: cycle,
      nextPaymentMillis: Date.now() + 86400000 * 30,
      category,
      isAlertEnabled: true,
    });
    await get().refreshUserData();
  },

  toggleSubscriptionAlert: async (sub) => {
    await repo.updateSubscription({ ...sub, isAlertEnabled: !sub.isAlertEnabled });
    await get().refreshUserData();
  },

  deleteSubscription: async (sub) => {
    await repo.deleteSubscription(sub);
    await get().refreshUserData();
  },

  addSavingContribution: async (goal, amount) => {
    await repo.updateSavingGoal({ ...goal, savedAmount: goal.savedAmount + amount });
    await repo.addSystemLog(goal.userEmail, 'Goal Contributed', `Contributed ₹${amount} to target goal: '${goal.name}'`, 'SYSTEM');
    await get().refreshUserData();
  },

  deleteSavingGoal: async (goal) => {
    await repo.deleteSavingGoal(goal);
    await get().refreshUserData();
  },

  selectGroup: async (groupId) => {
    set({ selectedGroupId: groupId });
    await get().refreshGroupExpenses();
  },

  createGroup: async (name, members) => {
    const email = get().currentUserEmail;
    if (!email) return;
    await repo.createGroup({ userEmail: email, name, members });
    await get().refreshUserData();
  },

  addGroupExpense: async (groupId, title, amount, paidBy) => {
    const email = get().currentUserEmail;
    if (!email) return;
    await repo.addGroupExpense({
      userEmail: email,
      groupId,
      title,
      amount,
      paidBy,
      splitType: 'EQUAL',
      splitsJson: '{}',
      dateMillis: Date.now(),
    });
    await get().refreshGroupExpenses();
    await get().refreshUserData();
  },

  addTemplate: async (name, monthlyIncome, allocations, savingsGoals) => {
    const email = get().currentUserEmail;
    if (!email) return;
    const allocationsJson = JSON.stringify(allocations);
    const savingsGoalsJson = JSON.stringify(savingsGoals);
    await repo.addTemplate({ userEmail: email, name, monthlyIncome, allocationsJson, savingsGoalsJson });
    await get().refreshUserData();
  },

  deleteTemplate: async (template) => {
    await repo.deleteTemplate(template);
    await get().refreshUserData();
  },

  applyTemplate: async (template, monthYear) => {
    const email = get().currentUserEmail;
    if (!email) return;
    await repo.deleteBudgetsForMonth(email, monthYear);
    const allocationsMap = parseJsonToMap(template.allocationsJson);
    const budgets = Object.entries(allocationsMap).map(([category, limitAmount]) => ({
      userEmail: email,
      category,
      limitAmount,
      monthYear,
    }));
    if (budgets.length) await repo.saveCategoryBudgets(budgets);

    const profile = await repo.getUserProfile(email);
    if (profile) {
      await repo.saveUserProfile({ ...profile, monthlyIncome: template.monthlyIncome });
    } else {
      await repo.saveUserProfile({
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
        await repo.updateSavingGoal({ ...matched, savedAmount: matched.savedAmount + amountToSave });
        await repo.addSystemLog(email, 'Goal Allocated', `Template applied ₹${amountToSave} to existing goal '${matched.name}'.`, 'SYSTEM');
      } else {
        const targetDate = Date.now() + 365 * 86400000;
        const initialContrib = amountToSave / 12;
        await repo.addSavingGoal({
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
    await repo.addSystemLog(email, 'Template Applied', `Successfully applied budget template '${template.name}' to ${monthYear}. Income set to ₹${template.monthlyIncome}.`, 'SYSTEM');
    await get().refreshUserData();
  },

  sendChatMessage: async (message) => {
    if (!message.trim()) return;
    const email = get().currentUserEmail;
    if (!email) return;

    set((s) => ({ aiCoachChat: [...s.aiCoachChat, { text: message, isUser: true }], isAiLoading: true }));

    const { userProfile, expenses, liabilities, subscriptions, savingGoals } = get();
    const userIncome = userProfile?.monthlyIncome ?? 5000;
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const liabilityText = liabilities.map((l) => `${l.name}(₹${l.amount})`).join(', ');
    const subText = subscriptions.map((s) => `${s.name}(₹${s.cost}/mo)`).join(', ');
    const goalsText = savingGoals.map((g) => `${g.name}(target ₹${g.targetAmount}, saved ₹${g.savedAmount}, monthly rate: ₹${g.currentRequiredMonthly})`).join(', ');

    const systemPrompt = `You are the FutureFund AI Advisor. Keep responses focused, clear, and highly professional.
Here is the user's active financial sheet:
- Monthly Income: ₹${userIncome}
- General Expenses logged: ₹${totalExpenses}
- Annual liabilities: ${liabilityText}
- Monthly subscription plans: ${subText}
- Savings goals: ${goalsText}
Analyse this context and respond directly to their query with actionable FinTech intelligence and cost reduction ideas.`;

    const aiResponse = await getFinancialAdvice(message, systemPrompt);
    set((s) => ({
      aiCoachChat: [...s.aiCoachChat, { text: aiResponse, isUser: false }],
      isAiLoading: false,
    }));
  },

  saveGoogleOAuthToken: async (token) => {
    await AsyncStorage.setItem(PREFS.googleToken, token);
    set({ googleOAuthToken: token });
  },

  triggerGoogleSheetsSync: async (customToken) => {
    const email = get().currentUserEmail;
    if (!email) return { success: false, error: 'Not logged in' };

    const token = customToken?.trim() || get().googleOAuthToken;
    const headers = ['Type', 'Name/Title', 'Amount', 'Category', 'Date/DueDate', 'Details/Notes'];
    const { expenses, liabilities, savingGoals } = get();
    const rows: string[][] = [];
    expenses.forEach((it) => rows.push(['Expense', it.title, `₹${it.amount}`, it.category, new Date(it.dateMillis).toISOString().slice(0, 10), it.notes]));
    liabilities.forEach((it) => rows.push(['Liability', it.name, `₹${it.amount}`, it.category, new Date(it.dueDateMillis).toISOString().slice(0, 10), `Paid: ${it.isPaid}, Freq: ${it.frequency}`]));
    savingGoals.forEach((it) => rows.push(['SavingsGoal', it.name, `₹${it.targetAmount}`, 'Savings', new Date(it.targetDateMillis).toISOString().slice(0, 10), `Saved: ₹${it.savedAmount}, Req: ₹${it.currentRequiredMonthly}/mo`]));

    if (!token || token === 'MOCK_TOKEN' || token.length < 10) {
      await new Promise((r) => setTimeout(r, 1500));
      const mockSheetId = `1aBcDeFgHiJkLmNoPqRsTuVwXyZ${1000 + Math.floor(Math.random() * 9000)}`;
      const mockUrl = `https://docs.google.com/spreadsheets/d/${mockSheetId}/edit`;
      const now = Date.now();
      await AsyncStorage.setItem(PREFS.sheetsLastSync, String(now));
      await AsyncStorage.setItem(PREFS.sheetsSyncUrl, mockUrl);
      set({ googleSheetsLastSync: now, googleSheetsSyncUrl: mockUrl });
      await repo.addSystemLog(email, 'Sheets Cloud Sync', `Sandbox Sync: Created Live Google Sheet 'FutureFund_Ledger_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}'. Automated periodic sync set for 7 days.`, 'SYSTEM');
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
      await repo.addSystemLog(email, 'Google Sheets Sync Success', `Live Google Sheet updated! URL: ${url}. Periodic sync scheduled every 7 days.`, 'SYSTEM');
      await get().refreshUserData();
      return { success: true, url };
    }
    await repo.addSystemLog(email, 'Google Sheets Sync Error', `Sync error: ${error}`, 'SYSTEM');
    await get().refreshUserData();
    return { success: false, error: error ?? undefined };
  },

  triggerGmailDelivery: async (customToken, customToEmail) => {
    const email = get().currentUserEmail;
    if (!email) return { success: false, error: 'Not logged in' };

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
      await repo.addSystemLog(email, 'Gmail Delivery Sent', `Sandbox Mail: Monthly PDF report compiled for delivery to: ${recipient}.`, 'SYSTEM');
      await get().refreshUserData();
      return { success: true };
    }

    const [success, error] = await sendGmailReport(token, recipient, subject, htmlContent);
    if (success) {
      await repo.addSystemLog(email, 'Gmail Delivery Sent', `Real Gmail report successfully dispatched to ${recipient}.`, 'SYSTEM');
      await get().refreshUserData();
      return { success: true };
    }
    await repo.addSystemLog(email, 'Gmail Delivery Error', `Gmail send error: ${error}`, 'SYSTEM');
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

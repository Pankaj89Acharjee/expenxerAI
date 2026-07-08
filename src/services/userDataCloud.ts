import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/services/firebase';
import { calculateSavingMetrics } from '@/src/utils/savingGoals';
import type {
  BudgetTemplate,
  Bill,
  CategoryBudget,
  GroupExpense,
  Liability,
  NotificationLog,
  SavingGoal,
  SplitGroup,
  Subscription,
} from '@/src/types/models';

const USERS = 'users';

function userCol(uid: string, name: string) {
  return collection(getFirebaseFirestore(), USERS, uid, name);
}

function userDoc(uid: string, name: string, id: string) {
  return doc(getFirebaseFirestore(), USERS, uid, name, id);
}

async function saveItem(
  uid: string,
  collectionName: string,
  data: Record<string, unknown>,
  id?: string
): Promise<string> {
  const docId = id ?? doc(userCol(uid, collectionName)).id;
  await setDoc(userDoc(uid, collectionName, docId), { ...data, updatedAt: serverTimestamp() });
  return docId;
}

// --- Liabilities ---
function mapLiabilityDoc(id: string, data: Record<string, unknown>): Liability {
  return {
    id,
    userEmail: String(data.userEmail ?? ''),
    name: String(data.name ?? ''),
    amount: Number(data.amount ?? 0),
    frequency: String(data.frequency ?? ''),
    dueDateMillis: Number(data.dueDateMillis ?? 0),
    isPaid: Boolean(data.isPaid),
    autoRecalculate: data.autoRecalculate !== false,
    paymentScheduleJson: data.paymentScheduleJson != null ? String(data.paymentScheduleJson) : undefined,
    paymentDateMillis:
      data.paymentDateMillis != null && data.paymentDateMillis !== ''
        ? Number(data.paymentDateMillis)
        : null,
    paymentHistoryJson: data.paymentHistoryJson != null ? String(data.paymentHistoryJson) : undefined,
    kind: data.kind === 'LOAN' || data.kind === 'CREDIT_CARD_LOAN' ? data.kind : 'ANNUAL',
    loanType: data.loanType != null ? (String(data.loanType) as Liability['loanType']) : null,
    principal: data.principal != null ? Number(data.principal) : null,
    emiAmount: data.emiAmount != null ? Number(data.emiAmount) : null,
    tenureMonths: data.tenureMonths != null ? Number(data.tenureMonths) : null,
    interestRatePercent: data.interestRatePercent != null ? Number(data.interestRatePercent) : null,
    lender: data.lender != null ? String(data.lender) : null,
  };
}

function liabilityToFirestore(liability: Omit<Liability, 'id'> | Liability) {
  return {
    userEmail: liability.userEmail,
    name: liability.name,
    amount: liability.amount,
    frequency: liability.frequency,
    dueDateMillis: liability.dueDateMillis,
    isPaid: liability.isPaid,
    autoRecalculate: liability.autoRecalculate,
    paymentScheduleJson: liability.paymentScheduleJson ?? '[]',
    paymentDateMillis: liability.paymentDateMillis ?? null,
    paymentHistoryJson: liability.paymentHistoryJson ?? '[]',
    kind: liability.kind ?? 'ANNUAL',
    loanType: liability.loanType ?? null,
    principal: liability.principal ?? null,
    emiAmount: liability.emiAmount ?? null,
    tenureMonths: liability.tenureMonths ?? null,
    interestRatePercent: liability.interestRatePercent ?? null,
    lender: liability.lender ?? null,
  };
}

export async function fetchLiabilities(uid: string): Promise<Liability[]> {
  const snap = await getDocs(userCol(uid, 'liabilities'));
  return snap.docs
    .map((d) => mapLiabilityDoc(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => a.dueDateMillis - b.dueDateMillis);
}

export async function addLiability(uid: string, liability: Omit<Liability, 'id'>): Promise<string> {
  return saveItem(uid, 'liabilities', liabilityToFirestore(liability));
}

export async function updateLiability(uid: string, liability: Liability): Promise<void> {
  await saveItem(uid, 'liabilities', liabilityToFirestore(liability), liability.id);
}

export async function deleteLiability(uid: string, id: string): Promise<void> {
  await deleteDoc(userDoc(uid, 'liabilities', id));
}

// --- Subscriptions ---
export async function fetchSubscriptions(uid: string): Promise<Subscription[]> {
  const snap = await getDocs(userCol(uid, 'subscriptions'));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userEmail: String(data.userEmail ?? ''),
        name: String(data.name ?? ''),
        cost: Number(data.cost ?? 0),
        billingCycle: String(data.billingCycle ?? ''),
        nextPaymentMillis: Number(data.nextPaymentMillis ?? 0),
        category: String(data.category ?? ''),
        isAlertEnabled: data.isAlertEnabled !== false,
        isActive: data.isActive !== false,
        lastPaidMillis: data.lastPaidMillis != null ? Number(data.lastPaidMillis) : null,
        paymentHistoryJson: data.paymentHistoryJson != null ? String(data.paymentHistoryJson) : '[]',
      } satisfies Subscription;
    })
    .sort((a, b) => a.nextPaymentMillis - b.nextPaymentMillis);
}

export async function addSubscription(uid: string, sub: Omit<Subscription, 'id'>): Promise<string> {
  return saveItem(uid, 'subscriptions', {
    userEmail: sub.userEmail,
    name: sub.name,
    cost: sub.cost,
    billingCycle: sub.billingCycle,
    nextPaymentMillis: sub.nextPaymentMillis,
    category: sub.category,
    isAlertEnabled: sub.isAlertEnabled,
    isActive: sub.isActive,
    lastPaidMillis: sub.lastPaidMillis ?? null,
    paymentHistoryJson: sub.paymentHistoryJson ?? '[]',
  });
}

export async function updateSubscription(uid: string, sub: Subscription): Promise<void> {
  await saveItem(uid, 'subscriptions', {
    userEmail: sub.userEmail,
    name: sub.name,
    cost: sub.cost,
    billingCycle: sub.billingCycle,
    nextPaymentMillis: sub.nextPaymentMillis,
    category: sub.category,
    isAlertEnabled: sub.isAlertEnabled,
    isActive: sub.isActive,
    lastPaidMillis: sub.lastPaidMillis ?? null,
    paymentHistoryJson: sub.paymentHistoryJson ?? '[]',
  }, sub.id);
}

export async function deleteSubscription(uid: string, id: string): Promise<void> {
  await deleteDoc(userDoc(uid, 'subscriptions', id));
}

// --- Bills (rent, utilities, school fees) ---
export async function fetchBills(uid: string): Promise<Bill[]> {
  const snap = await getDocs(userCol(uid, 'bills'));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userEmail: String(data.userEmail ?? ''),
        name: String(data.name ?? ''),
        amount: Number(data.amount ?? 0),
        billingCycle: String(data.billingCycle ?? 'MONTHLY'),
        nextPaymentMillis: Number(data.nextPaymentMillis ?? 0),
        category: String(data.category ?? ''),
        isAlertEnabled: data.isAlertEnabled !== false,
        isActive: data.isActive !== false,
        lastPaidMillis: data.lastPaidMillis != null ? Number(data.lastPaidMillis) : null,
        paymentHistoryJson: data.paymentHistoryJson != null ? String(data.paymentHistoryJson) : '[]',
      } satisfies Bill;
    })
    .sort((a, b) => a.nextPaymentMillis - b.nextPaymentMillis);
}

export async function addBill(uid: string, bill: Omit<Bill, 'id'>): Promise<string> {
  return saveItem(uid, 'bills', {
    userEmail: bill.userEmail,
    name: bill.name,
    amount: bill.amount,
    billingCycle: bill.billingCycle,
    nextPaymentMillis: bill.nextPaymentMillis,
    category: bill.category,
    isAlertEnabled: bill.isAlertEnabled,
    isActive: bill.isActive,
    lastPaidMillis: bill.lastPaidMillis ?? null,
    paymentHistoryJson: bill.paymentHistoryJson ?? '[]',
  });
}

export async function updateBill(uid: string, bill: Bill): Promise<void> {
  await saveItem(
    uid,
    'bills',
    {
      userEmail: bill.userEmail,
      name: bill.name,
      amount: bill.amount,
      billingCycle: bill.billingCycle,
      nextPaymentMillis: bill.nextPaymentMillis,
      category: bill.category,
      isAlertEnabled: bill.isAlertEnabled,
      isActive: bill.isActive,
      lastPaidMillis: bill.lastPaidMillis ?? null,
      paymentHistoryJson: bill.paymentHistoryJson ?? '[]',
    },
    bill.id
  );
}

export async function deleteBill(uid: string, id: string): Promise<void> {
  await deleteDoc(userDoc(uid, 'bills', id));
}

// --- Saving Goals ---
export async function fetchSavingGoals(uid: string): Promise<SavingGoal[]> {
  const snap = await getDocs(userCol(uid, 'saving_goals'));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userEmail: String(data.userEmail ?? ''),
        name: String(data.name ?? ''),
        targetAmount: Number(data.targetAmount ?? 0),
        savedAmount: Number(data.savedAmount ?? 0),
        targetDateMillis: Number(data.targetDateMillis ?? 0),
        initialMonthlyContribution: Number(data.initialMonthlyContribution ?? 0),
        currentRequiredMonthly: Number(data.currentRequiredMonthly ?? 0),
        deficit: Number(data.deficit ?? 0),
        surplus: Number(data.surplus ?? 0),
        forecastText: String(data.forecastText ?? ''),
        missedMonthsCount: Number(data.missedMonthsCount ?? 0),
        creationDateMillis: Number(data.creationDateMillis ?? Date.now()),
      } satisfies SavingGoal;
    })
    .sort((a, b) => a.targetDateMillis - b.targetDateMillis);
}

export async function addSavingGoal(uid: string, goal: Omit<SavingGoal, 'id'>): Promise<string> {
  const recalculated = calculateSavingMetrics({ ...goal, id: 'new' });
  return saveItem(uid, 'saving_goals', {
    userEmail: recalculated.userEmail,
    name: recalculated.name,
    targetAmount: recalculated.targetAmount,
    savedAmount: recalculated.savedAmount,
    targetDateMillis: recalculated.targetDateMillis,
    initialMonthlyContribution: recalculated.initialMonthlyContribution,
    currentRequiredMonthly: recalculated.currentRequiredMonthly,
    deficit: recalculated.deficit,
    surplus: recalculated.surplus,
    forecastText: recalculated.forecastText,
    missedMonthsCount: recalculated.missedMonthsCount,
    creationDateMillis: recalculated.creationDateMillis,
  });
}

export async function updateSavingGoal(uid: string, goal: SavingGoal): Promise<void> {
  const recalculated = calculateSavingMetrics(goal);
  await saveItem(uid, 'saving_goals', {
    userEmail: recalculated.userEmail,
    name: recalculated.name,
    targetAmount: recalculated.targetAmount,
    savedAmount: recalculated.savedAmount,
    targetDateMillis: recalculated.targetDateMillis,
    initialMonthlyContribution: recalculated.initialMonthlyContribution,
    currentRequiredMonthly: recalculated.currentRequiredMonthly,
    deficit: recalculated.deficit,
    surplus: recalculated.surplus,
    forecastText: recalculated.forecastText,
    missedMonthsCount: recalculated.missedMonthsCount,
    creationDateMillis: recalculated.creationDateMillis,
  }, goal.id);
}

export async function deleteSavingGoal(uid: string, id: string): Promise<void> {
  await deleteDoc(userDoc(uid, 'saving_goals', id));
}

// --- Split Groups ---
export async function fetchGroups(uid: string): Promise<SplitGroup[]> {
  const snap = await getDocs(userCol(uid, 'split_groups'));
  return snap.docs
    .map((d) => {
      const data = d.data();
      const members = data.members;
      return {
        id: d.id,
        userEmail: String(data.userEmail ?? ''),
        name: String(data.name ?? ''),
        members: Array.isArray(members) ? members.map(String) : JSON.parse(String(data.membersJson ?? '[]')),
      } satisfies SplitGroup;
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}

export async function createGroup(uid: string, group: Omit<SplitGroup, 'id'>): Promise<string> {
  return saveItem(uid, 'split_groups', {
    userEmail: group.userEmail,
    name: group.name,
    members: group.members,
  });
}

// --- Group Expenses ---
export async function fetchGroupExpenses(uid: string, groupId: string): Promise<GroupExpense[]> {
  const snap = await getDocs(
    query(userCol(uid, 'group_expenses'), where('groupId', '==', groupId))
  );
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userEmail: String(data.userEmail ?? ''),
        groupId: String(data.groupId ?? ''),
        title: String(data.title ?? ''),
        amount: Number(data.amount ?? 0),
        paidBy: String(data.paidBy ?? ''),
        splitType: String(data.splitType ?? 'EQUAL'),
        splitsJson: String(data.splitsJson ?? '{}'),
        dateMillis: Number(data.dateMillis ?? Date.now()),
      } satisfies GroupExpense;
    })
    .sort((a, b) => b.dateMillis - a.dateMillis);
}

export async function addGroupExpense(uid: string, expense: Omit<GroupExpense, 'id'>): Promise<string> {
  return saveItem(uid, 'group_expenses', {
    userEmail: expense.userEmail,
    groupId: expense.groupId,
    title: expense.title,
    amount: expense.amount,
    paidBy: expense.paidBy,
    splitType: expense.splitType,
    splitsJson: expense.splitsJson,
    dateMillis: expense.dateMillis,
  });
}

// --- Notification Logs ---
export async function fetchLogs(uid: string): Promise<NotificationLog[]> {
  const snap = await getDocs(userCol(uid, 'notification_logs'));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userEmail: String(data.userEmail ?? ''),
        title: String(data.title ?? ''),
        message: String(data.message ?? ''),
        timestamp: Number(data.timestamp ?? 0),
        type: String(data.type ?? 'SYSTEM'),
      } satisfies NotificationLog;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function addCloudLog(
  uid: string,
  userEmail: string,
  title: string,
  message: string,
  type: string
): Promise<void> {
  await saveItem(uid, 'notification_logs', {
    userEmail,
    title,
    message,
    timestamp: Date.now(),
    type,
  });
}

// --- Budget Templates ---
export async function fetchTemplates(uid: string): Promise<BudgetTemplate[]> {
  const snap = await getDocs(userCol(uid, 'budget_templates'));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userEmail: String(data.userEmail ?? ''),
        name: String(data.name ?? ''),
        monthlyIncome: Number(data.monthlyIncome ?? 0),
        allocationsJson: String(data.allocationsJson ?? '{}'),
        savingsGoalsJson: String(data.savingsGoalsJson ?? '{}'),
      } satisfies BudgetTemplate;
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}

export async function addTemplate(uid: string, template: Omit<BudgetTemplate, 'id'>): Promise<string> {
  return saveItem(uid, 'budget_templates', {
    userEmail: template.userEmail,
    name: template.name,
    monthlyIncome: template.monthlyIncome,
    allocationsJson: template.allocationsJson,
    savingsGoalsJson: template.savingsGoalsJson,
  });
}

export async function deleteTemplate(uid: string, id: string): Promise<void> {
  await deleteDoc(userDoc(uid, 'budget_templates', id));
}

// --- Category Budgets ---
export async function fetchCategoryBudgets(uid: string, monthYear: string): Promise<CategoryBudget[]> {
  const snap = await getDocs(
    query(userCol(uid, 'category_budgets'), where('monthYear', '==', monthYear))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userEmail: String(data.userEmail ?? ''),
      category: String(data.category ?? ''),
      limitAmount: Number(data.limitAmount ?? 0),
      monthYear: String(data.monthYear ?? monthYear),
    } satisfies CategoryBudget;
  });
}

export async function saveCategoryBudgets(uid: string, budgets: Omit<CategoryBudget, 'id'>[]): Promise<void> {
  for (const b of budgets) {
    await saveItem(uid, 'category_budgets', {
      userEmail: b.userEmail,
      category: b.category,
      limitAmount: b.limitAmount,
      monthYear: b.monthYear,
    });
  }
}

export async function deleteCategoryBudgetsForMonth(uid: string, userEmail: string, monthYear: string): Promise<void> {
  const existing = await fetchCategoryBudgets(uid, monthYear);
  await Promise.all(existing.map((b) => deleteDoc(userDoc(uid, 'category_budgets', b.id))));
}

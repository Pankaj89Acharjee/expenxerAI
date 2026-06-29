import { getDatabase } from './database';
import type {
  BudgetTemplate,
  CategoryBudget,
  Expense,
  GroupExpense,
  Liability,
  NotificationLog,
  SavingGoal,
  SplitGroup,
  Subscription,
  UserProfile,
} from '@/src/types/models';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function calculateSavingMetrics(goal: SavingGoal): SavingGoal {
  const now = Date.now();
  const remainingMillis = goal.targetDateMillis - now;
  const monthsRemaining = Math.max(remainingMillis / MONTH_MS, 1);
  const remainingToSave = Math.max(goal.targetAmount - goal.savedAmount, 0);
  const currentRequiredMonthly = remainingToSave / monthsRemaining;

  const elapsedMillis = now - goal.creationDateMillis;
  const elapsedMonths = Math.max(elapsedMillis / MONTH_MS, 0);
  const expectedSaved = goal.initialMonthlyContribution * elapsedMonths;
  const difference = goal.savedAmount - expectedSaved;
  const surplus = difference > 0 ? difference : 0;
  const deficit = difference < 0 ? -difference : 0;

  const expectedWithMargin = goal.initialMonthlyContribution * Math.floor(elapsedMonths);
  const missedMonths =
    goal.savedAmount < expectedWithMargin
      ? Math.max(
          0,
          Math.floor((expectedWithMargin - goal.savedAmount) / goal.initialMonthlyContribution)
        )
      : 0;

  const monthlySavingRate =
    elapsedMonths > 0.1 ? goal.savedAmount / elapsedMonths : goal.initialMonthlyContribution;

  let forecastText: string;
  if (goal.savedAmount >= goal.targetAmount) {
    forecastText = `Goal achieved! 🎉 You have saved the full target of ₹${goal.targetAmount.toFixed(2)}.`;
  } else if (monthlySavingRate <= 0) {
    forecastText =
      'Alert: You currently have no active saving momentum. Please contribute to start forecasting.';
  } else {
    const estimatedMonthsToTarget = remainingToSave / monthlySavingRate;
    const estimatedCompletionMillis = now + estimatedMonthsToTarget * MONTH_MS;
    const d = new Date(estimatedCompletionMillis);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (estimatedCompletionMillis <= goal.targetDateMillis) {
      forecastText = `On Track! 🚀 Projected completion by ${dateStr} (ahead of deadline).`;
    } else {
      forecastText = `Behind Schedule. ⚠️ Current momentum pushes achievement to ${dateStr}. Increase savings by ₹${(currentRequiredMonthly - monthlySavingRate).toFixed(2)}/mo to realign.`;
    }
  }

  return {
    ...goal,
    currentRequiredMonthly,
    deficit,
    surplus,
    missedMonthsCount: missedMonths,
    forecastText,
  };
}

// --- User Profile ---
type UserProfileRow = {
  email: string;
  displayName: string;
  photoUrl: string | null;
  monthlyIncome: number;
  baseSavingsRatePercent: number;
  alertPreference: number;
  designation?: string | null;
  addressLine?: string | null;
  town?: string | null;
  policeStation?: string | null;
  district?: string | null;
  pinCode?: string | null;
  state?: string | null;
  areaOfInterest?: string | null;
  splitwiseHandle?: string | null;
};

function mapUserProfile(row: UserProfileRow): UserProfile {
  return {
    email: row.email,
    displayName: row.displayName,
    photoUrl: row.photoUrl,
    monthlyIncome: row.monthlyIncome,
    baseSavingsRatePercent: row.baseSavingsRatePercent,
    alertPreference: row.alertPreference === 1,
    designation: row.designation ?? null,
    addressLine: row.addressLine ?? null,
    town: row.town ?? null,
    policeStation: row.policeStation ?? null,
    district: row.district ?? null,
    pinCode: row.pinCode ?? null,
    state: row.state ?? null,
    areaOfInterest: row.areaOfInterest ?? null,
    splitwiseHandle: row.splitwiseHandle ?? null,
  };
}

export async function getUserProfile(email: string): Promise<UserProfile | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<UserProfileRow>(
    'SELECT * FROM user_profiles WHERE email = ?',
    [email]
  );
  if (!row) return null;
  return mapUserProfile(row);
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO user_profiles (
      email, displayName, photoUrl, monthlyIncome, baseSavingsRatePercent, alertPreference,
      designation, addressLine, town, policeStation, district, pinCode, state, areaOfInterest, splitwiseHandle
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profile.email,
      profile.displayName,
      profile.photoUrl ?? null,
      profile.monthlyIncome,
      profile.baseSavingsRatePercent,
      profile.alertPreference ? 1 : 0,
      profile.designation ?? null,
      profile.addressLine ?? null,
      profile.town ?? null,
      profile.policeStation ?? null,
      profile.district ?? null,
      profile.pinCode ?? null,
      profile.state ?? null,
      profile.areaOfInterest ?? null,
      profile.splitwiseHandle ?? null,
    ]
  );
}

// --- Expenses ---
export async function getAllExpenses(userEmail: string): Promise<Expense[]> {
  const db = await getDatabase();
  return db.getAllAsync<Expense>(
    'SELECT * FROM expenses WHERE userEmail = ? ORDER BY dateMillis DESC',
    [userEmail]
  );
}

export async function addExpense(expense: Omit<Expense, 'id'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO expenses (userEmail, title, amount, category, dateMillis, notes, receiptPath)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      expense.userEmail,
      expense.title,
      expense.amount,
      expense.category,
      expense.dateMillis,
      expense.notes,
      expense.receiptPath ?? null,
    ]
  );
  await addSystemLog(
    expense.userEmail,
    'Expense Logged',
    `Logged expense of ₹${expense.amount} for '${expense.title}'`,
    'SYSTEM'
  );
  return result.lastInsertRowId;
}

export async function updateExpense(expense: Expense): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE expenses SET title=?, amount=?, category=?, dateMillis=?, notes=?, receiptPath=? WHERE id=?`,
    [expense.title, expense.amount, expense.category, expense.dateMillis, expense.notes, expense.receiptPath ?? null, expense.id]
  );
}

export async function deleteExpense(expense: Expense): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [expense.id]);
}

// --- Liabilities ---
export async function getAllLiabilities(userEmail: string): Promise<Liability[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Omit<Liability, 'isPaid' | 'autoRecalculate'> & { isPaid: number; autoRecalculate: number }>(
    'SELECT * FROM liabilities WHERE userEmail = ? ORDER BY dueDateMillis ASC',
    [userEmail]
  );
  return rows.map((r) => ({ ...r, isPaid: r.isPaid === 1, autoRecalculate: r.autoRecalculate === 1 }));
}

export async function addLiability(liability: Omit<Liability, 'id'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO liabilities (userEmail, name, amount, frequency, category, dueDateMillis, isPaid, autoRecalculate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      liability.userEmail,
      liability.name,
      liability.amount,
      liability.frequency,
      liability.category,
      liability.dueDateMillis,
      liability.isPaid ? 1 : 0,
      liability.autoRecalculate ? 1 : 0,
    ]
  );
  await addSystemLog(
    liability.userEmail,
    'Liability Created',
    `New ${liability.frequency.toLowerCase()} liability '${liability.name}' set for ₹${liability.amount}.`,
    'LIABILITY'
  );
  return result.lastInsertRowId;
}

export async function updateLiability(liability: Liability): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE liabilities SET name=?, amount=?, frequency=?, category=?, dueDateMillis=?, isPaid=?, autoRecalculate=? WHERE id=?`,
    [
      liability.name,
      liability.amount,
      liability.frequency,
      liability.category,
      liability.dueDateMillis,
      liability.isPaid ? 1 : 0,
      liability.autoRecalculate ? 1 : 0,
      liability.id,
    ]
  );
}

export async function deleteLiability(liability: Liability): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM liabilities WHERE id = ?', [liability.id]);
}

// --- Subscriptions ---
export async function getAllSubscriptions(userEmail: string): Promise<Subscription[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Omit<Subscription, 'isAlertEnabled'> & { isAlertEnabled: number }>(
    'SELECT * FROM subscriptions WHERE userEmail = ? ORDER BY nextPaymentMillis ASC',
    [userEmail]
  );
  return rows.map((r) => ({ ...r, isAlertEnabled: r.isAlertEnabled === 1 }));
}

export async function addSubscription(sub: Omit<Subscription, 'id'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO subscriptions (userEmail, name, cost, billingCycle, nextPaymentMillis, category, isAlertEnabled, lastPaidMillis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sub.userEmail,
      sub.name,
      sub.cost,
      sub.billingCycle,
      sub.nextPaymentMillis,
      sub.category,
      sub.isAlertEnabled ? 1 : 0,
      sub.lastPaidMillis ?? null,
    ]
  );
  await addSystemLog(
    sub.userEmail,
    'Subscription Tracked',
    `Subscribed to '${sub.name}' for ₹${sub.cost}/month.`,
    'SUBSCRIPTION'
  );
  return result.lastInsertRowId;
}

export async function updateSubscription(sub: Subscription): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE subscriptions SET name=?, cost=?, billingCycle=?, nextPaymentMillis=?, category=?, isAlertEnabled=?, lastPaidMillis=? WHERE id=?`,
    [
      sub.name,
      sub.cost,
      sub.billingCycle,
      sub.nextPaymentMillis,
      sub.category,
      sub.isAlertEnabled ? 1 : 0,
      sub.lastPaidMillis ?? null,
      sub.id,
    ]
  );
}

export async function deleteSubscription(sub: Subscription): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM subscriptions WHERE id = ?', [sub.id]);
}

// --- Saving Goals ---
export async function getAllSavingGoals(userEmail: string): Promise<SavingGoal[]> {
  const db = await getDatabase();
  return db.getAllAsync<SavingGoal>(
    'SELECT * FROM saving_goals WHERE userEmail = ? ORDER BY targetDateMillis ASC',
    [userEmail]
  );
}

export async function addSavingGoal(goal: Omit<SavingGoal, 'id'>): Promise<number> {
  const recalculated = calculateSavingMetrics({ ...goal, id: 0 });
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO saving_goals (userEmail, name, targetAmount, savedAmount, targetDateMillis, initialMonthlyContribution, currentRequiredMonthly, deficit, surplus, forecastText, missedMonthsCount, creationDateMillis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recalculated.userEmail,
      recalculated.name,
      recalculated.targetAmount,
      recalculated.savedAmount,
      recalculated.targetDateMillis,
      recalculated.initialMonthlyContribution,
      recalculated.currentRequiredMonthly,
      recalculated.deficit,
      recalculated.surplus,
      recalculated.forecastText,
      recalculated.missedMonthsCount,
      recalculated.creationDateMillis,
    ]
  );
  await addSystemLog(
    goal.userEmail,
    'Savings Goal Configured',
    `Goal '${goal.name}' initialized with target of ₹${goal.targetAmount}.`,
    'SYSTEM'
  );
  return result.lastInsertRowId;
}

export async function updateSavingGoal(goal: SavingGoal): Promise<void> {
  const recalculated = calculateSavingMetrics(goal);
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE saving_goals SET name=?, targetAmount=?, savedAmount=?, targetDateMillis=?, initialMonthlyContribution=?, currentRequiredMonthly=?, deficit=?, surplus=?, forecastText=?, missedMonthsCount=? WHERE id=?`,
    [
      recalculated.name,
      recalculated.targetAmount,
      recalculated.savedAmount,
      recalculated.targetDateMillis,
      recalculated.initialMonthlyContribution,
      recalculated.currentRequiredMonthly,
      recalculated.deficit,
      recalculated.surplus,
      recalculated.forecastText,
      recalculated.missedMonthsCount,
      recalculated.id,
    ]
  );
}

export async function deleteSavingGoal(goal: SavingGoal): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM saving_goals WHERE id = ?', [goal.id]);
}

// --- Split Groups ---
export async function getAllGroups(userEmail: string): Promise<SplitGroup[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: number; userEmail: string; name: string; membersJson: string }>(
    'SELECT * FROM split_groups WHERE userEmail = ? ORDER BY id DESC',
    [userEmail]
  );
  return rows.map((r) => ({ id: r.id, userEmail: r.userEmail, name: r.name, members: JSON.parse(r.membersJson) }));
}

export async function createGroup(group: Omit<SplitGroup, 'id'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO split_groups (userEmail, name, membersJson) VALUES (?, ?, ?)',
    [group.userEmail, group.name, JSON.stringify(group.members)]
  );
  await addSystemLog(
    group.userEmail,
    'Group Created',
    `Split group '${group.name}' created with ${group.members.length} members.`,
    'SYSTEM'
  );
  return result.lastInsertRowId;
}

// --- Group Expenses ---
export async function getExpensesForGroup(groupId: number): Promise<GroupExpense[]> {
  const db = await getDatabase();
  return db.getAllAsync<GroupExpense>(
    'SELECT * FROM group_expenses WHERE groupId = ? ORDER BY dateMillis DESC',
    [groupId]
  );
}

export async function addGroupExpense(expense: Omit<GroupExpense, 'id'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO group_expenses (userEmail, groupId, title, amount, paidBy, splitType, splitsJson, dateMillis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      expense.userEmail,
      expense.groupId,
      expense.title,
      expense.amount,
      expense.paidBy,
      expense.splitType,
      expense.splitsJson,
      expense.dateMillis,
    ]
  );
  await addSystemLog(
    expense.userEmail,
    'Split Expense',
    `Split expense '${expense.title}' for ₹${expense.amount} added to group.`,
    'SYSTEM'
  );
  return result.lastInsertRowId;
}

// --- Budget Templates ---
export async function getAllTemplates(userEmail: string): Promise<BudgetTemplate[]> {
  const db = await getDatabase();
  return db.getAllAsync<BudgetTemplate>(
    'SELECT * FROM budget_templates WHERE userEmail = ? ORDER BY id DESC',
    [userEmail]
  );
}

export async function addTemplate(template: Omit<BudgetTemplate, 'id'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO budget_templates (userEmail, name, monthlyIncome, allocationsJson, savingsGoalsJson) VALUES (?, ?, ?, ?, ?)',
    [template.userEmail, template.name, template.monthlyIncome, template.allocationsJson, template.savingsGoalsJson]
  );
  await addSystemLog(
    template.userEmail,
    'Template Saved',
    `Budget template '${template.name}' successfully defined.`,
    'SYSTEM'
  );
  return result.lastInsertRowId;
}

export async function deleteTemplate(template: BudgetTemplate): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM budget_templates WHERE id = ?', [template.id]);
}

// --- Category Budgets ---
export async function getBudgetsForMonth(userEmail: string, monthYear: string): Promise<CategoryBudget[]> {
  const db = await getDatabase();
  return db.getAllAsync<CategoryBudget>(
    'SELECT * FROM category_budgets WHERE userEmail = ? AND monthYear = ?',
    [userEmail, monthYear]
  );
}

export async function saveCategoryBudgets(budgets: Omit<CategoryBudget, 'id'>[]): Promise<void> {
  const db = await getDatabase();
  for (const b of budgets) {
    await db.runAsync(
      'INSERT INTO category_budgets (userEmail, category, limitAmount, monthYear) VALUES (?, ?, ?, ?)',
      [b.userEmail, b.category, b.limitAmount, b.monthYear]
    );
  }
}

export async function deleteBudgetsForMonth(userEmail: string, monthYear: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM category_budgets WHERE userEmail = ? AND monthYear = ?', [userEmail, monthYear]);
}

// --- Logs ---
export async function getAllLogs(userEmail: string): Promise<NotificationLog[]> {
  const db = await getDatabase();
  return db.getAllAsync<NotificationLog>(
    'SELECT * FROM notification_logs WHERE userEmail = ? ORDER BY timestamp DESC',
    [userEmail]
  );
}

export async function addSystemLog(
  userEmail: string,
  title: string,
  message: string,
  type: string
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO notification_logs (userEmail, title, message, timestamp, type) VALUES (?, ?, ?, ?, ?)',
    [userEmail, title, message, Date.now(), type]
  );
  return result.lastInsertRowId;
}

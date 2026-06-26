import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('futurefund_database');
    await initSchema(dbInstance);
  }
  return dbInstance;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS user_profiles (
      email TEXT PRIMARY KEY NOT NULL,
      displayName TEXT NOT NULL,
      photoUrl TEXT,
      monthlyIncome REAL NOT NULL DEFAULT 5000,
      baseSavingsRatePercent REAL NOT NULL DEFAULT 20,
      alertPreference INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userEmail TEXT NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      dateMillis INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      receiptPath TEXT
    );

    CREATE TABLE IF NOT EXISTS liabilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userEmail TEXT NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      frequency TEXT NOT NULL,
      category TEXT NOT NULL,
      dueDateMillis INTEGER NOT NULL,
      isPaid INTEGER NOT NULL DEFAULT 0,
      autoRecalculate INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userEmail TEXT NOT NULL,
      name TEXT NOT NULL,
      cost REAL NOT NULL,
      billingCycle TEXT NOT NULL,
      nextPaymentMillis INTEGER NOT NULL,
      category TEXT NOT NULL,
      isAlertEnabled INTEGER NOT NULL DEFAULT 1,
      lastPaidMillis INTEGER
    );

    CREATE TABLE IF NOT EXISTS saving_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userEmail TEXT NOT NULL,
      name TEXT NOT NULL,
      targetAmount REAL NOT NULL,
      savedAmount REAL NOT NULL DEFAULT 0,
      targetDateMillis INTEGER NOT NULL,
      initialMonthlyContribution REAL NOT NULL,
      currentRequiredMonthly REAL NOT NULL,
      deficit REAL NOT NULL DEFAULT 0,
      surplus REAL NOT NULL DEFAULT 0,
      forecastText TEXT NOT NULL DEFAULT '',
      missedMonthsCount INTEGER NOT NULL DEFAULT 0,
      creationDateMillis INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS split_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userEmail TEXT NOT NULL,
      name TEXT NOT NULL,
      membersJson TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userEmail TEXT NOT NULL,
      groupId INTEGER NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      paidBy TEXT NOT NULL,
      splitType TEXT NOT NULL,
      splitsJson TEXT NOT NULL,
      dateMillis INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userEmail TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userEmail TEXT NOT NULL,
      name TEXT NOT NULL,
      monthlyIncome REAL NOT NULL,
      allocationsJson TEXT NOT NULL,
      savingsGoalsJson TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userEmail TEXT NOT NULL,
      category TEXT NOT NULL,
      limitAmount REAL NOT NULL,
      monthYear TEXT NOT NULL
    );
  `);
}

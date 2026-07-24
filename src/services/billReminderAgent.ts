import '@/src/polyfills/webCrypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import type { Bill, Expense, Liability, UserProfile } from '@/src/types/models';
import { getNextUnpaidInstallment, isLiabilityFullyPaid } from '@/src/utils/liabilitySchedule';
import { getRecurringPaymentStatus, startOfDay } from '@/src/utils/recurringBilling';
import { scheduleLocalReminderNotification } from '@/src/services/pushNotifications';
import { planBillReminderActions } from '@/src/services/gemini';

const DAY_MS = 86_400_000;
export const REMINDER_LEAD_DAYS = 2;

export type BillReminderInsight = {
  key: string;
  sourceId: string;
  kind: 'bill' | 'emi' | 'liability';
  name: string;
  amount: number;
  dueDateMillis: number;
  daysUntilDue: number;
  status: 'upcoming' | 'due_soon' | 'overdue';
  availableSurplus: number;
  canPayFromSurplus: boolean;
  message: string;
  action: 'notify' | 'schedule' | 'defer';
  reasoning: string;
};

function currentMonthStart(now: number): number {
  const date = new Date(now);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function daysBetweenLocalDates(fromMillis: number, toMillis: number): number {
  return Math.round((startOfDay(toMillis) - startOfDay(fromMillis)) / DAY_MS);
}

function reminderMessage(
  name: string,
  amount: number,
  status: BillReminderInsight['status'],
  daysUntilDue: number,
  surplus: number,
  canPay: boolean
): string {
  const amountText = `₹${amount.toLocaleString('en-IN')}`;
  const timing = status === 'overdue'
    ? `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'} overdue`
    : daysUntilDue === 0
      ? 'due today'
      : `due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;
  if (canPay) {
    return `${name} (${amountText}) is ${timing}. You have ₹${surplus.toLocaleString('en-IN')} available—consider paying it from surplus.`;
  }
  return `${name} (${amountText}) is ${timing}. Current monthly surplus is ₹${surplus.toLocaleString('en-IN')}; review your plan before paying.`;
}

export function buildBillReminderInsights(input: {
  profile: UserProfile | null;
  expenses: readonly Expense[];
  bills: readonly Bill[];
  liabilities: readonly Liability[];
  now?: number;
}): BillReminderInsight[] {
  const now = input.now ?? Date.now();
  const monthStart = currentMonthStart(now);
  const spentThisMonth = input.expenses
    .filter((expense) => expense.dateMillis >= monthStart && expense.dateMillis <= now)
    .reduce((sum, expense) => sum + expense.amount, 0);
  let remainingSurplus = Math.max(0, (input.profile?.monthlyIncome ?? 0) - spentThisMonth);

  const candidates: Omit<
    BillReminderInsight,
    'availableSurplus' | 'canPayFromSurplus' | 'message' | 'action' | 'reasoning'
  >[] = [];
  for (const bill of input.bills) {
    if (!bill.isActive || !bill.isAlertEnabled) continue;
    const status = getRecurringPaymentStatus(bill.nextPaymentMillis, bill.lastPaidMillis, now);
    const daysUntilDue = daysBetweenLocalDates(now, bill.nextPaymentMillis);
    if (status === 'paid') continue;
    candidates.push({
      key: `bill:${bill.id}:${bill.nextPaymentMillis}`,
      sourceId: bill.id,
      kind: 'bill',
      name: bill.name,
      amount: bill.amount,
      dueDateMillis: bill.nextPaymentMillis,
      daysUntilDue,
      status: daysUntilDue < 0 ? 'overdue' : daysUntilDue <= REMINDER_LEAD_DAYS ? 'due_soon' : 'upcoming',
    });
  }

  for (const liability of input.liabilities) {
    if (isLiabilityFullyPaid(liability)) continue;
    const installment = getNextUnpaidInstallment(liability);
    if (!installment) continue;
    const daysUntilDue = daysBetweenLocalDates(now, installment.dueDateMillis);
    candidates.push({
      key: `${liability.kind === 'LOAN' || liability.kind === 'CREDIT_CARD_LOAN' ? 'emi' : 'liability'}:${liability.id}:${installment.dueDateMillis}`,
      sourceId: liability.id,
      kind: liability.kind === 'LOAN' || liability.kind === 'CREDIT_CARD_LOAN' ? 'emi' : 'liability',
      name: liability.name,
      amount: installment.amount,
      dueDateMillis: installment.dueDateMillis,
      daysUntilDue,
      status: daysUntilDue < 0 ? 'overdue' : daysUntilDue <= REMINDER_LEAD_DAYS ? 'due_soon' : 'upcoming',
    });
  }

  return candidates
    .sort((a, b) => a.dueDateMillis - b.dueDateMillis)
    .map((candidate) => {
      const availableSurplus = Math.round(remainingSurplus * 100) / 100;
      const canPayFromSurplus = availableSurplus >= candidate.amount;
      const insight: BillReminderInsight = {
        ...candidate,
        availableSurplus,
        canPayFromSurplus,
        message: reminderMessage(
          candidate.name,
          candidate.amount,
          candidate.status,
          candidate.daysUntilDue,
          availableSurplus,
          canPayFromSurplus
        ),
        action: candidate.status === 'upcoming' ? 'schedule' : 'notify',
        reasoning: 'Fallback plan generated from verified due date and available monthly surplus.',
      };
      if (canPayFromSurplus) remainingSurplus -= candidate.amount;
      return insight;
    });
}

/** Schedule stable local reminders and return insights that should be logged today. */
export async function scheduleBillReminderAgent(
  uid: string,
  insights: readonly BillReminderInsight[],
  now = Date.now()
): Promise<BillReminderInsight[]> {
  const todayKey = new Date(now).toLocaleDateString('en-CA');
  const storageKey = `bill_reminder_agent_seen:${uid}`;
  let seen: Record<string, string> = {};
  try {
    seen = JSON.parse((await AsyncStorage.getItem(storageKey)) ?? '{}') as Record<string, string>;
  } catch {
    seen = {};
  }

  const newlyNotified: BillReminderInsight[] = [];
  for (const insight of insights.filter((item) => item.action !== 'defer')) {
    const identifier = `bill-reminder-${insight.key}`.replace(/[^a-zA-Z0-9._-]/g, '-');
    const reminderAt = new Date(insight.dueDateMillis);
    reminderAt.setDate(reminderAt.getDate() - REMINDER_LEAD_DAYS);
    reminderAt.setHours(9, 0, 0, 0);
    const triggerMillis = reminderAt.getTime() > now ? reminderAt.getTime() : null;

    if (triggerMillis != null || seen[insight.key] !== todayKey) {
      await scheduleLocalReminderNotification(
        identifier,
        insight.status === 'overdue' ? 'Payment overdue' : 'Payment reminder',
        insight.message,
        triggerMillis,
        { tab: 'planner' }
      );
    }
    if (triggerMillis == null && seen[insight.key] !== todayKey) {
      seen[insight.key] = todayKey;
      newlyNotified.push(insight);
    }
  }
  await AsyncStorage.setItem(storageKey, JSON.stringify(seen));
  return newlyNotified;
}

const ReminderAgentState = Annotation.Root({
  uid: Annotation<string>(),
  profile: Annotation<UserProfile | null>(),
  expenses: Annotation<readonly Expense[]>(),
  bills: Annotation<readonly Bill[]>(),
  liabilities: Annotation<readonly Liability[]>(),
  now: Annotation<number>(),
  insights: Annotation<BillReminderInsight[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  newlyNotified: Annotation<BillReminderInsight[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
});

async function discoverAndAnalyzeNode(
  state: typeof ReminderAgentState.State
): Promise<Partial<typeof ReminderAgentState.State>> {
  return {
    insights: buildBillReminderInsights({
      profile: state.profile,
      expenses: state.expenses,
      bills: state.bills,
      liabilities: state.liabilities,
      now: state.now,
    }),
  };
}

async function planningNode(
  state: typeof ReminderAgentState.State
): Promise<Partial<typeof ReminderAgentState.State>> {
  const modelPlans = await planBillReminderActions(state.insights);
  const plansByKey = new Map(modelPlans.map((plan) => [plan.key, plan]));
  return {
    insights: state.insights.map((insight) => {
      const plan = plansByKey.get(insight.key);
      if (!plan) return insight;
      const action = insight.status === 'upcoming'
        ? plan.action
        : 'notify'; // due and overdue obligations may not be silently deferred
      const recommendPayFromSurplus = insight.canPayFromSurplus && plan.recommendPayFromSurplus;
      const safeMessage = !insight.canPayFromSurplus && plan.recommendPayFromSurplus
        ? insight.message
        : plan.message || insight.message;
      return {
        ...insight,
        action,
        canPayFromSurplus: recommendPayFromSurplus,
        message: safeMessage,
        reasoning: plan.reasoning,
      };
    }),
  };
}

function routeAfterPlanning(state: typeof ReminderAgentState.State): 'notificationTools' | 'persistRun' {
  return state.insights.some((insight) => insight.action !== 'defer')
    ? 'notificationTools'
    : 'persistRun';
}

async function notificationToolsNode(
  state: typeof ReminderAgentState.State
): Promise<Partial<typeof ReminderAgentState.State>> {
  return {
    newlyNotified: await scheduleBillReminderAgent(state.uid, state.insights, state.now),
  };
}

async function persistRunNode(
  state: typeof ReminderAgentState.State
): Promise<Partial<typeof ReminderAgentState.State>> {
  await AsyncStorage.setItem(
    `bill_reminder_agent_run:${state.uid}`,
    JSON.stringify({
      ranAtMillis: state.now,
      graph: 'billReminderAgentGraph',
      plans: state.insights.map((insight) => ({
        key: insight.key,
        action: insight.action,
        reasoning: insight.reasoning,
        canPayFromSurplus: insight.canPayFromSurplus,
      })),
      notifiedKeys: state.newlyNotified.map((insight) => insight.key),
    })
  );
  return {};
}

export const billReminderAgentGraph = new StateGraph(ReminderAgentState)
  .addNode('discoverAndAnalyze', discoverAndAnalyzeNode)
  .addNode('planWithGemini', planningNode)
  .addNode('notificationTools', notificationToolsNode)
  .addNode('persistRun', persistRunNode)
  .addEdge(START, 'discoverAndAnalyze')
  .addEdge('discoverAndAnalyze', 'planWithGemini')
  .addConditionalEdges('planWithGemini', routeAfterPlanning, {
    notificationTools: 'notificationTools',
    persistRun: 'persistRun',
  })
  .addEdge('notificationTools', 'persistRun')
  .addEdge('persistRun', END)
  .compile();

export async function runBillReminderAgentGraph(input: {
  uid: string;
  profile: UserProfile | null;
  expenses: readonly Expense[];
  bills: readonly Bill[];
  liabilities: readonly Liability[];
  now?: number;
}): Promise<{ insights: BillReminderInsight[]; newlyNotified: BillReminderInsight[] }> {
  const result = await billReminderAgentGraph.invoke(
    {
      ...input,
      now: input.now ?? Date.now(),
      insights: [],
      newlyNotified: [],
    },
    {
      streamMode: 'values',
      tags: ['bill-reminder-agent'],
      metadata: { agent: 'bill-reminder' },
      configurable: {},
    }
  );
  return { insights: result.insights, newlyNotified: result.newlyNotified };
}

import '@/src/polyfills/webCrypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { Platform } from 'react-native';
import { scanReceiptImage } from '@/src/services/gemini';
import { FORM_CATEGORIES } from '@/src/constants/categories';
import type { Expense, ReceiptExpenseDraft, ReceiptScanFinding } from '@/src/types/models';

const ReceiptAgentState = Annotation.Root({
  runId: Annotation<string>(),
  imageUri: Annotation<string>(),
  mimeType: Annotation<string>(),
  existingExpenses: Annotation<readonly Expense[]>(),
  finding: Annotation<ReceiptScanFinding | null>(),
  drafts: Annotation<ReceiptExpenseDraft[]>(),
  status: Annotation<'scanning' | 'awaiting_approval' | 'failed'>(),
  error: Annotation<string | null>(),
});

function parseReceiptLocalDate(value: string | null): number {
  if (!value) return new Date().setHours(0, 0, 0, 0);
  const [year, month, day] = value.split('-').map(Number);
  const local = new Date(year, month - 1, day);
  local.setHours(0, 0, 0, 0);
  return Number.isFinite(local.getTime()) && local.getFullYear() === year && local.getMonth() === month - 1
    ? local.getTime()
    : new Date().setHours(0, 0, 0, 0);
}

async function receiptScanAgentNode(state: typeof ReceiptAgentState.State) {
  try {
    return { finding: await scanReceiptImage(state.imageUri, state.mimeType), status: 'scanning' as const };
  } catch (error) {
    return {
      status: 'failed' as const,
      error: `Receipt Scan Agent failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function routeAfterScan(state: typeof ReceiptAgentState.State): 'expenseLoggerAgent' | 'persistRun' {
  return state.finding ? 'expenseLoggerAgent' : 'persistRun';
}

async function expenseLoggerAgentNode(state: typeof ReceiptAgentState.State) {
  try {
    const finding = state.finding;
    if (!finding) return { status: 'failed' as const, error: 'Expense Logger Agent received no scan findings.' };
    const dateMillis = parseReceiptLocalDate(finding.receiptDate ?? null);
    const warnings = Array.isArray(finding.warnings) ? [...finding.warnings] : [];
    if (finding.totalAmount == null) warnings.push('Final amount could not be read.');
    if (!finding.receiptDate) warnings.push('Receipt date could not be read; device date was selected.');
    const existingExpenses = Array.isArray(state.existingExpenses) ? state.existingExpenses : [];
    const groups = finding.expenseGroups.length > 0
      ? finding.expenseGroups
      : [{
          title: finding.merchant ? `Purchase from ${finding.merchant}` : 'Receipt purchase',
          amount: finding.totalAmount ?? 0,
          category: finding.suggestedCategory,
          itemNames: finding.lineItems.map((item) => item.name),
        }];
    const drafts = groups.filter((group) => group.amount > 0).map((group) => {
      const category = FORM_CATEGORIES.find((item) => item === group.category) ?? 'Other';
      const duplicate = existingExpenses.find((expense) =>
        Math.abs(expense.amount - group.amount) < 0.01
        && Math.abs(expense.dateMillis - dateMillis) < 86_400_000
        && expense.title.trim().toLowerCase() === group.title.trim().toLowerCase()
      ) ?? null;
      const draftWarnings = [...warnings];
      if (duplicate) draftWarnings.push('Possible duplicate expense already exists.');
      const itemSummary = group.itemNames.length ? `Items: ${group.itemNames.join(', ')}` : '';
      const invoiceSummary = finding.invoiceNumber ? `Receipt invoice: ${finding.invoiceNumber}` : 'Scanned from receipt';
      return {
        title: group.title,
        amount: group.amount,
        category,
        dateMillis,
        notes: [invoiceSummary, itemSummary].filter(Boolean).join('\n'),
        confidence: finding.confidence,
        duplicateExpenseId: duplicate?.id ?? null,
        warnings: draftWarnings,
      } satisfies ReceiptExpenseDraft;
    });
    if (!drafts.length) return { status: 'failed' as const, error: 'Expense Logger Agent could not create an expense from the detected items.' };
    return {
      status: 'awaiting_approval' as const,
      drafts,
    };
  } catch (error) {
    return {
      status: 'failed' as const,
      error: `Expense Logger Agent failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function persistRunNode(state: typeof ReceiptAgentState.State) {
  await AsyncStorage.setItem(`receipt_agent_run:${state.runId}`, JSON.stringify({
    runId: state.runId,
    status: state.status,
    finding: state.finding,
    drafts: state.drafts,
    error: state.error,
    updatedAtMillis: Date.now(),
  }));
  return {};
}

export const receiptAgentGraph = new StateGraph(ReceiptAgentState)
  .addNode('receiptScanAgent', receiptScanAgentNode)
  .addNode('expenseLoggerAgent', expenseLoggerAgentNode)
  .addNode('persistRun', persistRunNode)
  .addEdge(START, 'receiptScanAgent')
  .addConditionalEdges('receiptScanAgent', routeAfterScan, {
    expenseLoggerAgent: 'expenseLoggerAgent',
    persistRun: 'persistRun',
  })
  .addEdge('expenseLoggerAgent', 'persistRun')
  .addEdge('persistRun', END)
  .compile();

async function runReceiptAgentOnReactNative(
  state: typeof ReceiptAgentState.State
): Promise<typeof ReceiptAgentState.State> {
  const scanUpdate = await receiptScanAgentNode(state);
  let nextState = { ...state, ...scanUpdate } as typeof ReceiptAgentState.State;
  if (nextState.finding) {
    const loggerUpdate = await expenseLoggerAgentNode(nextState);
    nextState = { ...nextState, ...loggerUpdate } as typeof ReceiptAgentState.State;
  }
  await persistRunNode(nextState);
  return nextState;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || 'Unknown LangGraph error';
  if (typeof error === 'string') return error || 'Unknown LangGraph error';
  try {
    return JSON.stringify(error) || 'Unknown LangGraph error';
  } catch {
    return 'Unknown LangGraph error';
  }
}

export async function runReceiptAgentGraph(input: {
  imageUri: string;
  mimeType: string;
  existingExpenses: readonly Expense[];
}) {
  const runId = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const initialState: typeof ReceiptAgentState.State = {
    runId,
    ...input,
    finding: null,
    drafts: [],
    status: 'scanning',
    error: null,
  };
  // LangGraph's compiled Pregel runner currently reaches web-only internals on
  // Hermes. Execute the same graph nodes and transitions with the mobile runner
  // instead of deliberately throwing once for every scan.
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    try {
      const result = await runReceiptAgentOnReactNative(initialState);
      return { runId, status: result.status, drafts: result.drafts, error: result.error };
    } catch (error) {
      return {
        runId,
        status: 'failed' as const,
        drafts: [],
        error: `Receipt workflow failed: ${errorText(error)}`,
      };
    }
  }
  try {
    const result = await receiptAgentGraph.invoke(
      initialState,
      {
        streamMode: 'values',
        tags: ['receipt-agent'],
        metadata: { agent: 'receipt' },
        configurable: {},
      }
    );
    return { runId, status: result.status, drafts: result.drafts, error: result.error };
  } catch (error) {
    try {
      const result = await runReceiptAgentOnReactNative(initialState);
      return { runId, status: result.status, drafts: result.drafts, error: result.error };
    } catch (fallbackError) {
      return {
        runId,
        status: 'failed' as const,
        drafts: [],
        error: `Receipt workflow failed: ${errorText(fallbackError)}`,
      };
    }
  }
}

export async function completeReceiptAgentRun(
  runId: string,
  status: 'approved' | 'cancelled'
): Promise<void> {
  const key = `receipt_agent_run:${runId}`;
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse((await AsyncStorage.getItem(key)) ?? '{}') as Record<string, unknown>;
  } catch {
    current = {};
  }
  await AsyncStorage.setItem(key, JSON.stringify({
    ...current,
    status,
    humanDecisionAtMillis: Date.now(),
  }));
}

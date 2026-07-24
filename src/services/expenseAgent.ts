import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '@/src/services/firebase';
import { parseExpenseAgentDraft } from '@/src/services/gemini';
import type { ExpenseAgentDraft } from '@/src/types/models';

export interface PendingExpenseAgentAction {
  runId: string;
  originalInput: string;
  draft: ExpenseAgentDraft;
}

export async function prepareExpenseAgentAction(
  originalInput: string
): Promise<PendingExpenseAgentAction | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in.');
  const draft = await parseExpenseAgentDraft(originalInput);
  if (!draft) return null;

  const ref = await addDoc(collection(getFirebaseFirestore(), 'users', user.uid, 'agent_runs'), {
    type: 'expense_logger',
    originalInput,
    parsedDraft: draft,
    status: 'awaiting_confirmation',
    createdAt: serverTimestamp(),
  });
  return { runId: ref.id, originalInput, draft };
}

export async function finishExpenseAgentAction(
  runId: string,
  status: 'confirmed' | 'cancelled' | 'failed',
  finalDraft: ExpenseAgentDraft,
  error?: string
): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return;
  await updateDoc(doc(getFirebaseFirestore(), 'users', user.uid, 'agent_runs', runId), {
    status,
    finalDraft,
    error: error ?? null,
    completedAt: serverTimestamp(),
  });
}

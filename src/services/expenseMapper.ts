import type { Expense } from '@/src/types/models';

export function expenseToFirestore(expense: Omit<Expense, 'id'>): Record<string, unknown> {
  return {
    userEmail: expense.userEmail,
    title: expense.title,
    amount: expense.amount,
    category: expense.category,
    dateMillis: expense.dateMillis,
    notes: expense.notes ?? '',
    receiptPath: expense.receiptPath ?? null,
    isSettled: expense.isSettled ?? false,
    settlementNote: expense.settlementNote ?? null,
    settlementDateMillis: expense.settlementDateMillis ?? null,
    sourceType: expense.sourceType ?? null,
    sourceGroupId: expense.sourceGroupId ?? null,
    sourceSettlementId: expense.sourceSettlementId ?? null,
  };
}

export function expenseFromFirestore(id: string, data: Record<string, unknown>): Expense {
  return {
    id,
    userEmail: String(data.userEmail ?? ''),
    title: String(data.title ?? ''),
    amount: Number(data.amount ?? 0),
    category: String(data.category ?? 'Other'),
    dateMillis: Number(data.dateMillis ?? Date.now()),
    notes: String(data.notes ?? ''),
    receiptPath: data.receiptPath ? String(data.receiptPath) : null,
    isSettled: Boolean(data.isSettled),
    settlementNote: data.settlementNote ? String(data.settlementNote) : null,
    settlementDateMillis: data.settlementDateMillis != null ? Number(data.settlementDateMillis) : null,
    sourceType: data.sourceType === 'split_settlement' ? 'split_settlement' : null,
    sourceGroupId: data.sourceGroupId != null ? String(data.sourceGroupId) : null,
    sourceSettlementId: data.sourceSettlementId != null ? String(data.sourceSettlementId) : null,
  };
}

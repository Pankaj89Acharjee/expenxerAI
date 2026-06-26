import type { DebtFlow, GroupExpense } from '@/src/types/models';

export function calculateSettlements(members: string[], expenses: GroupExpense[]): DebtFlow[] {
  if (members.length === 0) return [];

  const netBalances: Record<string, number> = {};
  members.forEach((m) => {
    netBalances[m] = 0;
  });

  expenses.forEach((exp) => {
    const share = exp.amount / members.length;
    members.forEach((m) => {
      if (m === exp.paidBy) {
        netBalances[m] = (netBalances[m] ?? 0) + (exp.amount - share);
      } else {
        netBalances[m] = (netBalances[m] ?? 0) - share;
      }
    });
  });

  const debtors = Object.entries(netBalances)
    .filter(([, v]) => v < -0.01)
    .map(([k, v]) => [k, -v] as [string, number]);
  const creditors = Object.entries(netBalances)
    .filter(([, v]) => v > 0.01)
    .map(([k, v]) => [k, v] as [string, number]);

  const flows: DebtFlow[] = [];
  let dIndex = 0;
  let cIndex = 0;

  while (dIndex < debtors.length && cIndex < creditors.length) {
    const [debtorName, debtorAmt] = debtors[dIndex];
    const [creditorName, creditorAmt] = creditors[cIndex];
    const toSettle = Math.min(debtorAmt, creditorAmt);
    flows.push({ debtor: debtorName, creditor: creditorName, amount: toSettle });
    debtors[dIndex] = [debtorName, debtorAmt - toSettle];
    creditors[cIndex] = [creditorName, creditorAmt - toSettle];
    if (debtors[dIndex][1] < 0.01) dIndex++;
    if (creditors[cIndex][1] < 0.01) cIndex++;
  }

  return flows;
}

import type { DebtFlow, GroupExpense, GroupSettlement, SplitMember } from '@/src/types/models';
import {
  getGroupExpensePayers,
  getGroupExpenseSplitAmong,
  splitMemberDisplayNames,
} from '@/src/types/models';

type MemberInput = string[] | SplitMember[] | { members: SplitMember[] };

function toDisplayNames(members: MemberInput): string[] {
  if (Array.isArray(members)) {
    if (members.length === 0) return [];
    if (typeof members[0] === 'string') return members as string[];
    return splitMemberDisplayNames({ members: members as SplitMember[] });
  }
  return splitMemberDisplayNames(members);
}

/** Net balance per member: positive = lent (to receive), negative = borrowed (to pay). */
export function calculateNetBalances(
  members: MemberInput,
  expenses: GroupExpense[],
  recordedSettlements: GroupSettlement[] = []
): Record<string, number> {
  const names = toDisplayNames(members);
  const netBalances: Record<string, number> = {};
  names.forEach((m) => {
    netBalances[m] = 0;
  });
  if (names.length === 0) return netBalances;

  expenses.forEach((exp) => {
    const payers = getGroupExpensePayers(exp).filter((p) => names.includes(p));
    if (payers.length === 0) return;

    const splitAmong = getGroupExpenseSplitAmong(exp, names).filter((p) => names.includes(p));
    if (splitAmong.length === 0) return;

    const share = exp.amount / splitAmong.length;
    const paidEach = exp.amount / payers.length;
    const payerSet = new Set(payers);
    const splitSet = new Set(splitAmong);

    names.forEach((m) => {
      const contributed = payerSet.has(m) ? paidEach : 0;
      const owed = splitSet.has(m) ? share : 0;
      netBalances[m] = (netBalances[m] ?? 0) + contributed - owed;
    });
  });

  // Apply recorded payments: borrower paid lender → reduce that debt.
  recordedSettlements.forEach((s) => {
    if (!names.includes(s.debtor) || !names.includes(s.creditor)) return;
    netBalances[s.debtor] = (netBalances[s.debtor] ?? 0) + s.amount;
    netBalances[s.creditor] = (netBalances[s.creditor] ?? 0) - s.amount;
  });

  return netBalances;
}

export function calculateSettlements(
  members: MemberInput,
  expenses: GroupExpense[],
  recordedSettlements: GroupSettlement[] = []
): DebtFlow[] {
  const names = toDisplayNames(members);
  if (names.length === 0) return [];

  const netBalances = calculateNetBalances(members, expenses, recordedSettlements);

  const borrowers = Object.entries(netBalances)
    .filter(([, v]) => v < -0.01)
    .map(([k, v]) => [k, -v] as [string, number]);
  const lenders = Object.entries(netBalances)
    .filter(([, v]) => v > 0.01)
    .map(([k, v]) => [k, v] as [string, number]);

  const flows: DebtFlow[] = [];
  let bIndex = 0;
  let lIndex = 0;

  while (bIndex < borrowers.length && lIndex < lenders.length) {
    const [borrowerName, borrowerAmt] = borrowers[bIndex];
    const [lenderName, lenderAmt] = lenders[lIndex];
    const toSettle = Math.min(borrowerAmt, lenderAmt);
    flows.push({ debtor: borrowerName, creditor: lenderName, amount: toSettle });
    borrowers[bIndex] = [borrowerName, borrowerAmt - toSettle];
    lenders[lIndex] = [lenderName, lenderAmt - toSettle];
    if (borrowers[bIndex][1] < 0.01) bIndex++;
    if (lenders[lIndex][1] < 0.01) lIndex++;
  }

  return flows;
}

export type MemberBalanceStatus = 'settled' | 'to_receive' | 'to_pay';

export type MemberBalanceCard = {
  name: string;
  balance: number;
  status: MemberBalanceStatus;
  /** Short label for the card chip. */
  statusLabel: string;
  /** e.g. "Lent (+)" / "Borrowed (−)" / "Settled". */
  signHint: string;
};

export function buildMemberBalanceCards(
  members: MemberInput,
  expenses: GroupExpense[],
  recordedSettlements: GroupSettlement[] = []
): MemberBalanceCard[] {
  const names = toDisplayNames(members);
  const nets = calculateNetBalances(members, expenses, recordedSettlements);
  return names.map((name) => {
    const balance = nets[name] ?? 0;
    if (balance > 0.01) {
      return {
        name,
        balance,
        status: 'to_receive',
        statusLabel: 'To receive',
        signHint: 'Lent (+)',
      };
    }
    if (balance < -0.01) {
      return {
        name,
        balance,
        status: 'to_pay',
        statusLabel: 'To pay',
        signHint: 'Borrowed (−)',
      };
    }
    return {
      name,
      balance: 0,
      status: 'settled',
      statusLabel: 'Settled',
      signHint: 'Settled',
    };
  });
}

/** Human label: "Alice borrowed from Bob" / "You borrowed from Bob" / "Bob borrowed from you". */
export function describeBorrowFlow(flow: DebtFlow, selfName?: string | null): string {
  const amountNote = '';
  const borrowerIsSelf = Boolean(selfName && flow.debtor === selfName);
  const lenderIsSelf = Boolean(selfName && flow.creditor === selfName);
  if (borrowerIsSelf) return `You borrowed from ${flow.creditor}${amountNote}`;
  if (lenderIsSelf) return `${flow.debtor} borrowed from you${amountNote}`;
  return `${flow.debtor} borrowed from ${flow.creditor}${amountNote}`;
}

export const EXPENSE_CATEGORIES = [
  'All',
  'Housing',
  'Food',
  'Transport',
  'Utilities',
  'Shopping',
  'Entertainment',
  'Health',
  'Savings',
  'Personal',
  'Borrowing',
  'Loan-Liability',
  'Credit-card',
  'Insurance',
  'Groceries',
  'Other',
] as const;

export const FORM_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c !== 'All');

export const AVATAR_URLS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=128&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=128&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=128&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=128&q=80',
];

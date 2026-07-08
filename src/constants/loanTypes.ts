export const LIABILITY_KINDS = ['ANNUAL', 'LOAN', 'CREDIT_CARD_LOAN'] as const;
export type LiabilityKind = (typeof LIABILITY_KINDS)[number];

/** Standard loan types — credit card debt uses the Credit Card Loans tab. */
export const LOAN_TYPES = [
  'PERSONAL_LOAN',
  'HOME_LOAN',
  'GOLD_LOAN',
  'CAR_LOAN',
  'BIKE_LOAN',
  'EDUCATION_LOAN',
  'BUSINESS_LOAN',
  'AGRICULTURE_LOAN',
  'VEHICLE_LOAN',
  'OTHER',
] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

export const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  PERSONAL_LOAN: 'Personal Loan',
  HOME_LOAN: 'Home Loan',
  GOLD_LOAN: 'Gold Loan',
  CAR_LOAN: 'Car Loan',
  BIKE_LOAN: 'Bike Loan',
  EDUCATION_LOAN: 'Education Loan',
  BUSINESS_LOAN: 'Business Loan',
  AGRICULTURE_LOAN: 'Agriculture Loan',
  VEHICLE_LOAN: 'Vehicle Loan',
  OTHER: 'Other Loan',
};

export function loanTypeLabel(loanType?: string | null): string {
  if (!loanType) return 'Loan';
  if (loanType === 'CREDIT_CARD') return 'Credit Card Loan';
  return LOAN_TYPE_LABELS[loanType as LoanType] ?? loanType.replace(/_/g, ' ');
}

export const LOAN_TYPE_OPTIONS = LOAN_TYPES.map((value) => ({
  value,
  label: LOAN_TYPE_LABELS[value],
}));

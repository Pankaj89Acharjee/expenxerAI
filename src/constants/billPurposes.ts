export const BILL_PURPOSES = [
  'Rent',
  'Electricity',
  'Water',
  'School Fees',
  'Gas',
  'Internet',
  'Maintenance',
  'Insurance Premium',
  'Other',
] as const;

export type BillPurpose = (typeof BILL_PURPOSES)[number];

export const BILL_BILLING_CYCLES = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const;

export const BILL_TYPES = [
  'Electricity',
  'Rent',
  'Gas',
  'Water',
  'School Fees',
  'Internet',
  'Phone / Mobile',
  'Maintenance',
  'Insurance Premium',
  'Property Tax',
  'Cable / DTH',
  'Security',
  'Garbage / Sanitation',
  'Cooking Fuel',
  'Other',
] as const;

export type BillType = (typeof BILL_TYPES)[number];

/** @deprecated Use BILL_TYPES — kept for older imports */
export const BILL_PURPOSES = BILL_TYPES;
export type BillPurpose = BillType;

export const BILL_BILLING_CYCLES = [
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
] as const;

export type BillBillingCycle = (typeof BILL_BILLING_CYCLES)[number];

export const BILL_TYPE_OPTIONS = BILL_TYPES.map((value) => ({
  value,
  label: value,
}));

export const BILL_CYCLE_OPTIONS = BILL_BILLING_CYCLES.map((value) => ({
  value,
  label:
    value === 'MONTHLY'
      ? 'Monthly'
      : value === 'QUARTERLY'
        ? 'Quarterly'
        : value === 'HALF_YEARLY'
          ? 'Half-yearly'
          : 'Yearly',
}));

/** Map household bill type → Expenses tab category. */
export function billExpenseCategory(billFor: string): string {
  switch (billFor) {
    case 'Rent':
      return 'Housing';
    case 'Electricity':
    case 'Gas':
    case 'Water':
    case 'Internet':
    case 'Phone / Mobile':
    case 'Maintenance':
    case 'Property Tax':
    case 'Security':
    case 'Garbage / Sanitation':
    case 'Cooking Fuel':
      return 'Utilities';
    case 'Cable / DTH':
      return 'Entertainment';
    case 'Insurance Premium':
      return 'Insurance';
    case 'School Fees':
      return 'Other';
    default:
      return 'Other';
  }
}

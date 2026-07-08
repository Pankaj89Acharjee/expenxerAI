/** Banks, NBFCs, post office, and gold-loan institutions (India-focused list). */
export const BANK_LENDERS = [
  'State Bank of India (SBI)',
  'Punjab National Bank (PNB)',
  'Bank of Baroda',
  'Canara Bank',
  'Union Bank of India',
  'Bank of India',
  'Indian Bank',
  'Central Bank of India',
  'Indian Overseas Bank',
  'UCO Bank',
  'Bank of Maharashtra',
  'Punjab & Sind Bank',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'IndusInd Bank',
  'Yes Bank',
  'IDFC FIRST Bank',
  'Federal Bank',
  'RBL Bank',
  'Bandhan Bank',
  'AU Small Finance Bank',
  'India Post Payments Bank',
  'India Post — Postal Life Insurance',
] as const;

export const NBFC_LENDERS = [
  'Bajaj Finance',
  'Tata Capital',
  'Mahindra Finance',
  'Cholamandalam Investment',
  'Shriram Finance',
  'L&T Finance',
  'HDB Financial Services',
  'Aditya Birla Finance',
  'Fullerton India',
  'IIFL Finance',
  'Piramal Finance',
  'Hero FinCorp',
  'TVS Credit',
  'Home Credit',
] as const;

export const GOLD_LOAN_LENDERS = [
  'Muthoot Finance',
  'Manappuram Finance',
  'Muthoot Fincorp',
  'IIFL Gold Loan',
  'HDFC Bank — Gold Loan',
  'ICICI Bank — Gold Loan',
  'Federal Bank — Gold Loan',
  'South Indian Bank — Gold Loan',
  'Other Gold Loan Provider',
] as const;

export const CREDIT_CARD_ISSUERS = [
  'HDFC Bank Credit Card',
  'ICICI Bank Credit Card',
  'Axis Bank Credit Card',
  'SBI Card',
  'Kotak Mahindra Credit Card',
  'IndusInd Bank Credit Card',
  'Yes Bank Credit Card',
  'RBL Bank Credit Card',
  'IDFC FIRST Bank Credit Card',
  'American Express',
  'Citibank Credit Card',
  'Standard Chartered Credit Card',
  'HSBC Credit Card',
  'Bank of Baroda Credit Card',
  'AU Bank Credit Card',
  'Other Credit Card',
] as const;

export type LenderOption = { value: string; label: string };

function toOptions(values: readonly string[]): LenderOption[] {
  return values.map((value) => ({ value, label: value }));
}

export function getLenderOptions(loanType?: string | null): LenderOption[] {
  const banks = toOptions(BANK_LENDERS);
  const nbfcs = toOptions(NBFC_LENDERS);
  const gold = toOptions(GOLD_LOAN_LENDERS);
  if (loanType === 'GOLD_LOAN') {
    return [...gold, ...banks, ...nbfcs];
  }
  return [...banks, ...nbfcs, ...gold];
}

export function getCreditCardLenderOptions(): LenderOption[] {
  return toOptions(CREDIT_CARD_ISSUERS);
}

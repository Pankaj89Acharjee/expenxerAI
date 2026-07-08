function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Simple interest over the full loan tenure. */
export function calculateTotalInterest(
  principal: number,
  annualInterestRatePercent: number,
  tenureMonths: number
): number {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  if (!Number.isFinite(tenureMonths) || tenureMonths <= 0) return 0;
  if (!Number.isFinite(annualInterestRatePercent) || annualInterestRatePercent <= 0) return 0;
  return round2(principal * (annualInterestRatePercent / 100) * (tenureMonths / 12));
}

/** Principal plus total interest over the tenure. */
export function calculateTotalPayable(
  principal: number,
  annualInterestRatePercent: number,
  tenureMonths: number
): number {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  if (!Number.isFinite(tenureMonths) || tenureMonths <= 0) return 0;
  return round2(principal + calculateTotalInterest(principal, annualInterestRatePercent, tenureMonths));
}

/** Monthly EMI = (Principal + Interest) / Tenure. */
export function calculateMonthlyEmi(
  principal: number,
  annualInterestRatePercent: number,
  tenureMonths: number
): number {
  const total = calculateTotalPayable(principal, annualInterestRatePercent, tenureMonths);
  if (total <= 0 || tenureMonths <= 0) return 0;
  return round2(total / tenureMonths);
}

export function canAutoCalculateEmi(
  principal: number,
  _annualInterestRatePercent: number,
  tenureMonths: number
): boolean {
  return principal > 0 && tenureMonths > 0;
}

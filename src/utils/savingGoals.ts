import type { SavingGoal } from '@/src/types/models';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function calculateSavingMetrics(goal: SavingGoal): SavingGoal {
  const now = Date.now();
  const remainingMillis = goal.targetDateMillis - now;
  const monthsRemaining = Math.max(remainingMillis / MONTH_MS, 1);
  const remainingToSave = Math.max(goal.targetAmount - goal.savedAmount, 0);
  const currentRequiredMonthly = remainingToSave / monthsRemaining;

  const elapsedMillis = now - goal.creationDateMillis;
  const elapsedMonths = Math.max(elapsedMillis / MONTH_MS, 0);
  const expectedSaved = goal.initialMonthlyContribution * elapsedMonths;
  const difference = goal.savedAmount - expectedSaved;
  const surplus = difference > 0 ? difference : 0;
  const deficit = difference < 0 ? -difference : 0;

  const expectedWithMargin = goal.initialMonthlyContribution * Math.floor(elapsedMonths);
  const missedMonths =
    goal.savedAmount < expectedWithMargin
      ? Math.max(
          0,
          Math.floor((expectedWithMargin - goal.savedAmount) / goal.initialMonthlyContribution)
        )
      : 0;

  const monthlySavingRate =
    elapsedMonths > 0.1 ? goal.savedAmount / elapsedMonths : goal.initialMonthlyContribution;

  let forecastText: string;
  if (goal.savedAmount >= goal.targetAmount) {
    forecastText = `Goal achieved! 🎉 You have saved the full target of ₹${goal.targetAmount.toFixed(2)}.`;
  } else if (monthlySavingRate <= 0) {
    forecastText =
      'Alert: You currently have no active saving momentum. Please contribute to start forecasting.';
  } else {
    const estimatedMonthsToTarget = remainingToSave / monthlySavingRate;
    const estimatedCompletionMillis = now + estimatedMonthsToTarget * MONTH_MS;
    const d = new Date(estimatedCompletionMillis);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (estimatedCompletionMillis <= goal.targetDateMillis) {
      forecastText = `On Track! 🚀 Projected completion by ${dateStr} (ahead of deadline).`;
    } else {
      forecastText = `Behind Schedule. ⚠️ Current momentum pushes achievement to ${dateStr}. Increase savings by ₹${(currentRequiredMonthly - monthlySavingRate).toFixed(2)}/mo to realign.`;
    }
  }

  return {
    ...goal,
    currentRequiredMonthly,
    deficit,
    surplus,
    missedMonthsCount: missedMonths,
    forecastText,
  };
}

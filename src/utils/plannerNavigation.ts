import type { PlannerTab } from '@/src/constants/plannerTabs';
import { PLANNER_TABS } from '@/src/constants/plannerTabs';

export function parsePlannerTabParam(value: string | string[] | undefined): PlannerTab | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && (PLANNER_TABS as readonly string[]).includes(raw)) {
    return raw as PlannerTab;
  }
  return null;
}

export function plannerHref(tab: PlannerTab) {
  return { pathname: '/(tabs)/planner' as const, params: { tab } };
}

/** Bank loan vs credit-card EMI plan tab for dashboard deep links. */
export function emiSummaryPlannerTab(item: { kindLabel: string }): PlannerTab {
  return item.kindLabel === 'Card EMI' ? 'CreditCards' : 'Loans';
}

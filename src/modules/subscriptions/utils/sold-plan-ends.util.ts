import { zonedDayBounds } from '../../check-ins/utils/tenant-day.util';
import { addUtcDays } from './freeze.util';

/** Day pass is valid until the next gym midnight (exclusive). Memberships add durationDays. */
export function soldPlanEndsAt(
  kind: string,
  now: Date,
  durationDays: number,
  timeZone: string,
): Date {
  if (kind === 'DAY_PASS') {
    return zonedDayBounds(now, timeZone).lt;
  }
  return addUtcDays(now, durationDays);
}

export function graceDaysForSoldPlan(kind: string, graceDays: number): number {
  return kind === 'DAY_PASS' ? 0 : graceDays;
}

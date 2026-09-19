import { addYmdDays, zonedYmd } from '../../check-ins/utils/tenant-day.util';
import { addUtcDays } from './freeze.util';
import { graceDaysForSoldPlan, soldPlanEndsAt } from './sold-plan-ends.util';

describe('soldPlanEndsAt', () => {
  it('memberships add durationDays', () => {
    const now = new Date('2026-09-19T08:00:00.000Z');
    expect(soldPlanEndsAt('MEMBERSHIP', now, 30, 'Africa/Cairo')).toEqual(
      addUtcDays(now, 30),
    );
  });

  it('day pass ends at the next gym midnight', () => {
    const now = new Date('2026-09-19T20:00:00.000Z');
    const ends = soldPlanEndsAt('DAY_PASS', now, 1, 'Africa/Cairo');
    const today = zonedYmd(now, 'Africa/Cairo');
    const tomorrow = addYmdDays(today, 1);
    expect(zonedYmd(ends, 'Africa/Cairo')).toBe(tomorrow);
  });
});

describe('graceDaysForSoldPlan', () => {
  it('day pass never gets extra days', () => {
    expect(graceDaysForSoldPlan('DAY_PASS', 3)).toBe(0);
    expect(graceDaysForSoldPlan('MEMBERSHIP', 3)).toBe(3);
  });
});

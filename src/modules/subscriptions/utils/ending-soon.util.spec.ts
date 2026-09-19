import { SubscriptionStatus } from '@prisma/client';
import { SUBSCRIPTION_ENDING_SOON_DAYS } from '../constants/subscription.constants';
import { addUtcDays } from './freeze.util';
import { endingSoonWhere } from './ending-soon.util';

describe('endingSoonWhere', () => {
  it('is ACTIVE and endsAt in the next 7 rolling days', () => {
    const now = new Date('2026-09-19T07:00:00.000Z');
    expect(endingSoonWhere(now)).toEqual({
      status: SubscriptionStatus.ACTIVE,
      endsAt: {
        gte: now,
        lte: addUtcDays(now, SUBSCRIPTION_ENDING_SOON_DAYS),
      },
    });
  });
});

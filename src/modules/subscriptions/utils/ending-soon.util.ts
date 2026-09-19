import { Prisma, SubscriptionStatus } from '@prisma/client';
import { SUBSCRIPTION_ENDING_SOON_DAYS } from '../constants/subscription.constants';
import { addUtcDays } from './freeze.util';

export function endingSoonWhere(
  now = new Date(),
): Prisma.SubscriptionWhereInput {
  return {
    status: SubscriptionStatus.ACTIVE,
    kind: { not: 'DAY_PASS' },
    endsAt: { gte: now, lte: addUtcDays(now, SUBSCRIPTION_ENDING_SOON_DAYS) },
  };
}

import { Prisma } from '@prisma/client';

/** Same rolling window as dashboard endingSoon and the inbox row. */
export const SUBSCRIPTION_ENDING_SOON_DAYS = 7;

export const SUBSCRIPTION_FILTER_FIELDS = [
  'memberId',
  'planId',
  'status',
  'soldByStaffId',
  'cancelledByStaffId',
] as const;
export const SUBSCRIPTION_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'startsAt',
  'endsAt',
] as const;

export const SUBSCRIPTION_INCLUDE = {
  tenant: {
    select: {
      currency: true,
      settings: {
        select: { graceEnabled: true, graceDays: true },
      },
      branches: { select: { id: true, name: true } },
    },
  },
  member: {
    select: { id: true, name: true, phone: true, status: true },
  },
  staff: {
    select: { id: true, name: true, role: true },
  },
  cancelledBy: {
    select: { id: true, name: true, role: true },
  },
  plan: {
    select: {
      id: true,
      name: true,
      status: true,
      branches: {
        select: { branch: { select: { id: true, name: true } } },
      },
    },
  },
} satisfies Prisma.SubscriptionInclude;

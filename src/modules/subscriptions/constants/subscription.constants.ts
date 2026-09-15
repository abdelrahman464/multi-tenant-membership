import { Prisma } from '@prisma/client';

export const SUBSCRIPTION_FILTER_FIELDS = [
  'memberId',
  'planId',
  'status',
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

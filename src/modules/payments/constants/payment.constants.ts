import { Prisma } from '@prisma/client';

export const PAYMENT_FILTER_FIELDS = [
  'memberId',
  'subscriptionId',
  'branchId',
  'method',
] as const;
export const PAYMENT_SORT_FIELDS = ['paidAt', 'createdAt', 'amount'] as const;

export const PAYMENT_INCLUDE = {
  member: {
    select: { id: true, name: true, phone: true, status: true },
  },
  branch: {
    select: { id: true, name: true },
  },
  staff: {
    select: { id: true, name: true, role: true },
  },
  subscription: {
    select: {
      id: true,
      status: true,
      planName: true,
      durationDays: true,
      sessionCount: true,
      sessionsRemaining: true,
      price: true,
      startsAt: true,
      endsAt: true,
      plan: {
        select: { id: true, name: true, status: true },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

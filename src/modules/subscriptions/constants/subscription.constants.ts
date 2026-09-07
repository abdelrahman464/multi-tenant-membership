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
    },
  },
} as const;

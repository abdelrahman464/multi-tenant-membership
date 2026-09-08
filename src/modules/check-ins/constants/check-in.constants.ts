export const CHECKIN_FILTER_FIELDS = [
  'memberId',
  'branchId',
  'subscriptionId',
] as const;
export const CHECKIN_SORT_FIELDS = ['checkedInAt'] as const;

export const CHECKIN_LOOKBACK_MS = 48 * 60 * 60 * 1000;

export const REPORT_MAX_RANGE_DAYS = 366;
export const REPORT_MAX_ROWS = 10_000;

export const MEMBER_CSV_HEADERS = [
  'member',
  'code',
  'phone',
  'email',
  'status',
  'homeBranch',
  'lastCheckedInAt',
  'plans',
  'notes',
  'createdAt',
] as const;

export const PAYMENT_CSV_HEADERS = [
  'paidAt',
  'method',
  'status',
  'amount',
  'currency',
  'notes',
  'member',
  'memberPhone',
  'plan',
  'branch',
  'staff',
  'price',
  'paidTotal',
  'dueAmount',
] as const;

export const CHECKIN_CSV_HEADERS = [
  'checkedInAt',
  'member',
  'memberPhone',
  'plan',
  'subscriptionStatus',
  'branch',
  'staff',
] as const;

export const SUBSCRIPTION_CSV_HEADERS = [
  'member',
  'memberPhone',
  'memberStatus',
  'plan',
  'soldBy',
  'status',
  'durationDays',
  'sessionCount',
  'sessionsRemaining',
  'maxVisitsPerDay',
  'price',
  'paidTotal',
  'dueAmount',
  'currency',
  'startsAt',
  'endsAt',
  'expiredAt',
  'cancelledAt',
  'createdAt',
] as const;

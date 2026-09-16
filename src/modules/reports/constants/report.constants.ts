export const REPORT_MAX_RANGE_DAYS = 366;
export const REPORT_MAX_ROWS = 10_000;

export const MEMBER_CSV_HEADERS = [
  'id',
  'name',
  'phone',
  'email',
  'status',
  'homeBranchId',
  'homeBranchName',
  'notes',
  'createdAt',
] as const;

export const PAYMENT_CSV_HEADERS = [
  'id',
  'paidAt',
  'method',
  'amount',
  'currency',
  'notes',
  'memberId',
  'memberName',
  'memberPhone',
  'branchId',
  'branchName',
  'staffId',
  'staffName',
  'subscriptionId',
  'planName',
  'price',
  'paidTotal',
  'dueAmount',
] as const;

export const CHECKIN_CSV_HEADERS = [
  'id',
  'checkedInAt',
  'memberId',
  'memberName',
  'memberPhone',
  'branchId',
  'branchName',
  'staffId',
  'staffName',
  'subscriptionId',
  'planName',
  'subscriptionStatus',
] as const;

export const MEMBER_PUBLIC_SELECT = {
  id: true,
  tenantId: true,
  homeBranchId: true,
  name: true,
  phone: true,
  email: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const MEMBER_SEARCH_FIELDS = ['name', 'phone', 'email'] as const;
export const MEMBER_FILTER_FIELDS = ['status', 'homeBranchId'] as const;
export const MEMBER_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'phone',
] as const;

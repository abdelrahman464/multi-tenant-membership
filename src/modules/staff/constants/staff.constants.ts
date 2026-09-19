export const STAFF_PUBLIC_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  role: true,
  status: true,
  branchId: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true } },
} as const;

export const STAFF_SEARCH_FIELDS = ['name', 'email'] as const;
export const STAFF_FILTER_FIELDS = ['role', 'branchId', 'status'] as const;
export const STAFF_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'email',
  'role',
] as const;

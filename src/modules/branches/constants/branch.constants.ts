export const BRANCH_PUBLIC_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  status: true,
  hours: true,
  hoursExceptions: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const BRANCH_SEARCH_FIELDS = ['name'] as const;
export const BRANCH_FILTER_FIELDS = ['status'] as const;
export const BRANCH_SORT_FIELDS = ['createdAt', 'updatedAt', 'name'] as const;

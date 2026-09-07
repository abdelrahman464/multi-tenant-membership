export const TENANT_SEARCH_FIELDS = ['name', 'slug'] as const;
export const TENANT_FILTER_FIELDS = ['status'] as const;
export const TENANT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'slug',
  'status',
] as const;

export const BRANCH_SEARCH_FIELDS = ['name'] as const;
export const BRANCH_SORT_FIELDS = ['createdAt', 'updatedAt', 'name'] as const;

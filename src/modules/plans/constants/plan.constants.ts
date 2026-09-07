export const PLAN_SEARCH_FIELDS = ['name'] as const;
export const PLAN_FILTER_FIELDS = ['status', 'allBranches'] as const;
export const PLAN_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'price',
] as const;

export const PLAN_INCLUDE = {
  tenant: { select: { currency: true } },
  branches: {
    select: {
      branch: { select: { id: true, name: true } },
    },
  },
} as const;

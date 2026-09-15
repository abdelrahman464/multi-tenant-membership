import { SETTINGS_PUBLIC_SELECT } from './settings.constants';

export const SESSION_TENANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  country: true,
  timezone: true,
  currency: true,
  status: true,
  settings: { select: SETTINGS_PUBLIC_SELECT },
  branches: {
    select: { id: true, name: true },
    orderBy: { name: 'asc' as const },
  },
} as const;

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

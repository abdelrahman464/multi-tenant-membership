export const AUDIT_FILTER_FIELDS = [
  'action',
  'staffId',
  'entityType',
  'entityId',
] as const;
export const AUDIT_SORT_FIELDS = ['createdAt'] as const;

export const AUDIT_INCLUDE = {
  staff: {
    select: { id: true, name: true, role: true },
  },
} as const;

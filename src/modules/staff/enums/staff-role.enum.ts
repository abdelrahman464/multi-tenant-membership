export enum StaffRole {
  TENANT_OWNER = 'TENANT_OWNER',
  ADMIN = 'ADMIN',
  BRANCH_STAFF = 'BRANCH_STAFF',
}

/** Roles an owner/admin may assign. TENANT_OWNER is created only with the tenant. */
export enum AssignableStaffRole {
  ADMIN = 'ADMIN',
  BRANCH_STAFF = 'BRANCH_STAFF',
}

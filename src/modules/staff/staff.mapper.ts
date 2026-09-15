import { Staff, StaffRole } from '@prisma/client';

export type PublicBranchRef = {
  id: string;
  name: string;
};

export type PublicStaff = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: StaffRole;
  branchId: string | null;
  branch: PublicBranchRef | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicStaff(
  staff: Pick<
    Staff,
    | 'id'
    | 'tenantId'
    | 'name'
    | 'email'
    | 'role'
    | 'branchId'
    | 'createdAt'
    | 'updatedAt'
  > & { branch?: PublicBranchRef | null },
): PublicStaff {
  return {
    id: staff.id,
    tenantId: staff.tenantId,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    branchId: staff.branchId,
    branch: staff.branch ?? null,
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt,
  };
}

import { Staff, StaffRole } from '@prisma/client';

export type PublicStaff = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: StaffRole;
  branchId: string | null;
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
  >,
): PublicStaff {
  return {
    id: staff.id,
    tenantId: staff.tenantId,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    branchId: staff.branchId,
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt,
  };
}

import { StaffRole } from '../../modules/staff/enums/staff-role.enum';

/** Shape of `req.user` set by JwtAuthGuard. Role always comes from the DB. */
export type AuthenticatedUser = {
  id: string;
  email: string;
  role: StaffRole;
  tenantId: string;
  branchId: string | null;
};

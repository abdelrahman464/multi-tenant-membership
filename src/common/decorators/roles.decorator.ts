import { SetMetadata } from '@nestjs/common';
import { StaffRole } from '../../modules/staff/enums/staff-role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);

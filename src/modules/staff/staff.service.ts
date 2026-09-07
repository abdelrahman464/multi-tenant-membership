import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { HashService } from '../../common/security/hash.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateStaffDto } from './dto/create-staff.dto';
import { ListStaffQueryDto } from './dto/list-staff-query.dto';
import { AssignableStaffRole, StaffRole } from './enums/staff-role.enum';
import { StaffRepository } from './repository/staff.repository';

@Injectable()
export class StaffService {
  constructor(
    private readonly staffRepository: StaffRepository,
    private readonly hashService: HashService,
  ) {}

  list(actor: AuthenticatedUser, query: ListStaffQueryDto) {
    return this.staffRepository.findMany(actor.tenantId, query);
  }

  async create(actor: AuthenticatedUser, dto: CreateStaffDto) {
    this.assertCanAssign(actor, dto);

    try {
      return await this.staffRepository.create(actor.tenantId, {
        name: dto.name.trim(),
        email: dto.email,
        password: await this.hashService.hash(dto.password),
        role: dto.role,
        branchId: dto.branchId,
      });
    } catch (error) {
      if (this.staffRepository.isUniqueConflict(error)) {
        throw this.staffRepository.emailTakenError();
      }
      throw error;
    }
  }

  private assertCanAssign(actor: AuthenticatedUser, dto: CreateStaffDto): void {
    if (dto.role === AssignableStaffRole.ADMIN) {
      if (actor.role !== StaffRole.TENANT_OWNER) {
        throw new AppHttpException(
          HttpStatus.FORBIDDEN,
          ErrorCode.FORBIDDEN,
          'Only the tenant owner can create admins',
        );
      }
      if (dto.branchId) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.BRANCH_NOT_ALLOWED,
          'Admins are not assigned to a single branch',
        );
      }
      return;
    }

    if (!dto.branchId) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.BRANCH_REQUIRED,
        'Branch staff must be assigned to a branch',
      );
    }
  }
}

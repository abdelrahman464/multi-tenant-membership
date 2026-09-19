import { HttpStatus, Injectable } from '@nestjs/common';
import { StaffRole as PrismaStaffRole } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { HashService } from '../../common/security/hash.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateStaffDto } from './dto/create-staff.dto';
import { ListStaffQueryDto } from './dto/list-staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
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

  async getById(actor: AuthenticatedUser, id: string) {
    const staff = await this.staffRepository.findPublicById(actor.tenantId, id);
    if (!staff) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.STAFF_NOT_FOUND,
        'Staff not found',
      );
    }
    return staff;
  }

  async create(actor: AuthenticatedUser, dto: CreateStaffDto) {
    this.assertCanAssign(actor, dto.role, dto.branchId ?? null);

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

  async update(actor: AuthenticatedUser, id: string, dto: UpdateStaffDto) {
    const target = await this.staffRepository.findByIdInTenant(
      actor.tenantId,
      id,
    );
    if (!target) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.STAFF_NOT_FOUND,
        'Staff not found',
      );
    }

    this.assertCanMutate(actor, target.role);

    const nextRole = dto.role ?? (target.role as AssignableStaffRole);
    const nextBranchId =
      dto.branchId !== undefined ? dto.branchId : target.branchId;
    this.assertCanAssign(actor, nextRole, nextBranchId);

    const bumpSessionVersion =
      dto.email !== undefined ||
      dto.password !== undefined ||
      dto.role !== undefined ||
      dto.branchId !== undefined ||
      dto.status !== undefined;

    try {
      return await this.staffRepository.update(actor.tenantId, id, {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.password !== undefined
          ? { password: await this.hashService.hash(dto.password) }
          : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        bumpSessionVersion,
      });
    } catch (error) {
      if (this.staffRepository.isUniqueConflict(error)) {
        throw this.staffRepository.emailTakenError();
      }
      throw error;
    }
  }

  private assertCanMutate(
    actor: AuthenticatedUser,
    targetRole: PrismaStaffRole,
  ): void {
    if (targetRole === StaffRole.TENANT_OWNER) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ErrorCode.STAFF_OWNER_LOCKED,
        'The tenant owner cannot be edited through this API',
      );
    }
    if (
      targetRole === StaffRole.ADMIN &&
      actor.role !== StaffRole.TENANT_OWNER
    ) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'Only the tenant owner can edit admins',
      );
    }
  }

  private assertCanAssign(
    actor: AuthenticatedUser,
    role: AssignableStaffRole,
    branchId: string | null,
  ): void {
    if (role === AssignableStaffRole.ADMIN) {
      if (actor.role !== StaffRole.TENANT_OWNER) {
        throw new AppHttpException(
          HttpStatus.FORBIDDEN,
          ErrorCode.FORBIDDEN,
          'Only the tenant owner can assign admins',
        );
      }
      if (branchId) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.BRANCH_NOT_ALLOWED,
          'Admins are not assigned to a single branch',
        );
      }
      return;
    }

    if (!branchId) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.BRANCH_REQUIRED,
        'Branch staff must be assigned to a branch',
      );
    }
  }
}

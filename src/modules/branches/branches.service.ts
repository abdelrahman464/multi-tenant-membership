import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { CreateBranchDto } from './dto/create-branch.dto';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchesRepository } from './repository/branches.repository';

@Injectable()
export class BranchesService {
  constructor(private readonly branchesRepository: BranchesRepository) {}

  list(tenantId: string, query: ListBranchesQueryDto) {
    return this.branchesRepository.findMany(tenantId, query);
  }

  async getById(tenantId: string, id: string) {
    const branch = await this.branchesRepository.findById(tenantId, id);
    if (!branch) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.BRANCH_NOT_FOUND,
        'Branch not found',
      );
    }
    return branch;
  }

  async create(tenantId: string, dto: CreateBranchDto) {
    try {
      return await this.branchesRepository.create(tenantId, {
        name: dto.name.trim(),
        hours: dto.hours,
        hoursExceptions: dto.hoursExceptions,
      });
    } catch (error) {
      if (this.branchesRepository.isUniqueConflict(error)) {
        throw this.branchesRepository.nameTakenError();
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateBranchDto) {
    const branch = await this.getById(tenantId, id);
    if (dto.status === 'ARCHIVED' && branch.status !== 'ARCHIVED') {
      const [activeCount, staffCount] = await Promise.all([
        this.branchesRepository.countActive(tenantId),
        this.branchesRepository.countActiveStaff(tenantId, id),
      ]);
      if (activeCount <= 1) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.BRANCH_LAST_ACTIVE,
          'A gym must keep at least one active branch',
        );
      }
      if (staffCount > 0) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.BRANCH_HAS_STAFF,
          'Reassign active branch staff before archiving this location',
        );
      }
    }

    try {
      return await this.branchesRepository.update(tenantId, id, {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.hours !== undefined ? { hours: dto.hours } : {}),
        ...(dto.hoursExceptions !== undefined
          ? { hoursExceptions: dto.hoursExceptions }
          : {}),
      });
    } catch (error) {
      if (this.branchesRepository.isUniqueConflict(error)) {
        throw this.branchesRepository.nameTakenError();
      }
      throw error;
    }
  }

  async addForPlatform(tenantId: string, dto: CreateBranchDto) {
    try {
      return await this.branchesRepository.addForPlatform(tenantId, {
        name: dto.name.trim(),
        hours: dto.hours,
        hoursExceptions: dto.hoursExceptions,
      });
    } catch (error) {
      if (this.branchesRepository.isUniqueConflict(error)) {
        throw this.branchesRepository.nameTakenError();
      }
      throw error;
    }
  }
}

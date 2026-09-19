import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import {
  BRANCH_FILTER_FIELDS,
  BRANCH_PUBLIC_SELECT,
  BRANCH_SEARCH_FIELDS,
  BRANCH_SORT_FIELDS,
} from '../constants/branch.constants';
import {
  BranchHours,
  HoursException,
} from '../constants/branch-hours.constants';
import { ListBranchesQueryDto } from '../dto/list-branches-query.dto';
import {
  toBranchHoursWrite,
  toHoursExceptionsWrite,
} from '../utils/branch-hours.util';

type BranchWrite = {
  name: string;
  hours?: BranchHours | null;
  hoursExceptions?: HoursException[] | null;
};

@Injectable()
export class BranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  addForPlatform(tenantId: string, data: BranchWrite) {
    return this.prisma.withPlatform(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      if (!tenant) {
        throw this.tenantNotFoundError();
      }
      return tx.branch.create({
        data: {
          tenantId,
          name: data.name,
          ...toBranchHoursWrite(data.hours),
          ...toHoursExceptionsWrite(data.hoursExceptions),
        },
        select: BRANCH_PUBLIC_SELECT,
      });
    });
  }

  create(tenantId: string, data: BranchWrite) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.branch.create({
        data: {
          tenantId,
          name: data.name,
          ...toBranchHoursWrite(data.hours),
          ...toHoursExceptionsWrite(data.hoursExceptions),
        },
        select: BRANCH_PUBLIC_SELECT,
      }),
    );
  }

  findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.branch.findFirst({
        where: { id, tenantId },
        select: BRANCH_PUBLIC_SELECT,
      }),
    );
  }

  update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      status?: 'ACTIVE' | 'ARCHIVED';
      hours?: BranchHours | null;
      hoursExceptions?: HoursException[] | null;
    },
  ) {
    const { hours, hoursExceptions, ...rest } = data;
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.branch.update({
        where: { id },
        data: {
          ...rest,
          ...toBranchHoursWrite(hours),
          ...toHoursExceptionsWrite(hoursExceptions),
        },
        select: BRANCH_PUBLIC_SELECT,
      }),
    );
  }

  countActive(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.branch.count({ where: { tenantId, status: 'ACTIVE' } }),
    );
  }

  countActiveStaff(tenantId: string, branchId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.count({
        where: {
          tenantId,
          branchId,
          status: 'ACTIVE',
          role: 'BRANCH_STAFF',
        },
      }),
    );
  }

  findMany(tenantId: string, query: ListBranchesQueryDto) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
      .filter(BRANCH_FILTER_FIELDS)
      .search(BRANCH_SEARCH_FIELDS)
      .sort(BRANCH_SORT_FIELDS)
      .paginate();

    const { where, orderBy, skip, take } = features.args();
    const scopedWhere: Prisma.BranchWhereInput = {
      ...(where as Prisma.BranchWhereInput),
      tenantId,
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [data, total] = await Promise.all([
        tx.branch.findMany({
          where: scopedWhere,
          orderBy: orderBy as Prisma.BranchOrderByWithRelationInput[],
          skip,
          take,
          select: BRANCH_PUBLIC_SELECT,
        }),
        tx.branch.count({ where: scopedWhere }),
      ]);
      return features.paginateResult(data, total);
    });
  }

  isUniqueConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }

  nameTakenError(): AppHttpException {
    return new AppHttpException(
      HttpStatus.CONFLICT,
      ErrorCode.BRANCH_NAME_TAKEN,
      'This tenant already has a branch with that name',
    );
  }

  tenantNotFoundError(): AppHttpException {
    return new AppHttpException(
      HttpStatus.NOT_FOUND,
      ErrorCode.TENANT_NOT_FOUND,
      'Tenant not found',
    );
  }
}

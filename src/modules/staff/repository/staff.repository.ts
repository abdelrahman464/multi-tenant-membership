import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import { requireActiveBranch } from '../../tenants/utils/require-active-branch.util';
import { SESSION_TENANT_SELECT } from '../../tenants/constants/tenant.constants';
import {
  STAFF_FILTER_FIELDS,
  STAFF_PUBLIC_SELECT,
  STAFF_SEARCH_FIELDS,
  STAFF_SORT_FIELDS,
} from '../constants/staff.constants';
import { CreateStaffDto } from '../dto/create-staff.dto';
import { ListStaffQueryDto } from '../dto/list-staff-query.dto';
import { StaffStatus } from '../enums/staff-status.enum';
import { AssignableStaffRole } from '../enums/staff-role.enum';

@Injectable()
export class StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTenantBySlug(slug: string) {
    return this.prisma.withPlatform((tx) =>
      tx.tenant.findUnique({
        where: { slug },
        select: { id: true, slug: true, status: true },
      }),
    );
  }

  findSessionTenant(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: SESSION_TENANT_SELECT,
      }),
    );
  }

  findByEmailWithPassword(tenantId: string, email: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.findUnique({
        where: { tenantId_email: { tenantId, email } },
        include: {
          branch: { select: { id: true, name: true } },
        },
      }),
    );
  }

  findByIdInTenant(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.findFirst({
        where: { id, tenantId },
        include: {
          branch: { select: { id: true, name: true } },
          tenant: { select: { id: true, status: true } },
        },
      }),
    );
  }

  findByIdWithPassword(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.findFirst({
        where: { id, tenantId },
      }),
    );
  }

  findMany(tenantId: string, query: ListStaffQueryDto) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
      .filter(STAFF_FILTER_FIELDS)
      .search(STAFF_SEARCH_FIELDS)
      .sort(STAFF_SORT_FIELDS)
      .paginate();

    const { where, orderBy, skip, take } = features.args();
    const scopedWhere: Prisma.StaffWhereInput = {
      ...(where as Prisma.StaffWhereInput),
      tenantId,
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [data, total] = await Promise.all([
        tx.staff.findMany({
          where: scopedWhere,
          orderBy: orderBy as Prisma.StaffOrderByWithRelationInput[],
          skip,
          take,
          select: STAFF_PUBLIC_SELECT,
        }),
        tx.staff.count({ where: scopedWhere }),
      ]);
      return features.paginateResult(data, total);
    });
  }

  async create(tenantId: string, data: CreateStaffDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (data.branchId) {
        await requireActiveBranch(tx, tenantId, data.branchId);
      }

      return tx.staff.create({
        data: {
          tenantId,
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role,
          branchId: data.branchId ?? null,
        },
        select: STAFF_PUBLIC_SELECT,
      });
    });
  }

  findPublicById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.findFirst({
        where: { id, tenantId },
        select: STAFF_PUBLIC_SELECT,
      }),
    );
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      email?: string;
      password?: string;
      role?: AssignableStaffRole;
      branchId?: string | null;
      status?: StaffStatus;
      bumpSessionVersion: boolean;
    },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (data.branchId) {
        await requireActiveBranch(tx, tenantId, data.branchId);
      }

      return tx.staff.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.password !== undefined ? { password: data.password } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.branchId !== undefined ? { branchId: data.branchId } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.bumpSessionVersion
            ? { sessionVersion: { increment: 1 } }
            : {}),
        },
        select: STAFF_PUBLIC_SELECT,
      });
    });
  }

  bumpSessionVersion(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.update({
        where: { id },
        data: { sessionVersion: { increment: 1 } },
        select: STAFF_PUBLIC_SELECT,
      }),
    );
  }

  updatePassword(
    tenantId: string,
    id: string,
    password: string,
    options: { bumpSessionVersion: boolean },
  ) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.update({
        where: { id },
        data: {
          password,
          ...(options.bumpSessionVersion
            ? { sessionVersion: { increment: 1 } }
            : {}),
        },
        include: {
          branch: { select: { id: true, name: true } },
        },
      }),
    );
  }

  isUniqueConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }

  emailTakenError(): AppHttpException {
    return new AppHttpException(
      HttpStatus.CONFLICT,
      ErrorCode.STAFF_EMAIL_TAKEN,
      'A staff member with this email already exists in this tenant',
    );
  }
}

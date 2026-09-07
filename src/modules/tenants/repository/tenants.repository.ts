import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { TenantStatus } from '../enums/tenant-status.enum';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { PrismaService } from '../../../database/prisma.service';
import { STAFF_PUBLIC_SELECT } from '../../staff/constants/staff.constants';
import {
  BRANCH_SEARCH_FIELDS,
  BRANCH_SORT_FIELDS,
  TENANT_FILTER_FIELDS,
  TENANT_SEARCH_FIELDS,
  TENANT_SORT_FIELDS,
} from '../constants/tenant.constants';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { PersistTenantDto } from '../dto/create-tenant.dto';
import { ListBranchesQueryDto } from '../dto/list-branches-query.dto';
import { ListTenantsQueryDto } from '../dto/list-tenants-query.dto';
import { UpdateTenantSettingsDto } from '../dto/update-tenant-settings.dto';
import { SETTINGS_PUBLIC_SELECT } from '../constants/settings.constants';

@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createWithFirstBranch(dto: PersistTenantDto) {
    const { firstBranch, firstOwner, ...tenant } = dto;
    return this.prisma.withPlatform((tx) =>
      tx.tenant.create({
        data: {
          ...tenant,
          settings: { create: {} },
          branches: { create: firstBranch },
          staff: {
            create: {
              name: firstOwner.name,
              email: firstOwner.email,
              password: firstOwner.password,
              role: 'TENANT_OWNER',
            },
          },
        },
        include: {
          settings: true,
          branches: true,
          staff: { select: STAFF_PUBLIC_SELECT },
        },
      }),
    );
  }

  findSlugsLike(baseSlug: string, excludeId?: string): Promise<string[]> {
    return this.prisma.withPlatform(async (tx) => {
      const rows = await tx.tenant.findMany({
        where: {
          OR: [{ slug: baseSlug }, { slug: { startsWith: `${baseSlug}-` } }],
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { slug: true },
      });
      const escaped = baseSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exact = new RegExp(`^${escaped}(-\\d+)?$`);
      return rows.map((row) => row.slug).filter((slug) => exact.test(slug));
    });
  }

  findAll(query: ListTenantsQueryDto) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
      .filter(TENANT_FILTER_FIELDS)
      .search(TENANT_SEARCH_FIELDS)
      .sort(TENANT_SORT_FIELDS)
      .paginate();

    const { where, orderBy, skip, take } = features.args();

    return this.prisma.withPlatform(async (tx) => {
      const args = {
        where: where as Prisma.TenantWhereInput,
        orderBy: orderBy as Prisma.TenantOrderByWithRelationInput[],
        skip,
        take,
      };
      const [data, total] = await Promise.all([
        tx.tenant.findMany({
          ...args,
          include: { settings: true, branches: true },
        }),
        tx.tenant.count({ where: args.where }),
      ]);
      return features.paginateResult(data, total);
    });
  }

  findById(id: string) {
    return this.prisma.withPlatform((tx) =>
      tx.tenant.findUnique({
        where: { id },
        include: { settings: true, branches: true },
      }),
    );
  }

  updateStatus(id: string, status: TenantStatus) {
    return this.prisma.withPlatform((tx) =>
      tx.tenant.update({
        where: { id },
        data: { status },
        include: { settings: true, branches: true },
      }),
    );
  }

  update(id: string, data: { name?: string; slug?: string }) {
    return this.prisma.withPlatform((tx) =>
      tx.tenant.update({
        where: { id },
        data,
        include: { settings: true, branches: true },
      }),
    );
  }

  delete(id: string) {
    return this.prisma.withPlatform((tx) =>
      tx.tenant.delete({ where: { id } }),
    );
  }

  addBranch(tenantId: string, dto: CreateBranchDto) {
    return this.prisma.withPlatform((tx) =>
      tx.branch.create({
        data: { tenantId, ...dto },
      }),
    );
  }

  findSettings(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.tenantSettings.upsert({
        where: { tenantId },
        create: { tenantId },
        update: {},
        select: SETTINGS_PUBLIC_SELECT,
      }),
    );
  }

  updateSettings(tenantId: string, data: UpdateTenantSettingsDto) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.tenantSettings.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
        select: SETTINGS_PUBLIC_SELECT,
      }),
    );
  }

  findBranchesByTenant(tenantId: string, query: ListBranchesQueryDto) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
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
          select: {
            id: true,
            tenantId: true,
            name: true,
            createdAt: true,
          },
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

  tenantNameTakenError(): AppHttpException {
    return new AppHttpException(
      HttpStatus.CONFLICT,
      ErrorCode.TENANT_NAME_TAKEN,
      'A tenant with this name already exists',
    );
  }

  slugTakenError(): AppHttpException {
    return new AppHttpException(
      HttpStatus.CONFLICT,
      ErrorCode.TENANT_SLUG_TAKEN,
      'A tenant with this slug already exists',
    );
  }

  branchNameTakenError(): AppHttpException {
    return new AppHttpException(
      HttpStatus.CONFLICT,
      ErrorCode.BRANCH_NAME_TAKEN,
      'This tenant already has a branch with that name',
    );
  }
}

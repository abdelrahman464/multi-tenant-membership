import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import {
  PLAN_FILTER_FIELDS,
  PLAN_INCLUDE,
  PLAN_SEARCH_FIELDS,
  PLAN_SORT_FIELDS,
} from '../constants/plan.constants';
import { ListPlansQueryDto } from '../dto/list-plans-query.dto';
import { PlanStatus } from '../enums/plan-status.enum';
import { toPublicPlan } from '../mappers/plan.mapper';

export type PersistPlanCreate = {
  name: string;
  durationDays: number;
  sessionCount: number | null;
  maxVisitsPerDay: number;
  price: number;
  allBranches: boolean;
  branchIds: string[];
};

export type PersistPlanUpdate = {
  name?: string;
  durationDays?: number;
  sessionCount?: number | null;
  maxVisitsPerDay?: number;
  price?: number;
  allBranches?: boolean;
  branchIds?: string[];
  status?: PlanStatus;
};

@Injectable()
export class PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string, query: ListPlansQueryDto) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
      .filter(PLAN_FILTER_FIELDS)
      .search(PLAN_SEARCH_FIELDS)
      .sort(PLAN_SORT_FIELDS)
      .paginate();

    const { where, orderBy, skip, take } = features.args();
    const scopedWhere: Prisma.PlanWhereInput = {
      ...(where as Prisma.PlanWhereInput),
      tenantId,
    };

    if (query.branchId) {
      scopedWhere.AND = [
        {
          OR: [
            { allBranches: true },
            { branches: { some: { branchId: query.branchId } } },
          ],
        },
      ];
    }

    return this.prisma.withTenant(tenantId, async (tx) => {
      if (query.branchId) {
        await this.assertBranches(tx, tenantId, [query.branchId]);
      }
      const [rows, total] = await Promise.all([
        tx.plan.findMany({
          where: scopedWhere,
          orderBy: orderBy as Prisma.PlanOrderByWithRelationInput[],
          skip,
          take,
          include: PLAN_INCLUDE,
        }),
        tx.plan.count({ where: scopedWhere }),
      ]);
      return features.paginateResult(rows.map(toPublicPlan), total);
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const plan = await tx.plan.findFirst({
        where: { id, tenantId },
        include: PLAN_INCLUDE,
      });
      return plan ? toPublicPlan(plan) : null;
    });
  }

  async create(tenantId: string, data: PersistPlanCreate) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (!data.allBranches) {
        await this.assertBranches(tx, tenantId, data.branchIds);
      }

      const plan = await tx.plan.create({
        data: {
          tenantId,
          name: data.name,
          durationDays: data.durationDays,
          sessionCount: data.sessionCount,
          maxVisitsPerDay: data.maxVisitsPerDay,
          price: data.price,
          allBranches: data.allBranches,
          ...(data.allBranches
            ? {}
            : {
                branches: {
                  create: data.branchIds.map((branchId) => ({
                    tenantId,
                    branchId,
                  })),
                },
              }),
        },
        include: PLAN_INCLUDE,
      });
      return toPublicPlan(plan);
    });
  }

  async update(tenantId: string, id: string, data: PersistPlanUpdate) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.plan.findFirst({
        where: { id, tenantId },
        select: { id: true, allBranches: true },
      });
      if (!existing) {
        return null;
      }

      const nextAllBranches = data.allBranches ?? existing.allBranches;
      if (nextAllBranches && data.branchIds?.length) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.BRANCH_NOT_ALLOWED,
          'All-locations plans must not list selected branches',
        );
      }
      if (!nextAllBranches && data.branchIds?.length) {
        await this.assertBranches(tx, tenantId, data.branchIds);
      }

      const patch: Prisma.PlanUpdateInput = {};
      if (data.name !== undefined) patch.name = data.name;
      if (data.durationDays !== undefined) {
        patch.durationDays = data.durationDays;
      }
      if (data.sessionCount !== undefined) {
        patch.sessionCount = data.sessionCount;
      }
      if (data.maxVisitsPerDay !== undefined) {
        patch.maxVisitsPerDay = data.maxVisitsPerDay;
      }
      if (data.price !== undefined) patch.price = data.price;
      if (data.allBranches !== undefined) patch.allBranches = data.allBranches;
      if (data.status !== undefined) patch.status = data.status;

      if (data.allBranches === true) {
        await tx.planBranch.deleteMany({ where: { planId: id, tenantId } });
      } else if (data.branchIds?.length) {
        await tx.planBranch.deleteMany({ where: { planId: id, tenantId } });
        await tx.planBranch.createMany({
          data: data.branchIds.map((branchId) => ({
            tenantId,
            planId: id,
            branchId,
          })),
        });
      }

      const plan = await tx.plan.update({
        where: { id },
        data: patch,
        include: PLAN_INCLUDE,
      });
      return toPublicPlan(plan);
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
      ErrorCode.PLAN_NAME_TAKEN,
      'A plan with this name already exists in this tenant',
    );
  }

  private async assertBranches(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(branchIds)];
    const found = await tx.branch.findMany({
      where: { id: { in: uniqueIds }, tenantId },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.BRANCH_NOT_FOUND,
        'Branch not found',
      );
    }
  }
}

import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import {
  SUBSCRIPTION_FILTER_FIELDS,
  SUBSCRIPTION_INCLUDE,
  SUBSCRIPTION_SORT_FIELDS,
} from '../constants/subscription.constants';
import { ListSubscriptionsQueryDto } from '../dto/list-subscriptions-query.dto';
import { toPublicSubscription } from '../mappers/subscription.mapper';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';

const MS_PER_DAY = 86_400_000;

@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string, query: ListSubscriptionsQueryDto) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
      .filter(SUBSCRIPTION_FILTER_FIELDS)
      .sort(SUBSCRIPTION_SORT_FIELDS)
      .paginate();

    const { where, orderBy, skip, take } = features.args();
    const scopedWhere: Prisma.SubscriptionWhereInput = {
      ...(where as Prisma.SubscriptionWhereInput),
      tenantId,
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.subscription.findMany({
          where: scopedWhere,
          orderBy: orderBy as Prisma.SubscriptionOrderByWithRelationInput[],
          skip,
          take,
          include: SUBSCRIPTION_INCLUDE,
        }),
        tx.subscription.count({ where: scopedWhere }),
      ]);
      return features.paginateResult(rows.map(toPublicSubscription), total);
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const row = await tx.subscription.findFirst({
        where: { id, tenantId },
        include: SUBSCRIPTION_INCLUDE,
      });
      return row ? toPublicSubscription(row) : null;
    });
  }

  create(tenantId: string, data: CreateSubscriptionDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const member = await tx.member.findFirst({
        where: { id: data.memberId, tenantId },
        select: { id: true, status: true },
      });
      if (!member) {
        throw new AppHttpException(
          HttpStatus.NOT_FOUND,
          ErrorCode.MEMBER_NOT_FOUND,
          'Member not found',
        );
      }
      if (member.status === 'ARCHIVED') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.MEMBER_ARCHIVED,
          'Archived members cannot join a plan',
        );
      }

      const plan = await tx.plan.findFirst({
        where: { id: data.planId, tenantId },
      });
      if (!plan) {
        throw new AppHttpException(
          HttpStatus.NOT_FOUND,
          ErrorCode.PLAN_NOT_FOUND,
          'Plan not found',
        );
      }
      if (plan.status === 'ARCHIVED') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.PLAN_ARCHIVED,
          'Archived plans cannot be sold',
        );
      }

      const startsAt = new Date();
      const endsAt = new Date(
        startsAt.getTime() + plan.durationDays * MS_PER_DAY,
      );

      const row = await tx.subscription.create({
        data: {
          tenantId,
          memberId: member.id,
          planId: plan.id,
          planName: plan.name,
          durationDays: plan.durationDays,
          sessionCount: plan.sessionCount,
          sessionsRemaining: plan.sessionCount,
          maxVisitsPerDay: plan.maxVisitsPerDay,
          price: plan.price,
          allBranches: plan.allBranches,
          startsAt,
          endsAt,
        },
        include: SUBSCRIPTION_INCLUDE,
      });
      return toPublicSubscription(row);
    });
  }
}

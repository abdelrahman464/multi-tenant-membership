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
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { ListSubscriptionsQueryDto } from '../dto/list-subscriptions-query.dto';
import { toPublicSubscription } from '../mappers/subscription.mapper';
import { addUtcDays, freezeDaysUsedThisYear } from '../utils/freeze.util';

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
      await this.settleExpiredFreezes(tx, tenantId);
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
      return features.paginateResult(
        rows.map((row) => toPublicSubscription(row)),
        total,
      );
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.settleExpiredFreezes(tx, tenantId, id);
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

      return this.insertSoldPlan(tx, tenantId, member.id, plan);
    });
  }

  freeze(tenantId: string, id: string, days: number) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      await this.settleExpiredFreezes(tx, tenantId, id);

      const subscription = await tx.subscription.findFirst({
        where: { id, tenantId },
        include: { freezes: true },
      });
      if (!subscription) {
        return null;
      }
      if (subscription.status === 'CANCELLED') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.SUBSCRIPTION_NOT_ACTIVE,
          'Cancelled subscriptions cannot be frozen',
        );
      }
      if (subscription.status === 'FROZEN') {
        throw new AppHttpException(
          HttpStatus.CONFLICT,
          ErrorCode.SUBSCRIPTION_ALREADY_FROZEN,
          'Subscription is already frozen',
        );
      }
      if (now >= subscription.endsAt) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.SUBSCRIPTION_NOT_ACTIVE,
          'An expired subscription has no calendar left to pause',
        );
      }

      const settings = await tx.tenantSettings.findUnique({
        where: { tenantId },
      });
      if (!settings?.freezeEnabled) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.FREEZE_DISABLED,
          'This tenant does not allow freezes',
        );
      }
      if (settings.maxFreezeDays > 0 && days > settings.maxFreezeDays) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.FREEZE_DAYS_EXCEEDED,
          `A freeze cannot exceed ${settings.maxFreezeDays} days`,
        );
      }
      const used = freezeDaysUsedThisYear(subscription.freezes, now);
      if (
        settings.maxFreezeDaysPerYear > 0 &&
        used + days > settings.maxFreezeDaysPerYear
      ) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.FREEZE_YEAR_EXCEEDED,
          `Freeze days this year cannot exceed ${settings.maxFreezeDaysPerYear} days - you have already used ${used} days`,
        );
      }

      const freezeEndsAt = addUtcDays(now, days);
      await tx.subscriptionFreeze.create({
        data: {
          tenantId,
          subscriptionId: id,
          days,
          startedAt: now,
          endedAt: freezeEndsAt,
        },
      });

      const row = await tx.subscription.update({
        where: { id },
        data: {
          status: 'FROZEN',
          frozenAt: now,
          freezeEndsAt,
          endsAt: addUtcDays(subscription.endsAt, days),
        },
        include: SUBSCRIPTION_INCLUDE,
      });
      return toPublicSubscription(row, now);
    });
  }

  unfreeze(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      await this.settleExpiredFreezes(tx, tenantId, id);

      const subscription = await tx.subscription.findFirst({
        where: { id, tenantId },
        include: {
          freezes: {
            where: { unfrozenAt: null },
            orderBy: { startedAt: 'desc' },
          },
        },
      });
      if (!subscription) {
        return null;
      }
      if (subscription.status !== 'FROZEN') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.SUBSCRIPTION_NOT_FROZEN,
          'Subscription is not frozen',
        );
      }

      const open = subscription.freezes[0];
      const unusedMs = subscription.freezeEndsAt
        ? Math.max(0, subscription.freezeEndsAt.getTime() - now.getTime())
        : 0;
      const nextEndsAt = new Date(subscription.endsAt.getTime() - unusedMs);

      if (open) {
        await tx.subscriptionFreeze.update({
          where: { id: open.id },
          data: { unfrozenAt: now },
        });
      }

      const row = await tx.subscription.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          frozenAt: null,
          freezeEndsAt: null,
          endsAt: nextEndsAt,
        },
        include: SUBSCRIPTION_INCLUDE,
      });
      return toPublicSubscription(row, now);
    });
  }

  renew(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      await this.settleExpiredFreezes(tx, tenantId, id);

      const subscription = await tx.subscription.findFirst({
        where: { id, tenantId },
      });
      if (!subscription) {
        return null;
      }
      if (subscription.status === 'CANCELLED') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.SUBSCRIPTION_NOT_ACTIVE,
          'Cancelled subscriptions cannot be renewed',
        );
      }
      if (subscription.status === 'FROZEN') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.SUBSCRIPTION_FROZEN,
          'Unfreeze the subscription before renewing',
        );
      }
      if (now < subscription.endsAt) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.SUBSCRIPTION_NOT_ENDED,
          'Subscription has not ended yet',
        );
      }

      const member = await tx.member.findFirst({
        where: { id: subscription.memberId, tenantId },
        select: { id: true, status: true },
      });
      if (!member || member.status === 'ARCHIVED') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.MEMBER_ARCHIVED,
          'Archived members cannot join a plan',
        );
      }

      const plan = await tx.plan.findFirst({
        where: { id: subscription.planId, tenantId },
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

      return this.insertSoldPlan(tx, tenantId, member.id, plan, now);
    });
  }

  private async insertSoldPlan(
    tx: Prisma.TransactionClient,
    tenantId: string,
    memberId: string,
    plan: {
      id: string;
      name: string;
      durationDays: number;
      sessionCount: number | null;
      maxVisitsPerDay: number;
      price: Prisma.Decimal;
      allBranches: boolean;
    },
    now = new Date(),
  ) {
    const row = await tx.subscription.create({
      data: {
        tenantId,
        memberId,
        planId: plan.id,
        planName: plan.name,
        durationDays: plan.durationDays,
        sessionCount: plan.sessionCount,
        sessionsRemaining: plan.sessionCount,
        maxVisitsPerDay: plan.maxVisitsPerDay,
        price: plan.price,
        allBranches: plan.allBranches,
        startsAt: now,
        endsAt: addUtcDays(now, plan.durationDays),
      },
      include: SUBSCRIPTION_INCLUDE,
    });
    return toPublicSubscription(row, now);
  }

  // TODO: add background job to settle expired freezes
  private async settleExpiredFreezes(
    tx: Prisma.TransactionClient,
    tenantId: string,
    subscriptionId?: string,
  ): Promise<void> {
    const now = new Date();

    const overdue = await tx.subscriptionFreeze.findMany({
      where: {
        tenantId,
        unfrozenAt: null,
        endedAt: { lte: now },
        ...(subscriptionId ? { subscriptionId } : {}),
      },
    });
    for (const freeze of overdue) {
      await tx.subscriptionFreeze.update({
        where: { id: freeze.id },
        data: { unfrozenAt: freeze.endedAt },
      });
      await tx.subscription.update({
        where: { id: freeze.subscriptionId },
        data: {
          status: 'ACTIVE',
          frozenAt: null,
          freezeEndsAt: null,
        },
      });
    }
  }
}

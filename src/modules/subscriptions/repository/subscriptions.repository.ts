import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus, PaymentStatus } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import {
  SUBSCRIPTION_FILTER_FIELDS,
  SUBSCRIPTION_INCLUDE,
  SUBSCRIPTION_SORT_FIELDS,
} from '../constants/subscription.constants';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { ListSubscriptionsQueryDto } from '../dto/list-subscriptions-query.dto';
import {
  toPublicSubscription,
  type SubscriptionRow,
} from '../mappers/subscription.mapper';
import { expiryCutoff, graceDaysFromSettings } from '../utils/access.util';
import { endingSoonWhere } from '../utils/ending-soon.util';
import { addUtcDays, freezeDaysUsedThisYear } from '../utils/freeze.util';
import { soldPlanEndsAt } from '../utils/sold-plan-ends.util';
import {
  assertMemberCanBeSold,
  memberOnBooksWhere,
} from '../../members/utils/member-access.util';

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
      await this.settleSubscriptionState(tx, tenantId);
      const deskIds = await this.deskListIds(tx, tenantId, query);
      if (deskIds) {
        if (deskIds.length === 0) {
          return features.paginateResult([], 0);
        }
        scopedWhere.AND = [...asAnd(scopedWhere.AND), { id: { in: deskIds } }];
      }
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
      const mapped = await this.toPublicRows(tx, tenantId, rows);
      return features.paginateResult(mapped, total);
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.settleSubscriptionState(tx, tenantId, id);
      const row = await tx.subscription.findFirst({
        where: { id, tenantId },
        include: SUBSCRIPTION_INCLUDE,
      });
      return row ? this.toPublicRow(tx, tenantId, row) : null;
    });
  }

  create(actor: AuthenticatedUser, data: CreateSubscriptionDto) {
    return this.prisma.withTenant(actor.tenantId, async (tx) => {
      const member = await tx.member.findFirst({
        where: { id: data.memberId, tenantId: actor.tenantId },
        select: { id: true, status: true },
      });
      if (!member) {
        throw new AppHttpException(
          HttpStatus.NOT_FOUND,
          ErrorCode.MEMBER_NOT_FOUND,
          'Member not found',
        );
      }
      assertMemberCanBeSold(member.status);

      const plan = await tx.plan.findFirst({
        where: { id: data.planId, tenantId: actor.tenantId },
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

      return this.insertSoldPlan(tx, actor.tenantId, member.id, plan, actor.id);
    });
  }

  freeze(tenantId: string, id: string, days: number) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      await this.settleSubscriptionState(tx, tenantId, id);

      const subscription = await tx.subscription.findFirst({
        where: { id, tenantId },
        include: { freezes: true },
      });
      if (!subscription) {
        return null;
      }
      if (subscription.kind === 'DAY_PASS') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.DAY_PASS_NO_FREEZE,
          'Day passes cannot be frozen',
        );
      }
      if (
        subscription.status === 'CANCELLED' ||
        subscription.status === 'EXPIRED' ||
        subscription.status === 'IN_GRACE'
      ) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.SUBSCRIPTION_NOT_ACTIVE,
          'Only an active subscription can be frozen',
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
      return this.toPublicRow(tx, tenantId, row, now);
    });
  }

  unfreeze(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      await this.settleSubscriptionState(tx, tenantId, id);

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
      return this.toPublicRow(tx, tenantId, row, now);
    });
  }

  renew(actor: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(actor.tenantId, async (tx) => {
      const now = new Date();
      await this.settleSubscriptionState(tx, actor.tenantId, id);

      const subscription = await tx.subscription.findFirst({
        where: { id, tenantId: actor.tenantId },
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
        where: { id: subscription.memberId, tenantId: actor.tenantId },
        select: { id: true, status: true },
      });
      if (!member) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.MEMBER_ARCHIVED,
          'Archived members cannot join a plan',
        );
      }
      assertMemberCanBeSold(member.status);

      const plan = await tx.plan.findFirst({
        where: { id: subscription.planId, tenantId: actor.tenantId },
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

      return this.insertSoldPlan(
        tx,
        actor.tenantId,
        member.id,
        plan,
        actor.id,
        now,
      );
    });
  }

  cancel(actor: AuthenticatedUser, id: string, reason: string) {
    return this.prisma.withTenant(actor.tenantId, async (tx) => {
      const now = new Date();
      await this.settleSubscriptionState(tx, actor.tenantId, id);

      const subscription = await tx.subscription.findFirst({
        where: { id, tenantId: actor.tenantId },
      });
      if (!subscription) {
        return null;
      }
      if (subscription.status === SubscriptionStatus.CANCELLED) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.SUBSCRIPTION_ALREADY_CANCELLED,
          'This subscription is already cancelled',
        );
      }
      if (
        subscription.status !== SubscriptionStatus.ACTIVE &&
        subscription.status !== SubscriptionStatus.FROZEN &&
        subscription.status !== SubscriptionStatus.IN_GRACE
      ) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.SUBSCRIPTION_NOT_ACTIVE,
          'Only a live subscription can be cancelled',
        );
      }

      await tx.subscriptionFreeze.updateMany({
        where: {
          tenantId: actor.tenantId,
          subscriptionId: id,
          unfrozenAt: null,
        },
        data: { unfrozenAt: now },
      });

      const row = await tx.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: now,
          cancelledByStaffId: actor.id,
          cancelReason: reason.trim(),
          frozenAt: null,
          freezeEndsAt: null,
        },
        include: SUBSCRIPTION_INCLUDE,
      });
      return this.toPublicRow(tx, actor.tenantId, row, now);
    });
  }

  async insertSoldPlan(
    tx: Prisma.TransactionClient,
    tenantId: string,
    memberId: string,
    plan: {
      id: string;
      name: string;
      kind: string;
      durationDays: number;
      sessionCount: number | null;
      maxVisitsPerDay: number;
      price: Prisma.Decimal;
      allBranches: boolean;
    },
    soldByStaffId: string,
    now = new Date(),
  ) {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const timeZone = tenant?.timezone ?? 'Africa/Cairo';
    const row = await tx.subscription.create({
      data: {
        tenantId,
        memberId,
        planId: plan.id,
        soldByStaffId,
        planName: plan.name,
        kind: plan.kind === 'DAY_PASS' ? 'DAY_PASS' : 'MEMBERSHIP',
        durationDays: plan.durationDays,
        sessionCount: plan.sessionCount,
        sessionsRemaining: plan.sessionCount,
        maxVisitsPerDay: plan.maxVisitsPerDay,
        price: plan.price,
        allBranches: plan.allBranches,
        startsAt: now,
        endsAt: soldPlanEndsAt(plan.kind, now, plan.durationDays, timeZone),
      },
      include: SUBSCRIPTION_INCLUDE,
    });
    return this.toPublicRow(tx, tenantId, row, now);
  }

  /** Staff inbox list/unread settle this gym before they read notifications. */
  settleForTenant(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      this.settleSubscriptionState(tx, tenantId),
    );
  }

  settleInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    subscriptionId?: string,
  ) {
    return this.settleSubscriptionState(tx, tenantId, subscriptionId);
  }

  async deskListIds(
    tx: Prisma.TransactionClient,
    tenantId: string,
    query: {
      unpaid?: boolean;
      inProgress?: boolean;
      completedUnrenewed?: boolean;
      expired?: boolean;
      endingSoon?: boolean;
    },
  ): Promise<string[] | undefined> {
    const idFilters: string[][] = [];
    if (query.unpaid === true) {
      idFilters.push(await this.unpaidSubscriptionIds(tx, tenantId));
    }
    if (query.inProgress === true) {
      idFilters.push(await this.inProgressSubscriptionIds(tx, tenantId));
    }
    if (query.completedUnrenewed === true) {
      idFilters.push(
        await this.completedUnrenewedSubscriptionIds(tx, tenantId),
      );
    }
    if (query.expired === true) {
      idFilters.push(await this.expiredSubscriptionIds(tx, tenantId));
    }
    if (query.endingSoon === true) {
      idFilters.push(await this.endingSoonSubscriptionIds(tx, tenantId));
    }
    if (idFilters.length === 0) {
      return undefined;
    }
    return intersectIds(idFilters);
  }

  recordLifecycleNotifications(
    tx: Prisma.TransactionClient,
    tenantId: string,
    type: LifecycleNotificationType,
    rows: {
      id: string;
      memberId: string;
      planName: string;
      member: { name: string };
    }[],
  ) {
    return this.recordNotifications(tx, tenantId, type, rows);
  }

  /** Platform sweep: settle freezes, expire past endsAt / accessUntil, record inbox rows. */
  expireAllTenants() {
    return this.prisma.withPlatform(async (tx) => {
      const tenants = await tx.tenant.findMany({ select: { id: true } });
      for (const tenant of tenants) {
        await this.settleSubscriptionState(tx, tenant.id);
      }
    });
  }

  private async settleSubscriptionState(
    tx: Prisma.TransactionClient,
    tenantId: string,
    subscriptionId?: string,
  ): Promise<void> {
    await this.settleExpiredFreezes(tx, tenantId, subscriptionId);
    const settings = await tx.tenantSettings.findUnique({
      where: { tenantId },
      select: { graceEnabled: true, graceDays: true },
    });
    const graceDays = graceDaysFromSettings(settings);
    await this.expireActivePastAccess(tx, tenantId, graceDays, subscriptionId);
    await this.notifyEndingSoon(tx, tenantId, subscriptionId);
  }

  private async expireActivePastAccess(
    tx: Prisma.TransactionClient,
    tenantId: string,
    graceDays: number,
    subscriptionId?: string,
  ): Promise<void> {
    const now = new Date();
    const due = await tx.subscription.findMany({
      where: {
        tenantId,
        ...(subscriptionId ? { id: subscriptionId } : {}),
        OR: [
          { status: 'ACTIVE', endsAt: { lte: now } },
          {
            status: 'IN_GRACE',
            graceEndsAt: { lte: now },
          },
          {
            status: 'IN_GRACE',
            graceEndsAt: null,
            endsAt: { lte: expiryCutoff(now, graceDays) },
          },
        ],
      },
      select: {
        id: true,
        memberId: true,
        planName: true,
        member: { select: { name: true } },
      },
    });
    if (due.length === 0) {
      return;
    }
    await tx.subscription.updateMany({
      where: { tenantId, id: { in: due.map((row) => row.id) } },
      data: { status: 'EXPIRED', expiredAt: now },
    });
    await this.recordNotifications(tx, tenantId, 'SUBSCRIPTION_EXPIRED', due);
  }

  private async notifyEndingSoon(
    tx: Prisma.TransactionClient,
    tenantId: string,
    subscriptionId?: string,
  ): Promise<void> {
    const now = new Date();
    const due = await tx.subscription.findMany({
      where: {
        tenantId,
        ...(subscriptionId ? { id: subscriptionId } : {}),
        ...endingSoonWhere(now),
      },
      select: {
        id: true,
        memberId: true,
        planName: true,
        member: { select: { name: true } },
      },
    });
    await this.recordNotifications(
      tx,
      tenantId,
      'SUBSCRIPTION_ENDING_SOON',
      due,
    );
  }

  private async recordNotifications(
    tx: Prisma.TransactionClient,
    tenantId: string,
    type: LifecycleNotificationType,
    rows: {
      id: string;
      memberId: string;
      planName: string;
      member: { name: string };
    }[],
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await tx.notification.createMany({
      data: rows.map((row) => ({
        id: randomUUID(),
        tenantId,
        type,
        subscriptionId: row.id,
        memberId: row.memberId,
        memberName: row.member.name,
        planName: row.planName,
      })),
      skipDuplicates: true,
    });
  }

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
        subscription: { status: { not: SubscriptionStatus.CANCELLED } },
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

  private async unpaidSubscriptionIds(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string[]> {
    const billed = await tx.subscription.findMany({
      where: {
        tenantId,
        status: { not: SubscriptionStatus.CANCELLED },
        price: { gt: 0 },
        member: memberOnBooksWhere,
      },
      select: { id: true, price: true },
    });
    if (billed.length === 0) {
      return [];
    }
    const paid = await this.paidTotals(
      tx,
      tenantId,
      billed.map((row) => row.id),
    );
    return billed
      .filter((row) => Number(row.price) - (paid.get(row.id) ?? 0) > 0)
      .map((row) => row.id);
  }

  private async inProgressSubscriptionIds(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string[]> {
    const rows = await this.lifecycleRows(tx, tenantId);
    return rows
      .filter((row) => row.member.status !== 'ARCHIVED' && isInProgress(row))
      .map((row) => row.id);
  }

  private async expiredSubscriptionIds(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string[]> {
    const rows = await tx.subscription.findMany({
      where: {
        tenantId,
        status: SubscriptionStatus.EXPIRED,
        member: memberOnBooksWhere,
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async endingSoonSubscriptionIds(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string[]> {
    const rows = await tx.subscription.findMany({
      where: {
        tenantId,
        ...endingSoonWhere(),
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async completedUnrenewedSubscriptionIds(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string[]> {
    const rows = await this.lifecycleRows(tx, tenantId);
    const latest = new Map<string, { id: string; createdAt: Date }>();
    for (const row of rows) {
      const key = `${row.memberId}:${row.planId}`;
      const current = latest.get(key);
      if (!current || row.createdAt > current.createdAt) {
        latest.set(key, { id: row.id, createdAt: row.createdAt });
      }
    }
    const latestIds = new Set([...latest.values()].map((row) => row.id));
    return rows
      .filter((row) => {
        return (
          row.kind !== 'DAY_PASS' && latestIds.has(row.id) && isFinished(row)
        );
      })
      .map((row) => row.id);
  }

  private lifecycleRows(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.subscription.findMany({
      where: { tenantId, status: { not: SubscriptionStatus.CANCELLED } },
      select: {
        id: true,
        memberId: true,
        planId: true,
        createdAt: true,
        status: true,
        sessionCount: true,
        sessionsRemaining: true,
        kind: true,
        member: { select: { status: true } },
      },
    });
  }

  private async paidTotals(
    tx: Prisma.TransactionClient,
    tenantId: string,
    subscriptionIds: string[],
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (subscriptionIds.length === 0) {
      return totals;
    }
    const grouped = await tx.payment.groupBy({
      by: ['subscriptionId'],
      where: {
        tenantId,
        subscriptionId: { in: subscriptionIds },
        status: PaymentStatus.COLLECTED,
      },
      _sum: { amount: true },
    });
    for (const row of grouped) {
      totals.set(row.subscriptionId, Number(row._sum.amount ?? 0));
    }
    return totals;
  }

  private async toPublicRows(
    tx: Prisma.TransactionClient,
    tenantId: string,
    rows: SubscriptionRow[],
    now?: Date,
  ) {
    const paid = await this.paidTotals(
      tx,
      tenantId,
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      toPublicSubscription(row, now, { paidTotal: paid.get(row.id) ?? 0 }),
    );
  }

  private async toPublicRow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    row: SubscriptionRow,
    now?: Date,
  ) {
    const paid =
      (await this.paidTotals(tx, tenantId, [row.id])).get(row.id) ?? 0;
    return toPublicSubscription(row, now, { paidTotal: paid });
  }
}

type LifecycleNotificationType =
  'SUBSCRIPTION_IN_GRACE' | 'SUBSCRIPTION_EXPIRED' | 'SUBSCRIPTION_ENDING_SOON';

function asAnd(
  value: Prisma.SubscriptionWhereInput['AND'],
): Prisma.SubscriptionWhereInput[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function intersectIds(groups: string[][]): string[] {
  if (groups.length === 0) return [];
  return groups.reduce((acc, next) => {
    const set = new Set(next);
    return acc.filter((id) => set.has(id));
  });
}

type LifecycleRow = {
  id: string;
  memberId: string;
  planId: string;
  createdAt: Date;
  status: SubscriptionStatus;
  kind: string;
  sessionCount: number | null;
  sessionsRemaining: number | null;
};

function isFinished(row: LifecycleRow): boolean {
  if (row.status === SubscriptionStatus.EXPIRED) return true;
  return row.sessionCount != null && (row.sessionsRemaining ?? 0) <= 0;
}

function isInProgress(row: LifecycleRow): boolean {
  if (
    row.status !== SubscriptionStatus.ACTIVE &&
    row.status !== SubscriptionStatus.FROZEN &&
    row.status !== SubscriptionStatus.IN_GRACE
  ) {
    return false;
  }
  if (row.sessionCount != null && (row.sessionsRemaining ?? 0) <= 0) {
    return false;
  }
  return true;
}

import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  zonedYmd,
  zonedYmdRangeBounds,
} from '../../check-ins/utils/tenant-day.util';
import { roundMoney } from '../../payments/mappers/payment.mapper';
import { addUtcDays } from '../../subscriptions/utils/freeze.util';
import { SubscriptionsRepository } from '../../subscriptions/repository/subscriptions.repository';
import { DASHBOARD_ENDING_SOON_DAYS } from '../constants/dashboard.constants';
import { PublicDashboard } from '../types/dashboard.type';

@Injectable()
export class DashboardRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  summary(
    tenantId: string,
    range: { from?: string; to?: string },
    now = new Date(),
  ): Promise<PublicDashboard> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.subscriptionsRepository.settleInTx(tx, tenantId);

      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { timezone: true, currency: true },
      });
      const timezone = tenant?.timezone ?? 'Africa/Cairo';
      const currency = tenant?.currency ?? 'EGP';
      const today = zonedYmd(now, timezone);
      const from = range.from ?? today;
      const to = range.to ?? range.from ?? today;
      const { gte, lt } = zonedYmdRangeBounds(from, to, timezone);
      const inRange = { gte, lt };
      const endingSoonUntil = addUtcDays(now, DASHBOARD_ENDING_SOON_DAYS);

      const [
        activeMembers,
        archivedMembers,
        joined,
        subGroups,
        endingSoon,
        checkInTotal,
        uniqueMemberRows,
        checkInsByBranch,
        branches,
        paymentGroups,
        billed,
        completedUnrenewedIds,
      ] = await Promise.all([
        tx.member.count({ where: { tenantId, status: 'ACTIVE' } }),
        tx.member.count({ where: { tenantId, status: 'ARCHIVED' } }),
        tx.member.count({
          where: { tenantId, createdAt: inRange },
        }),
        tx.subscription.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: { _all: true },
        }),
        tx.subscription.count({
          where: {
            tenantId,
            status: SubscriptionStatus.ACTIVE,
            endsAt: { gte: now, lte: endingSoonUntil },
          },
        }),
        tx.checkIn.count({
          where: { tenantId, checkedInAt: inRange },
        }),
        tx.checkIn.findMany({
          where: { tenantId, checkedInAt: inRange },
          distinct: ['memberId'],
          select: { memberId: true },
        }),
        tx.checkIn.groupBy({
          by: ['branchId'],
          where: { tenantId, checkedInAt: inRange },
          _count: { _all: true },
        }),
        tx.branch.findMany({
          where: { tenantId },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        tx.payment.groupBy({
          by: ['method'],
          where: { tenantId, paidAt: inRange },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        tx.subscription.findMany({
          where: {
            tenantId,
            status: { not: SubscriptionStatus.CANCELLED },
            price: { gt: 0 },
            member: { status: 'ACTIVE' },
          },
          select: { id: true, price: true },
        }),
        this.subscriptionsRepository.completedUnrenewedSubscriptionIds(
          tx,
          tenantId,
        ),
      ]);

      const branchCount = new Map(
        checkInsByBranch.map((row) => [row.branchId, row._count._all]),
      );
      const cash = paymentGroups.find((row) => row.method === 'CASH');
      const card = paymentGroups.find((row) => row.method === 'CARD');
      const collectedCash = roundMoney(Number(cash?._sum.amount ?? 0));
      const collectedCard = roundMoney(Number(card?._sum.amount ?? 0));

      return {
        timezone,
        currency,
        from,
        to,
        members: {
          active: activeMembers,
          archived: archivedMembers,
          joined,
        },
        subscriptions: {
          active: countStatus(subGroups, SubscriptionStatus.ACTIVE),
          frozen: countStatus(subGroups, SubscriptionStatus.FROZEN),
          inGrace: countStatus(subGroups, SubscriptionStatus.IN_GRACE),
          expired: countStatus(subGroups, SubscriptionStatus.EXPIRED),
          cancelled: countStatus(subGroups, SubscriptionStatus.CANCELLED),
          endingSoon,
          completedUnrenewed: completedUnrenewedIds.length,
        },
        checkIns: {
          total: checkInTotal,
          uniqueMembers: uniqueMemberRows.length,
          byBranch: branches.map((branch) => ({
            id: branch.id,
            name: branch.name,
            count: branchCount.get(branch.id) ?? 0,
          })),
        },
        collected: {
          amount: roundMoney(collectedCash + collectedCard),
          count: (cash?._count._all ?? 0) + (card?._count._all ?? 0),
          cash: collectedCash,
          card: collectedCard,
        },
        due: await this.dueFromBilled(tx, tenantId, billed),
      };
    });
  }

  private async dueFromBilled(
    tx: Prisma.TransactionClient,
    tenantId: string,
    billed: { id: string; price: Prisma.Decimal }[],
  ): Promise<{ amount: number; count: number }> {
    if (billed.length === 0) {
      return { amount: 0, count: 0 };
    }

    const grouped = await tx.payment.groupBy({
      by: ['subscriptionId'],
      where: {
        tenantId,
        subscriptionId: { in: billed.map((row) => row.id) },
      },
      _sum: { amount: true },
    });
    const paid = new Map(
      grouped.map((row) => [row.subscriptionId, Number(row._sum.amount ?? 0)]),
    );

    let amount = 0;
    let count = 0;
    for (const row of billed) {
      const remaining = roundMoney(
        Math.max(0, Number(row.price) - (paid.get(row.id) ?? 0)),
      );
      if (remaining > 0) {
        amount = roundMoney(amount + remaining);
        count += 1;
      }
    }
    return { amount, count };
  }
}

function countStatus(
  groups: { status: SubscriptionStatus; _count: { _all: number } }[],
  status: SubscriptionStatus,
): number {
  return groups.find((row) => row.status === status)?._count._all ?? 0;
}

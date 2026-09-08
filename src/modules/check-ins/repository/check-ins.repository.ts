import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import { StaffRole } from '../../staff/enums/staff-role.enum';
import { SubscriptionsRepository } from '../../subscriptions/repository/subscriptions.repository';
import {
  accessUntilOf,
  graceDaysFromSettings,
} from '../../subscriptions/utils/access.util';
import {
  CHECKIN_FILTER_FIELDS,
  CHECKIN_LOOKBACK_MS,
  CHECKIN_SORT_FIELDS,
} from '../constants/check-in.constants';
import { CreateCheckInDto } from '../dto/create-check-in.dto';
import { ListCheckInsQueryDto } from '../dto/list-check-ins-query.dto';
import { toPublicCheckIn } from '../mappers/check-in.mapper';
import { zonedYmd } from '../utils/tenant-day.util';

type DoorSubscription = Prisma.SubscriptionGetPayload<{
  include: {
    member: { select: { name: true } };
    plan: { select: { branches: { select: { branchId: true } } } };
  };
}>;

@Injectable()
export class CheckInsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  findMany(tenantId: string, query: ListCheckInsQueryDto) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
      .filter(CHECKIN_FILTER_FIELDS)
      .sort(CHECKIN_SORT_FIELDS, 'checkedInAt')
      .paginate();

    const { where, orderBy, skip, take } = features.args();
    const scopedWhere: Prisma.CheckInWhereInput = {
      ...(where as Prisma.CheckInWhereInput),
      tenantId,
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.checkIn.findMany({
          where: scopedWhere,
          orderBy: orderBy as Prisma.CheckInOrderByWithRelationInput[],
          skip,
          take,
          include: {
            subscription: {
              select: { status: true, sessionsRemaining: true },
            },
          },
        }),
        tx.checkIn.count({ where: scopedWhere }),
      ]);
      return features.paginateResult(
        rows.map((row) =>
          toPublicCheckIn(row, {
            usedGrace: row.subscription.status === 'IN_GRACE',
            status: row.subscription.status,
            sessionsRemaining: row.subscription.sessionsRemaining,
            visitsToday: 0,
          }),
        ),
        total,
      );
    });
  }

  create(actor: AuthenticatedUser, data: CreateCheckInDto) {
    return this.prisma.withTenant(actor.tenantId, async (tx) => {
      const now = new Date();
      await this.subscriptionsRepository.settleInTx(tx, actor.tenantId);

      if (
        actor.role === StaffRole.BRANCH_STAFF &&
        actor.branchId !== data.branchId
      ) {
        throw new AppHttpException(
          HttpStatus.FORBIDDEN,
          ErrorCode.BRANCH_NOT_ALLOWED,
          'Branch staff can only check in at their assigned branch',
        );
      }

      const branch = await tx.branch.findFirst({
        where: { id: data.branchId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!branch) {
        throw new AppHttpException(
          HttpStatus.NOT_FOUND,
          ErrorCode.BRANCH_NOT_FOUND,
          'Branch not found',
        );
      }

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
      if (member.status === 'ARCHIVED') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.MEMBER_ARCHIVED,
          'Archived members cannot check in',
        );
      }

      const tenant = await tx.tenant.findUnique({
        where: { id: actor.tenantId },
        select: {
          timezone: true,
          settings: { select: { graceEnabled: true, graceDays: true } },
        },
      });
      const graceDays = graceDaysFromSettings(tenant?.settings);
      const timeZone = tenant?.timezone ?? 'Africa/Cairo';

      const candidates = await tx.subscription.findMany({
        where: {
          tenantId: actor.tenantId,
          memberId: data.memberId,
          ...(data.subscriptionId ? { id: data.subscriptionId } : {}),
        },
        include: {
          member: { select: { name: true } },
          plan: { select: { branches: { select: { branchId: true } } } },
        },
      });

      if (data.subscriptionId && candidates.length === 0) {
        throw new AppHttpException(
          HttpStatus.NOT_FOUND,
          ErrorCode.SUBSCRIPTION_NOT_FOUND,
          'Subscription not found',
        );
      }

      const subscription = data.subscriptionId
        ? this.assertDoorAccess(candidates[0], data.branchId, now, graceDays)
        : this.pickDoorSubscription(candidates, data.branchId, now, graceDays);

      const visitsToday = await this.countVisitsToday(
        tx,
        actor.tenantId,
        subscription.id,
        now,
        timeZone,
      );
      if (visitsToday >= subscription.maxVisitsPerDay) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.CHECKIN_DAILY_LIMIT,
          'Daily visit limit reached',
        );
      }

      let usedGrace = false;
      let status = subscription.status;
      let sessionsRemaining = subscription.sessionsRemaining;

      if (status === 'EXPIRED') {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'IN_GRACE',
            graceUsedAt: now,
            graceEndsAt: accessUntilOf(subscription.endsAt, graceDays),
          },
        });
        await this.subscriptionsRepository.recordLifecycleNotifications(
          tx,
          actor.tenantId,
          'SUBSCRIPTION_IN_GRACE',
          [
            {
              id: subscription.id,
              memberId: subscription.memberId,
              planName: subscription.planName,
              member: subscription.member,
            },
          ],
        );
        usedGrace = true;
        status = 'IN_GRACE';
      }

      if (sessionsRemaining !== null) {
        sessionsRemaining = sessionsRemaining - 1;
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { sessionsRemaining },
        });
      }

      const row = await tx.checkIn.create({
        data: {
          tenantId: actor.tenantId,
          memberId: data.memberId,
          subscriptionId: subscription.id,
          branchId: data.branchId,
          staffId: actor.id,
          checkedInAt: now,
        },
      });

      return toPublicCheckIn(row, {
        usedGrace,
        status,
        sessionsRemaining,
        visitsToday: visitsToday + 1,
      });
    });
  }

  private pickDoorSubscription(
    rows: DoorSubscription[],
    branchId: string,
    now: Date,
    graceDays: number,
  ): DoorSubscription {
    const eligible = rows.filter(
      (row) => this.doorDenial(row, branchId, now, graceDays) === null,
    );
    if (eligible.length === 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.CHECKIN_NO_SUBSCRIPTION,
        'No subscription allows this check-in',
      );
    }
    const rank: Record<string, number> = {
      ACTIVE: 0,
      IN_GRACE: 1,
      EXPIRED: 2,
    };
    eligible.sort((a, b) => {
      const byStatus = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      if (byStatus !== 0) return byStatus;
      return a.endsAt.getTime() - b.endsAt.getTime();
    });
    return eligible[0];
  }

  private assertDoorAccess(
    row: DoorSubscription,
    branchId: string,
    now: Date,
    graceDays: number,
  ): DoorSubscription {
    const code = this.doorDenial(row, branchId, now, graceDays);
    if (!code) {
      return row;
    }
    const messages: Record<string, string> = {
      [ErrorCode.SUBSCRIPTION_FROZEN]: 'Frozen subscriptions cannot check in',
      [ErrorCode.SUBSCRIPTION_NOT_ACTIVE]:
        'Cancelled subscriptions cannot check in',
      [ErrorCode.CHECKIN_EXPIRED]: 's',
      [ErrorCode.CHECKIN_GRACE_USED]:
        'This subscription already used its grace period',
      [ErrorCode.CHECKIN_NO_SESSIONS]: 'No sessions remaining',
      [ErrorCode.CHECKIN_BRANCH_NOT_ALLOWED]:
        'This plan is not allowed at this branch',
    };
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      code,
      messages[code] ?? 'Check-in is not allowed',
    );
  }

  private doorDenial(
    row: DoorSubscription,
    branchId: string,
    now: Date,
    graceDays: number,
  ): ErrorCode | null {
    if (row.status === 'FROZEN') {
      return ErrorCode.SUBSCRIPTION_FROZEN;
    }
    if (row.status === 'CANCELLED') {
      return ErrorCode.SUBSCRIPTION_NOT_ACTIVE;
    }
    if (!row.allBranches) {
      const allowed = row.plan.branches.some(
        (item) => item.branchId === branchId,
      );
      if (!allowed) {
        return ErrorCode.CHECKIN_BRANCH_NOT_ALLOWED;
      }
    }
    if (row.sessionsRemaining !== null && row.sessionsRemaining <= 0) {
      return ErrorCode.CHECKIN_NO_SESSIONS;
    }
    if (row.status === 'ACTIVE') {
      return now <= row.endsAt ? null : ErrorCode.CHECKIN_EXPIRED;
    }
    if (row.graceUsedAt && row.status !== 'IN_GRACE') {
      return ErrorCode.CHECKIN_GRACE_USED;
    }
    if (row.status === 'EXPIRED' || row.status === 'IN_GRACE') {
      const until = row.graceEndsAt ?? accessUntilOf(row.endsAt, graceDays);
      return now <= until ? null : ErrorCode.CHECKIN_EXPIRED;
    }
    return ErrorCode.CHECKIN_NO_SUBSCRIPTION;
  }

  private async countVisitsToday(
    tx: Prisma.TransactionClient,
    tenantId: string,
    subscriptionId: string,
    now: Date,
    timeZone: string,
  ): Promise<number> {
    const recent = await tx.checkIn.findMany({
      where: {
        tenantId,
        subscriptionId,
        checkedInAt: { gte: new Date(now.getTime() - CHECKIN_LOOKBACK_MS) },
      },
      select: { checkedInAt: true },
    });
    const today = zonedYmd(now, timeZone);
    return recent.filter((row) => zonedYmd(row.checkedInAt, timeZone) === today)
      .length;
  }
}

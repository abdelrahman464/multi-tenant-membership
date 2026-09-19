import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { PrismaService } from '../../../database/prisma.service';
import { assertBranchOpen } from '../../branches/utils/assert-branch-open.util';
import { requireActiveBranch } from '../../branches/utils/require-active-branch.util';
import { CHECKIN_INCLUDE } from '../../check-ins/constants/check-in.constants';
import { toPublicCheckIn } from '../../check-ins/mappers/check-in.mapper';
import { zonedDayBounds } from '../../check-ins/utils/tenant-day.util';
import { MEMBER_PUBLIC_SELECT } from '../../members/constants/member.constants';
import { assertMemberCanBeSold } from '../../members/utils/member-access.util';
import { generateMemberCode } from '../../members/utils/member-code.util';
import { PAYMENT_INCLUDE } from '../../payments/constants/payment.constants';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';
import {
  roundMoney,
  toPublicPayment,
} from '../../payments/mappers/payment.mapper';
import { StaffRole } from '../../staff/enums/staff-role.enum';
import { SellDayPassDto } from '../dto/sell-day-pass.dto';
import { SubscriptionsRepository } from './subscriptions.repository';

@Injectable()
export class DayPassesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  sell(actor: AuthenticatedUser, data: SellDayPassDto) {
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
          'Branch staff can only sell a day pass at their assigned branch',
        );
      }

      const branch = await requireActiveBranch(
        tx,
        actor.tenantId,
        data.branchId,
      );
      const tenant = await tx.tenant.findUnique({
        where: { id: actor.tenantId },
        select: {
          timezone: true,
          currency: true,
          settings: {
            select: {
              requirePaymentForAccess: true,
              minPaidPercentForAccess: true,
            },
          },
        },
      });
      const timeZone = tenant?.timezone ?? 'Africa/Cairo';
      const shouldCheckIn = data.checkIn !== false;
      if (shouldCheckIn) {
        assertBranchOpen(branch.hours, now, timeZone, branch.hoursExceptions);
      }

      const { member, created: memberCreated } = await this.resolveMember(
        tx,
        actor.tenantId,
        data,
      );
      assertMemberCanBeSold(member.status);

      const plan = await tx.plan.findFirst({
        where: { id: data.planId, tenantId: actor.tenantId },
        include: { branches: { select: { branchId: true } } },
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
      if (plan.kind !== 'DAY_PASS') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.PLAN_NOT_DAY_PASS,
          'This plan is not a day pass',
        );
      }
      if (
        !plan.allBranches &&
        !plan.branches.some((item) => item.branchId === data.branchId)
      ) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.CHECKIN_BRANCH_NOT_ALLOWED,
          'This day pass is not sold at this branch',
        );
      }

      const subscription = await this.subscriptionsRepository.insertSoldPlan(
        tx,
        actor.tenantId,
        member.id,
        plan,
        actor.id,
        now,
      );

      const payment = data.method
        ? await this.collect(
            tx,
            actor,
            {
              subscriptionId: subscription.id,
              memberId: member.id,
              price: Number(plan.price),
              currency: tenant?.currency ?? 'EGP',
            },
            data,
          )
        : null;

      const checkIn = shouldCheckIn
        ? await this.checkInVisit(
            tx,
            actor,
            {
              memberId: member.id,
              subscriptionId: subscription.id,
              branchId: data.branchId,
              price: Number(plan.price),
              requirePayment:
                tenant?.settings?.requirePaymentForAccess === true,
              minPercent: tenant?.settings?.minPaidPercentForAccess ?? 50,
              paidTotal: payment?.paidTotal ?? 0,
              timeZone,
            },
            now,
          )
        : null;

      const freshMember = await tx.member.findFirst({
        where: { id: member.id, tenantId: actor.tenantId },
        select: MEMBER_PUBLIC_SELECT,
      });

      return {
        memberCreated,
        member: freshMember,
        subscription: checkIn
          ? {
              ...subscription,
              sessionsRemaining: checkIn.sessionsRemaining,
            }
          : subscription,
        payment,
        checkIn,
      };
    });
  }

  private async resolveMember(
    tx: Prisma.TransactionClient,
    tenantId: string,
    data: SellDayPassDto,
  ) {
    if (data.memberId) {
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
      return { member, created: false };
    }

    if (!data.name || !data.phone) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.DAY_PASS_MEMBER_REQUIRED,
        'Send memberId or name and phone',
      );
    }

    const existing = await tx.member.findFirst({
      where: { tenantId, phone: data.phone },
      select: { id: true, status: true },
    });
    if (existing) {
      return { member: existing, created: false };
    }

    const homeBranchId = data.homeBranchId ?? data.branchId;
    await requireActiveBranch(tx, tenantId, homeBranchId);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const member = await tx.member.create({
          data: {
            tenantId,
            name: data.name,
            phone: data.phone,
            homeBranchId,
            code: generateMemberCode(),
          },
          select: { id: true, status: true },
        });
        return { member, created: true };
      } catch (error) {
        if (this.isCodeConflict(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('Could not allocate a unique member code');
  }

  private async collect(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    sold: {
      subscriptionId: string;
      memberId: string;
      price: number;
      currency: string;
    },
    data: SellDayPassDto,
  ) {
    if (sold.price <= 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.PAYMENT_NOT_DUE,
        'This plan has no amount due',
      );
    }
    const due = roundMoney(sold.price);
    const amount = roundMoney(data.amount ?? due);
    if (amount > due) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.PAYMENT_EXCEEDS_DUE,
        `Amount cannot exceed the remaining due of ${due}`,
      );
    }

    const row = await tx.payment.create({
      data: {
        tenantId: actor.tenantId,
        memberId: sold.memberId,
        subscriptionId: sold.subscriptionId,
        branchId: data.branchId,
        staffId: actor.id,
        method: data.method as PaymentMethod,
        amount,
        currency: sold.currency,
        notes: data.notes ?? null,
      },
      include: PAYMENT_INCLUDE,
    });
    return toPublicPayment(row, { paidTotal: amount });
  }

  private async checkInVisit(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    args: {
      memberId: string;
      subscriptionId: string;
      branchId: string;
      price: number;
      requirePayment: boolean;
      minPercent: number;
      paidTotal: number;
      timeZone: string;
    },
    now: Date,
  ) {
    if (args.requirePayment && args.price > 0) {
      const needed = roundMoney((args.price * args.minPercent) / 100);
      if (roundMoney(args.paidTotal) < needed) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.CHECKIN_PAYMENT_REQUIRED,
          `Payment of at least ${args.minPercent}% of the plan price is required to check in`,
        );
      }
    }

    const visitsToday = await tx.checkIn.count({
      where: {
        tenantId: actor.tenantId,
        subscriptionId: args.subscriptionId,
        checkedInAt: {
          gte: zonedDayBounds(now, args.timeZone).gte,
          lt: zonedDayBounds(now, args.timeZone).lt,
        },
      },
    });
    if (visitsToday >= 1) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.CHECKIN_DAILY_LIMIT,
        'Daily visit limit reached',
      );
    }

    await tx.subscription.update({
      where: { id: args.subscriptionId },
      data: { sessionsRemaining: 0 },
    });

    const row = await tx.checkIn.create({
      data: {
        tenantId: actor.tenantId,
        memberId: args.memberId,
        subscriptionId: args.subscriptionId,
        branchId: args.branchId,
        staffId: actor.id,
        checkedInAt: now,
      },
      include: CHECKIN_INCLUDE,
    });

    await tx.member.update({
      where: { id: args.memberId },
      data: { lastCheckedInAt: now },
    });

    return toPublicCheckIn(row, {
      usedGrace: false,
      status: 'ACTIVE',
      sessionsRemaining: 0,
      visitsToday: visitsToday + 1,
    });
  }

  private isCodeConflict(error: unknown): boolean {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      (error as { code: string }).code !== 'P2002'
    ) {
      return false;
    }
    const meta = (error as { meta?: Record<string, unknown> }).meta;
    const target = meta?.target;
    if (Array.isArray(target) && target.includes('code')) {
      return true;
    }
    return target === 'code';
  }
}

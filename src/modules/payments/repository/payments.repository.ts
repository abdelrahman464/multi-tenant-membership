import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, PaymentStatus } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import { requireActiveBranch } from '../../tenants/utils/require-active-branch.util';
import { StaffRole } from '../../staff/enums/staff-role.enum';
import {
  PAYMENT_FILTER_FIELDS,
  PAYMENT_INCLUDE,
  PAYMENT_SORT_FIELDS,
} from '../constants/payment.constants';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { ListPaymentsQueryDto } from '../dto/list-payments-query.dto';
import { roundMoney, toPublicPayment } from '../mappers/payment.mapper';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string, query: ListPaymentsQueryDto) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
      .filter(PAYMENT_FILTER_FIELDS)
      .sort(PAYMENT_SORT_FIELDS, 'paidAt')
      .paginate();

    const { where, orderBy, skip, take } = features.args();
    const scopedWhere: Prisma.PaymentWhereInput = {
      ...(where as Prisma.PaymentWhereInput),
      tenantId,
      ...(query.planId ? { subscription: { planId: query.planId } } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.payment.findMany({
          where: scopedWhere,
          orderBy: orderBy as Prisma.PaymentOrderByWithRelationInput[],
          skip,
          take,
          include: PAYMENT_INCLUDE,
        }),
        tx.payment.count({ where: scopedWhere }),
      ]);
      const totals = await this.paidTotals(
        tx,
        tenantId,
        rows.map((row) => row.subscriptionId),
      );
      return features.paginateResult(
        rows.map((row) =>
          toPublicPayment(row, {
            paidTotal: totals.get(row.subscriptionId) ?? 0,
          }),
        ),
        total,
      );
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const row = await this.loadPayment(tx, tenantId, id);
      if (!row) {
        return null;
      }
      return toPublicPayment(row, { paidTotal: row.paidTotal });
    });
  }

  findReceiptById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const row = await this.loadPayment(tx, tenantId, id);
      if (!row) {
        return null;
      }
      return {
        payment: toPublicPayment(row, { paidTotal: row.paidTotal }),
        gym: row.tenant,
      };
    });
  }

  create(actor: AuthenticatedUser, data: CreatePaymentDto) {
    return this.prisma.withTenant(actor.tenantId, async (tx) => {
      if (
        actor.role === StaffRole.BRANCH_STAFF &&
        actor.branchId !== data.branchId
      ) {
        throw new AppHttpException(
          HttpStatus.FORBIDDEN,
          ErrorCode.BRANCH_NOT_ALLOWED,
          'Branch staff can only record payments at their assigned branch',
        );
      }

      await requireActiveBranch(tx, actor.tenantId, data.branchId);

      const subscription = await tx.subscription.findFirst({
        where: { id: data.subscriptionId, tenantId: actor.tenantId },
        include: {
          member: { select: { id: true, status: true } },
          tenant: { select: { currency: true } },
        },
      });
      if (!subscription) {
        throw new AppHttpException(
          HttpStatus.NOT_FOUND,
          ErrorCode.SUBSCRIPTION_NOT_FOUND,
          'Subscription not found',
        );
      }
      if (subscription.status === 'CANCELLED') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.SUBSCRIPTION_NOT_ACTIVE,
          'Cancelled subscriptions cannot take payment',
        );
      }
      if (subscription.member.status === 'ARCHIVED') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.MEMBER_ARCHIVED,
          'Archived members cannot be charged',
        );
      }

      const price = Number(subscription.price);
      if (price <= 0) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.PAYMENT_NOT_DUE,
          'This plan has no amount due',
        );
      }

      const paidSoFar =
        (await this.paidTotals(tx, actor.tenantId, [subscription.id])).get(
          subscription.id,
        ) ?? 0;
      const due = roundMoney(Math.max(0, price - paidSoFar));
      if (due <= 0) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.PAYMENT_ALREADY_SETTLED,
          'This subscription is already fully paid',
        );
      }

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
          memberId: subscription.memberId,
          subscriptionId: subscription.id,
          branchId: data.branchId,
          staffId: actor.id,
          method: data.method,
          amount,
          currency: subscription.tenant.currency,
          notes: data.notes ?? null,
        },
        include: PAYMENT_INCLUDE,
      });
      return toPublicPayment(row, {
        paidTotal: roundMoney(paidSoFar + amount),
      });
    });
  }

  void(actor: AuthenticatedUser, id: string, reason: string) {
    return this.prisma.withTenant(actor.tenantId, async (tx) => {
      const row = await this.loadPayment(tx, actor.tenantId, id);
      if (!row) {
        throw new AppHttpException(
          HttpStatus.NOT_FOUND,
          ErrorCode.PAYMENT_NOT_FOUND,
          'Payment not found',
        );
      }
      if (row.status === PaymentStatus.VOIDED) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.PAYMENT_ALREADY_VOIDED,
          'This payment is already voided',
        );
      }

      const updated = await tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.VOIDED,
          voidedAt: new Date(),
          voidedById: actor.id,
          voidReason: reason.trim(),
        },
        include: PAYMENT_INCLUDE,
      });
      const paidTotal =
        (
          await this.paidTotals(tx, actor.tenantId, [updated.subscriptionId])
        ).get(updated.subscriptionId) ?? 0;
      return toPublicPayment(updated, { paidTotal });
    });
  }

  private async loadPayment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const row = await tx.payment.findFirst({
      where: { id, tenantId },
      include: {
        ...PAYMENT_INCLUDE,
        tenant: { select: { name: true, timezone: true } },
      },
    });
    if (!row) {
      return null;
    }
    const paidTotal =
      (await this.paidTotals(tx, tenantId, [row.subscriptionId])).get(
        row.subscriptionId,
      ) ?? 0;
    return { ...row, paidTotal };
  }

  private async paidTotals(
    tx: Prisma.TransactionClient,
    tenantId: string,
    subscriptionIds: string[],
  ): Promise<Map<string, number>> {
    const unique = [...new Set(subscriptionIds)];
    const totals = new Map<string, number>();
    if (unique.length === 0) {
      return totals;
    }
    // get the total paid for each subscription
    const grouped = await tx.payment.groupBy({
      by: ['subscriptionId'],
      where: {
        tenantId,
        subscriptionId: { in: unique },
        status: PaymentStatus.COLLECTED,
      },
      _sum: { amount: true },
    });
    for (const row of grouped) {
      totals.set(row.subscriptionId, Number(row._sum.amount ?? 0));
    }
    return totals;
  }
}

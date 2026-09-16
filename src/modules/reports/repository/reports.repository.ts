import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  zonedYmd,
  zonedYmdRangeBounds,
} from '../../check-ins/utils/tenant-day.util';
import { MEMBER_SEARCH_FIELDS } from '../../members/constants/member.constants';
import { CHECKIN_INCLUDE } from '../../check-ins/constants/check-in.constants';
import { PAYMENT_INCLUDE } from '../../payments/constants/payment.constants';
import { REPORT_MAX_ROWS } from '../constants/report.constants';
import { ExportCheckInsQueryDto } from '../dto/export-check-ins-query.dto';
import { ExportMembersQueryDto } from '../dto/export-members-query.dto';
import { ExportPaymentsQueryDto } from '../dto/export-payments-query.dto';

export type ReportCalendar = {
  timezone: string;
  from: string;
  to: string;
  gte: Date;
  lt: Date;
};

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMembers(tenantId: string, query: ExportMembersQueryDto) {
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const where: Prisma.MemberWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.homeBranchId ? { homeBranchId: query.homeBranchId } : {}),
      ...(search
        ? {
            OR: MEMBER_SEARCH_FIELDS.map((field) => ({
              [field]: { contains: search, mode: 'insensitive' as const },
            })),
          }
        : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertRowBudget(tx.member.count({ where }));
      const today = await this.todayYmd(tx, tenantId);
      const rows = await tx.member.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: REPORT_MAX_ROWS,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          status: true,
          homeBranchId: true,
          notes: true,
          createdAt: true,
          homeBranch: { select: { id: true, name: true } },
        },
      });
      return { rows, from: today, to: today };
    });
  }

  findPayments(
    tenantId: string,
    query: ExportPaymentsQueryDto,
    range: { from?: string; to?: string },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const calendar = await this.calendar(tx, tenantId, range);
      const where: Prisma.PaymentWhereInput = {
        tenantId,
        paidAt: { gte: calendar.gte, lt: calendar.lt },
        ...(query.memberId ? { memberId: query.memberId } : {}),
        ...(query.subscriptionId
          ? { subscriptionId: query.subscriptionId }
          : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.method ? { method: query.method } : {}),
        ...(query.planId ? { subscription: { planId: query.planId } } : {}),
      };
      await this.assertRowBudget(tx.payment.count({ where }));
      const rows = await tx.payment.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        take: REPORT_MAX_ROWS,
        include: PAYMENT_INCLUDE,
      });
      const paid = await this.paidTotals(
        tx,
        tenantId,
        rows.map((row) => row.subscriptionId),
      );
      return { rows, paid, from: calendar.from, to: calendar.to };
    });
  }

  findCheckIns(
    tenantId: string,
    query: ExportCheckInsQueryDto,
    range: { from?: string; to?: string },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const calendar = await this.calendar(tx, tenantId, range);
      const where: Prisma.CheckInWhereInput = {
        tenantId,
        checkedInAt: { gte: calendar.gte, lt: calendar.lt },
        ...(query.memberId ? { memberId: query.memberId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.subscriptionId
          ? { subscriptionId: query.subscriptionId }
          : {}),
      };
      await this.assertRowBudget(tx.checkIn.count({ where }));
      const rows = await tx.checkIn.findMany({
        where,
        orderBy: { checkedInAt: 'desc' },
        take: REPORT_MAX_ROWS,
        include: CHECKIN_INCLUDE,
      });
      return { rows, from: calendar.from, to: calendar.to };
    });
  }

  private async calendar(
    tx: Prisma.TransactionClient,
    tenantId: string,
    range: { from?: string; to?: string },
    now = new Date(),
  ): Promise<ReportCalendar> {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const timezone = tenant?.timezone ?? 'Africa/Cairo';
    const today = zonedYmd(now, timezone);
    const from = range.from ?? today;
    const to = range.to ?? range.from ?? today;
    const { gte, lt } = zonedYmdRangeBounds(from, to, timezone);
    return { timezone, from, to, gte, lt };
  }

  private async todayYmd(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return zonedYmd(new Date(), tenant?.timezone ?? 'Africa/Cairo');
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
    const grouped = await tx.payment.groupBy({
      by: ['subscriptionId'],
      where: { tenantId, subscriptionId: { in: unique } },
      _sum: { amount: true },
    });
    for (const row of grouped) {
      totals.set(row.subscriptionId, Number(row._sum.amount ?? 0));
    }
    return totals;
  }

  private async assertRowBudget(countPromise: Promise<number>): Promise<void> {
    const total = await countPromise;
    if (total > REPORT_MAX_ROWS) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.EXPORT_TOO_LARGE,
        `Export exceeds ${REPORT_MAX_ROWS} rows. Narrow the filters or date range`,
      );
    }
  }
}

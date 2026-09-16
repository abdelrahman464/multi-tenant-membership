import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  isYmd,
  ymdInclusiveDayCount,
  zonedYmdRangeBounds,
} from '../check-ins/utils/tenant-day.util';
import { PrismaService } from '../../database/prisma.service';
import { DASHBOARD_MAX_RANGE_DAYS } from '../dashboard/constants/dashboard.constants';
import { ListAuditQueryDto } from './dto/list-audit-query.dto';
import { AuditRepository } from './repository/audit.repository';

@Injectable()
export class AuditService {
  constructor(
    private readonly auditRepository: AuditRepository,
    private readonly prisma: PrismaService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListAuditQueryDto) {
    const range = await this.resolveRange(actor.tenantId, query);
    return this.auditRepository.findMany(actor.tenantId, query, range);
  }

  private async resolveRange(
    tenantId: string,
    query: ListAuditQueryDto,
  ): Promise<{ gte: Date; lt: Date } | undefined> {
    if (!query.from && !query.to) {
      return undefined;
    }
    const from = query.from ?? query.to;
    const to = query.to ?? query.from;
    if (!from || !to || !isYmd(from) || !isYmd(to) || from > to) {
      throw this.invalidRange();
    }
    if (ymdInclusiveDayCount(from, to) > DASHBOARD_MAX_RANGE_DAYS) {
      throw this.invalidRange();
    }
    const tenant = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { timezone: true },
      }),
    );
    const timezone = tenant?.timezone ?? 'Africa/Cairo';
    return zonedYmdRangeBounds(from, to, timezone);
  }

  private invalidRange(): AppHttpException {
    return new AppHttpException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.DATE_RANGE_INVALID,
      `from and to must be valid YYYY-MM-DD dates, from <= to, and at most ${DASHBOARD_MAX_RANGE_DAYS} days`,
    );
  }
}

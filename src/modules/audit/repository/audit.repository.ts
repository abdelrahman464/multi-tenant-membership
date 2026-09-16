import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import {
  AUDIT_FILTER_FIELDS,
  AUDIT_INCLUDE,
  AUDIT_SORT_FIELDS,
} from '../constants/audit.constants';
import { ListAuditQueryDto } from '../dto/list-audit-query.dto';
import { AuditAction } from '../enums/audit-action.enum';
import { toPublicAuditEvent } from '../mappers/audit.mapper';

export type RecordAuditInput = {
  tenantId: string;
  staffId?: string | null;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, string> | null;
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuditRepository {
  private readonly logger = new Logger(AuditRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  findMany(
    tenantId: string,
    query: ListAuditQueryDto,
    range?: { gte: Date; lt: Date },
  ) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
      .filter(AUDIT_FILTER_FIELDS)
      .sort(AUDIT_SORT_FIELDS)
      .paginate();

    const { where, orderBy, skip, take } = features.args();
    const scopedWhere: Prisma.AuditEventWhereInput = {
      ...(where as Prisma.AuditEventWhereInput),
      tenantId,
      ...(range ? { createdAt: { gte: range.gte, lt: range.lt } } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.auditEvent.findMany({
          where: scopedWhere,
          orderBy: orderBy as Prisma.AuditEventOrderByWithRelationInput[],
          skip,
          take,
          include: AUDIT_INCLUDE,
        }),
        tx.auditEvent.count({ where: scopedWhere }),
      ]);
      return features.paginateResult(rows.map(toPublicAuditEvent), total);
    });
  }

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.prisma.withTenant(input.tenantId, (tx) =>
        tx.auditEvent.create({
          data: {
            tenantId: input.tenantId,
            staffId: input.staffId ?? null,
            action: input.action,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            metadata: input.metadata ?? undefined,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
          },
        }),
      );
    } catch (err) {
      this.logger.error(
        err instanceof Error ? err.stack : String(err),
        'Failed to write audit event',
      );
    }
  }
}

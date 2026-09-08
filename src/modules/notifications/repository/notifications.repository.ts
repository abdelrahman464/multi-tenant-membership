import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import {
  NOTIFICATION_FILTER_FIELDS,
  NOTIFICATION_SEARCH_FIELDS,
  NOTIFICATION_SORT_FIELDS,
} from '../constants/notification.constants';
import { ListNotificationsQueryDto } from '../dto/list-notifications-query.dto';
import { toPublicNotification } from '../mappers/notification.mapper';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string, query: ListNotificationsQueryDto) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
      .filter(NOTIFICATION_FILTER_FIELDS)
      .search(NOTIFICATION_SEARCH_FIELDS)
      .sort(NOTIFICATION_SORT_FIELDS)
      .paginate();

    const { where, orderBy, skip, take } = features.args();
    const scopedWhere: Prisma.NotificationWhereInput = {
      ...(where as Prisma.NotificationWhereInput),
      tenantId,
      ...(query.unread === true ? { readAt: null } : {}),
      ...(query.unread === false ? { readAt: { not: null } } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.notification.findMany({
          where: scopedWhere,
          orderBy: orderBy as Prisma.NotificationOrderByWithRelationInput[],
          skip,
          take,
        }),
        tx.notification.count({ where: scopedWhere }),
      ]);
      return features.paginateResult(rows.map(toPublicNotification), total);
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const row = await tx.notification.findFirst({
        where: { id, tenantId },
      });
      return row ? toPublicNotification(row) : null;
    });
  }

  countUnread(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.notification.count({ where: { tenantId, readAt: null } }),
    );
  }

  markRead(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.notification.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        return null;
      }
      if (existing.readAt) {
        return toPublicNotification(existing);
      }
      const row = await tx.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
      return toPublicNotification(row);
    });
  }

  markAllRead(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const result = await tx.notification.updateMany({
        where: { tenantId, readAt: null },
        data: { readAt: new Date() },
      });
      return { updated: result.count };
    });
  }
}

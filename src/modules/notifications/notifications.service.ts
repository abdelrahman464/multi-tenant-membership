import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { SubscriptionsRepository } from '../subscriptions/repository/subscriptions.repository';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsRepository } from './repository/notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  async list(actor: AuthenticatedUser, query: ListNotificationsQueryDto) {
    await this.subscriptionsRepository.settleForTenant(actor.tenantId);
    return this.notificationsRepository.findMany(actor.tenantId, query);
  }

  async unreadCount(actor: AuthenticatedUser) {
    await this.subscriptionsRepository.settleForTenant(actor.tenantId);
    const unread = await this.notificationsRepository.countUnread(
      actor.tenantId,
    );
    return { unread };
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const notification = await this.notificationsRepository.findById(
      actor.tenantId,
      id,
    );
    if (!notification) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOTIFICATION_NOT_FOUND,
        'Notification not found',
      );
    }
    return notification;
  }

  async markRead(actor: AuthenticatedUser, id: string) {
    const notification = await this.notificationsRepository.markRead(
      actor.tenantId,
      id,
    );
    if (!notification) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOTIFICATION_NOT_FOUND,
        'Notification not found',
      );
    }
    return notification;
  }

  markAllRead(actor: AuthenticatedUser) {
    return this.notificationsRepository.markAllRead(actor.tenantId);
  }
}

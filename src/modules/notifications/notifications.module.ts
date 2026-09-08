import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './repository/notifications.repository';

@Module({
  imports: [SubscriptionsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}

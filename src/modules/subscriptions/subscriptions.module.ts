import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionExpiryScheduler } from './subscription-expiry.scheduler';
import { SubscriptionsRepository } from './repository/subscriptions.repository';

@Module({
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    SubscriptionsRepository,
    SubscriptionExpiryScheduler,
  ],
  exports: [SubscriptionsRepository],
})
export class SubscriptionsModule {}

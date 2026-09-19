import { Module } from '@nestjs/common';
import { DayPassesController } from './day-passes.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionExpiryScheduler } from './subscription-expiry.scheduler';
import { DayPassesRepository } from './repository/day-passes.repository';
import { SubscriptionsRepository } from './repository/subscriptions.repository';

@Module({
  controllers: [SubscriptionsController, DayPassesController],
  providers: [
    SubscriptionsService,
    SubscriptionsRepository,
    DayPassesRepository,
    SubscriptionExpiryScheduler,
  ],
  exports: [SubscriptionsRepository],
})
export class SubscriptionsModule {}

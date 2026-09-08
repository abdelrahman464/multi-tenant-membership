import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CheckInsController } from './check-ins.controller';
import { CheckInsService } from './check-ins.service';
import { CheckInsRepository } from './repository/check-ins.repository';

@Module({
  imports: [SubscriptionsModule],
  controllers: [CheckInsController],
  providers: [CheckInsService, CheckInsRepository],
})
export class CheckInsModule {}

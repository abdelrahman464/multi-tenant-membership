import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { PlansRepository } from './repository/plans.repository';

@Module({
  controllers: [PlansController],
  providers: [PlansService, PlansRepository],
})
export class PlansModule {}

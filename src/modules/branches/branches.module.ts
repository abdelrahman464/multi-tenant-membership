import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { PlatformBranchesController } from './platform-branches.controller';
import { BranchesRepository } from './repository/branches.repository';

@Module({
  controllers: [BranchesController, PlatformBranchesController],
  providers: [BranchesService, BranchesRepository],
  exports: [BranchesService],
})
export class BranchesModule {}

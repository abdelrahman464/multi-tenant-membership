import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { TenantBranchesController } from './tenant-branches.controller';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './repository/tenants.repository';

@Module({
  imports: [SecurityModule],
  controllers: [TenantsController, TenantBranchesController],
  providers: [TenantsService, TenantsRepository],
  exports: [TenantsService],
})
export class TenantsModule {}

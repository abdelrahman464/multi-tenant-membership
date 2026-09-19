import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { TenantSettingsController } from './tenant-settings.controller';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './repository/tenants.repository';

@Module({
  imports: [SecurityModule],
  controllers: [TenantsController, TenantSettingsController],
  providers: [TenantsService, TenantsRepository],
  exports: [TenantsService],
})
export class TenantsModule {}

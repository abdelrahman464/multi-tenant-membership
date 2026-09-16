import { Body, Controller, Get, Patch } from '@nestjs/common';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { StaffRole } from '../staff/enums/staff-role.enum';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { TenantsService } from './tenants.service';

/** Staff settings. Cannot live on TenantsController (that class is platform-key + @Public). */
@Controller('settings')
export class TenantSettingsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  getMine(@GetAuthUser() actor: AuthenticatedUser) {
    return this.tenantsService.getSettings(actor.tenantId);
  }

  @Patch()
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  @Audit({ action: AuditAction.SETTINGS_UPDATED, entityType: 'settings' })
  updateMine(
    @GetAuthUser() actor: AuthenticatedUser,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.tenantsService.updateSettings(actor.tenantId, dto);
  }
}

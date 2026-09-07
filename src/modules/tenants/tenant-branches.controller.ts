import { Controller, Get, Query } from '@nestjs/common';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { StaffRole } from '../staff/enums/staff-role.enum';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto';
import { TenantsService } from './tenants.service';

/** Staff list. Cannot live on TenantsController (that class is platform-key + @Public). */
@Controller('branches')
export class TenantBranchesController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  listMine(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ListBranchesQueryDto,
  ) {
    return this.tenantsService.listBranches(actor.tenantId, query);
  }
}

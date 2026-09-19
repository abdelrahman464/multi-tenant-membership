import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { StaffRole } from '../staff/enums/staff-role.enum';
import { CreateBranchDto } from './dto/create-branch.dto';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { TenantsService } from './tenants.service';

/** Staff list/create/update. Cannot live on TenantsController (that class is platform-key + @Public). */
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  @Audit({ action: AuditAction.BRANCH_CREATED, entityType: 'branch' })
  createMine(
    @GetAuthUser() actor: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
  ) {
    return this.tenantsService.createBranch(actor.tenantId, dto);
  }

  @Get(':id')
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  getMine(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.tenantsService.getBranch(actor.tenantId, id);
  }

  @Patch(':id')
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  @Audit({ action: AuditAction.BRANCH_UPDATED, entityType: 'branch' })
  updateMine(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.tenantsService.updateBranch(actor.tenantId, id, dto);
  }
}

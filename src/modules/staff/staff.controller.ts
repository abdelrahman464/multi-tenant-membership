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
import { CreateStaffDto } from './dto/create-staff.dto';
import { ListStaffQueryDto } from './dto/list-staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffRole } from './enums/staff-role.enum';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  list(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ListStaffQueryDto,
  ) {
    return this.staffService.list(actor, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  @Audit({ action: AuditAction.STAFF_CREATED, entityType: 'staff' })
  create(@GetAuthUser() actor: AuthenticatedUser, @Body() dto: CreateStaffDto) {
    return this.staffService.create(actor, dto);
  }

  @Get(':id')
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  getById(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.staffService.getById(actor, id);
  }

  @Patch(':id')
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  @Audit({ action: AuditAction.STAFF_UPDATED, entityType: 'staff' })
  update(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(actor, id, dto);
  }
}

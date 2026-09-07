import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffRole } from './enums/staff-role.enum';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  list(@GetAuthUser() actor: AuthenticatedUser) {
    return this.staffService.list(actor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  create(@GetAuthUser() actor: AuthenticatedUser, @Body() dto: CreateStaffDto) {
    return this.staffService.create(actor, dto);
  }
}

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
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { StaffRole } from '../staff/enums/staff-role.enum';
import { CreatePlanDto } from './dto/create-plan.dto';
import { ListPlansQueryDto } from './dto/list-plans-query.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  list(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ListPlansQueryDto,
  ) {
    return this.plansService.list(actor, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  create(@GetAuthUser() actor: AuthenticatedUser, @Body() dto: CreatePlanDto) {
    return this.plansService.create(actor, dto);
  }

  @Get(':id')
  getById(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.plansService.getById(actor, id);
  }

  @Patch(':id')
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  update(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.plansService.update(actor, id, dto);
  }
}

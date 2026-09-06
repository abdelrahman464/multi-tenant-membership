import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlatformKeyGuard } from '../../common/guards/platform-key.guard';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('platform/tenants')
@UseGuards(PlatformKeyGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  list(@Query() query: ListTenantsQueryDto) {
    return this.tenantsService.list(query);
  }

  @Get(':id')
  getById(@Param('id', ParseUuidPipe) id: string) {
    return this.tenantsService.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUuidPipe) id: string) {
    return this.tenantsService.remove(id);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(@Param('id', ParseUuidPipe) id: string) {
    return this.tenantsService.suspend(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id', ParseUuidPipe) id: string) {
    return this.tenantsService.reactivate(id);
  }

  @Post(':id/branches')
  @HttpCode(HttpStatus.CREATED)
  addBranch(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.tenantsService.addBranch(id, dto);
  }
}

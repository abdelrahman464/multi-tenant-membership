import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformKeyGuard } from '../../common/guards/platform-key.guard';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';

@Controller('platform/tenants')
@Public()
@UseGuards(PlatformKeyGuard)
export class PlatformBranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post(':id/branches')
  @HttpCode(HttpStatus.CREATED)
  addBranch(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branchesService.addForPlatform(id, dto);
  }
}

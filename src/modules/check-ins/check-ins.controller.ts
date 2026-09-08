import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CheckInsService } from './check-ins.service';
import { CreateCheckInDto } from './dto/create-check-in.dto';
import { ListCheckInsQueryDto } from './dto/list-check-ins-query.dto';

@Controller('checkIns')
export class CheckInsController {
  constructor(private readonly checkInsService: CheckInsService) {}

  @Get()
  list(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ListCheckInsQueryDto,
  ) {
    return this.checkInsService.list(actor, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @GetAuthUser() actor: AuthenticatedUser,
    @Body() dto: CreateCheckInDto,
  ) {
    return this.checkInsService.create(actor, dto);
  }
}

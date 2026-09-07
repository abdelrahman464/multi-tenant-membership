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
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateMemberDto } from './dto/create-member.dto';
import { ListMembersQueryDto } from './dto/list-members-query.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembersService } from './members.service';

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  list(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ListMembersQueryDto,
  ) {
    return this.membersService.list(actor, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @GetAuthUser() actor: AuthenticatedUser,
    @Body() dto: CreateMemberDto,
  ) {
    return this.membersService.create(actor, dto);
  }

  @Get(':id')
  getById(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.membersService.getById(actor, id);
  }

  @Patch(':id')
  update(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membersService.update(actor, id, dto);
  }
}

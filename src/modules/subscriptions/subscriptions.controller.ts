import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { FreezeSubscriptionDto } from './dto/freeze-subscription.dto';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  list(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ListSubscriptionsQueryDto,
  ) {
    return this.subscriptionsService.list(actor, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @GetAuthUser() actor: AuthenticatedUser,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.subscriptionsService.create(actor, dto);
  }

  @Post(':id/freeze')
  freeze(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: FreezeSubscriptionDto,
  ) {
    return this.subscriptionsService.freeze(actor, id, dto);
  }

  @Post(':id/unfreeze')
  unfreeze(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.subscriptionsService.unfreeze(actor, id);
  }

  @Post(':id/renew')
  renew(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.subscriptionsService.renew(actor, id);
  }

  @Get(':id')
  getById(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.subscriptionsService.getById(actor, id);
  }
}

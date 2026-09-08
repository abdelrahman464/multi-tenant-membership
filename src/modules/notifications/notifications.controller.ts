import {
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
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.list(actor, query);
  }

  @Get('unreadCount')
  unreadCount(@GetAuthUser() actor: AuthenticatedUser) {
    return this.notificationsService.unreadCount(actor);
  }

  @Post('readAll')
  @HttpCode(HttpStatus.OK)
  markAllRead(@GetAuthUser() actor: AuthenticatedUser) {
    return this.notificationsService.markAllRead(actor);
  }

  @Get(':id')
  getById(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.notificationsService.getById(actor, id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.notificationsService.markRead(actor, id);
  }
}

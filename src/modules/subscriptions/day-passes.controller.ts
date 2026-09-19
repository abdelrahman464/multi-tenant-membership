import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { SellDayPassDto } from './dto/sell-day-pass.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('dayPasses')
export class DayPassesController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    action: AuditAction.DAY_PASS_SOLD,
    entityType: 'subscription',
    metadataFromBody: {
      memberId: 'member.id',
      paymentId: 'payment.id',
      checkInId: 'checkIn.id',
      memberCreated: 'memberCreated',
    },
  })
  sell(@GetAuthUser() actor: AuthenticatedUser, @Body() dto: SellDayPassDto) {
    return this.subscriptionsService.sellDayPass(actor, dto);
  }
}

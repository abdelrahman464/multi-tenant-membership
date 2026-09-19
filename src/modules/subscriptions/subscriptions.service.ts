import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { FreezeSubscriptionDto } from './dto/freeze-subscription.dto';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import { SellDayPassDto } from './dto/sell-day-pass.dto';
import { DayPassesRepository } from './repository/day-passes.repository';
import { SubscriptionsRepository } from './repository/subscriptions.repository';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly dayPassesRepository: DayPassesRepository,
  ) {}

  sellDayPass(actor: AuthenticatedUser, dto: SellDayPassDto) {
    return this.dayPassesRepository.sell(actor, dto);
  }

  list(actor: AuthenticatedUser, query: ListSubscriptionsQueryDto) {
    return this.subscriptionsRepository.findMany(actor.tenantId, query);
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const subscription = await this.subscriptionsRepository.findById(
      actor.tenantId,
      id,
    );
    if (!subscription) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription not found',
      );
    }
    return subscription;
  }

  create(actor: AuthenticatedUser, dto: CreateSubscriptionDto) {
    return this.subscriptionsRepository.create(actor, {
      memberId: dto.memberId,
      planId: dto.planId,
    });
  }

  async freeze(
    actor: AuthenticatedUser,
    id: string,
    dto: FreezeSubscriptionDto,
  ) {
    const subscription = await this.subscriptionsRepository.freeze(
      actor.tenantId,
      id,
      dto.days,
    );
    if (!subscription) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription not found',
      );
    }
    return subscription;
  }

  async unfreeze(actor: AuthenticatedUser, id: string) {
    const subscription = await this.subscriptionsRepository.unfreeze(
      actor.tenantId,
      id,
    );
    if (!subscription) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription not found',
      );
    }
    return subscription;
  }

  async renew(actor: AuthenticatedUser, id: string) {
    const subscription = await this.subscriptionsRepository.renew(actor, id);
    if (!subscription) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription not found',
      );
    }
    return subscription;
  }

  async cancel(
    actor: AuthenticatedUser,
    id: string,
    dto: CancelSubscriptionDto,
  ) {
    const subscription = await this.subscriptionsRepository.cancel(
      actor,
      id,
      dto.reason,
    );
    if (!subscription) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription not found',
      );
    }
    return subscription;
  }
}

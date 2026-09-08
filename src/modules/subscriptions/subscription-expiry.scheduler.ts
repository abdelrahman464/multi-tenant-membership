import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsRepository } from './repository/subscriptions.repository';

const DEFAULT_SWEEP_MS = 60_000;

/**
 * Marks ACTIVE subscriptions EXPIRED at endsAt, and IN_GRACE after
 * accessUntil. Staff reads also settle lazily; this sweep covers gyms
 * nobody opened today.
 */
@Injectable()
export class SubscriptionExpiryScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SubscriptionExpiryScheduler.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('app.nodeEnv') === 'test') {
      return;
    }
    this.timer = setInterval(() => {
      void this.sweep();
    }, DEFAULT_SWEEP_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async sweep(): Promise<void> {
    try {
      await this.subscriptionsRepository.expireAllTenants();
    } catch (error) {
      this.logger.warn(
        error instanceof Error ? error.message : 'Expiry sweep failed',
      );
    }
  }
}

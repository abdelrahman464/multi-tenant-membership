import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { INCR_WINDOW_LUA } from '../common/constants/rate-limit.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const url =
      this.config.get<string>('redis.url') || 'redis://127.0.0.1:6379';
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });

    this.client.on('error', (err) => {
      this.logger.error(err.message, 'Redis error');
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch {
      this.logger.warn(
        'Redis is not reachable. Start it with: docker compose up -d redis',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.removeAllListeners();
    if (this.client.status === 'ready') {
      await this.client.quit();
      return;
    }
    this.client.disconnect();
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async incrWindow(
    key: string,
    windowSec: number,
  ): Promise<{ count: number; ttlSec: number }> {
    const result = (await this.client.eval(
      INCR_WINDOW_LUA,
      1,
      key,
      String(windowSec),
    )) as [number, number];
    const count = Number(result[0]);
    const ttl = Number(result[1]);
    return {
      count,
      ttlSec: ttl > 0 ? ttl : windowSec,
    };
  }
}

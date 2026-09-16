import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ErrorCode } from '../constants/error-codes';
import {
  RATE_LIMIT_DEFAULT,
  RATE_LIMIT_LOGIN,
  RATE_LIMIT_PLATFORM,
  RATE_LIMIT_REFRESH,
  RATE_LIMIT_REPORTS,
  RATE_LIMIT_WINDOW_SEC,
} from '../constants/rate-limit.constants';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import { AppHttpException } from '../errors/app-http.exception';
import { extractClientMeta } from '../../modules/auth/utils/extract-client-meta.util';
import { RedisService } from '../../redis/redis.service';
import { rateLimitBucket, rateLimitKey } from '../utils/rate-limit.util';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get<string>('app.nodeEnv') === 'test') {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const path = req.originalUrl ?? req.url ?? '';
    if (path.includes('/health')) {
      return true;
    }

    const override = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    const bucket = rateLimitBucket(path);
    const limit = override?.limit ?? this.defaultLimit(bucket);
    const windowSec = override?.windowSec ?? RATE_LIMIT_WINDOW_SEC;
    const ip = extractClientMeta(req).ip;
    const key = rateLimitKey(bucket, ip);

    let count = 0;
    let ttlSec = windowSec;
    try {
      const window = await this.redis.incrWindow(key, windowSec);
      count = window.count;
      ttlSec = window.ttlSec;
    } catch (err) {
      this.logger.warn(
        err instanceof Error ? err.message : String(err),
        'Rate limit skipped; Redis is unavailable',
      );
      return true;
    }

    const res = context.switchToHttp().getResponse<Response>();
    const remaining = Math.max(0, limit - count);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (count > limit) {
      res.setHeader('Retry-After', String(ttlSec));
      throw new AppHttpException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RATE_LIMITED,
        'Too many requests. Try again shortly',
      );
    }
    return true;
  }

  private defaultLimit(bucket: string): number {
    if (bucket === 'login') return RATE_LIMIT_LOGIN;
    if (bucket === 'refresh') return RATE_LIMIT_REFRESH;
    if (bucket === 'reports') return RATE_LIMIT_REPORTS;
    if (bucket === 'platform') return RATE_LIMIT_PLATFORM;
    return RATE_LIMIT_DEFAULT;
  }
}

import { createHash, timingSafeEqual } from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ErrorCode } from '../constants/error-codes';
import { PLATFORM_API_KEY_HEADER } from '../constants/platform.constants';
import { AppHttpException } from '../errors/app-http.exception';

@Injectable()
export class PlatformKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('app.platformApiKey') ?? '';
    if (!expected) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.PLATFORM_KEY_MISSING,
        'Platform API key is not configured',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header(PLATFORM_API_KEY_HEADER) ?? '';

    if (!this.equal(expected, provided)) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.PLATFORM_KEY_INVALID,
        'Invalid platform API key',
      );
    }

    return true;
  }

  private equal(expected: string, provided: string): boolean {
    const left = createHash('sha256').update(expected).digest();
    const right = createHash('sha256').update(provided).digest();
    return timingSafeEqual(left, right);
  }
}

import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../constants/error-codes';
import { PLATFORM_API_KEY_HEADER } from '../constants/platform.constants';
import { AppHttpException } from '../errors/app-http.exception';
import { PlatformKeyGuard } from './platform-key.guard';

describe('PlatformKeyGuard', () => {
  const config = {
    get: (key: string) =>
      key === 'app.platformApiKey' ? 'secret-key' : undefined,
  } as unknown as ConfigService;

  const guard = new PlatformKeyGuard(config);

  it('allows a matching key', () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) =>
            name === PLATFORM_API_KEY_HEADER ? 'secret-key' : undefined,
        }),
      }),
    };

    expect(guard.canActivate(ctx as never)).toBe(true);
  });

  it('rejects a wrong key without leaking which gym exists', () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          header: () => 'nope',
        }),
      }),
    };

    try {
      guard.canActivate(ctx as never);
      fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppHttpException);
      expect((error as AppHttpException).getStatus()).toBe(
        HttpStatus.UNAUTHORIZED,
      );
      const body = (error as AppHttpException).getResponse() as {
        code: string;
      };
      expect(body.code).toBe(ErrorCode.PLATFORM_KEY_INVALID);
    }
  });
});

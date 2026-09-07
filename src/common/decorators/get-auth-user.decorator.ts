import {
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes';
import { AppHttpException } from '../errors/app-http.exception';
import { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Staff attached by JwtAuthGuard (`id`, `email`, `role`, `tenantId`, `branchId`).
 */
export const GetAuthUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.NO_TOKEN,
        'Authentication required',
      );
    }
    return req.user;
  },
);

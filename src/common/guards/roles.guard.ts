import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '../constants/error-codes';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AppHttpException } from '../errors/app-http.exception';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { StaffRole } from '../../modules/staff/enums/staff-role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'You do not have permission to perform this action',
      );
    }

    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TenantStatus } from '@prisma/client';
import { ErrorCode } from '../constants/error-codes';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppHttpException } from '../errors/app-http.exception';
import { TokenService } from '../tokens/token.service';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { StaffRepository } from '../../modules/staff/repository/staff.repository';
import { StaffRole } from '../../modules/staff/enums/staff-role.enum';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly staffRepository: StaffRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    const decoded = this.tokenService.verifyAccessToken(token);

    const staff = await this.staffRepository.findByIdInTenant(
      decoded.tenantId,
      decoded.id,
    );

    if (!staff || staff.tenantId !== decoded.tenantId) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_TOKEN,
        'Invalid or expired access token',
      );
    }

    if (staff.tenant.status === TenantStatus.SUSPENDED) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ErrorCode.TENANT_SUSPENDED,
        'This tenant is suspended',
      );
    }

    const tokenSv = decoded.sv ?? 0;
    if (tokenSv !== staff.sessionVersion) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.SESSION_REVOKED,
        'Session has been revoked. Please log in again',
      );
    }

    (req as Request & { user: AuthenticatedUser }).user = {
      id: staff.id,
      email: staff.email,
      role: staff.role as StaffRole,
      tenantId: staff.tenantId,
      branchId: staff.branchId,
    };

    return true;
  }

  private extractToken(req: Request): string {
    const header = req.headers.authorization;
    if (header) {
      const [bearer, token] = header.split(' ');
      if (bearer === 'Bearer' && token) return token;
    }

    const cookieToken = req.cookies?.accessToken as string | undefined;
    if (cookieToken) return cookieToken;

    throw new AppHttpException(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.NO_TOKEN,
      'No access token provided',
    );
  }
}

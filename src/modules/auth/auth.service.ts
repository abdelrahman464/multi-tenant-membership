import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { ErrorCode } from '../../common/constants/error-codes';
import { CookieService } from '../../common/cookies/cookie.service';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { HashService } from '../../common/security/hash.service';
import { TokenService } from '../../common/tokens/token.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { StaffRepository } from '../staff/repository/staff.repository';
import { toPublicStaff } from '../staff/staff.mapper';
import { AuthSessionService } from './auth-session.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import type { AuthSessionView } from './types/auth-session-meta.type';
import { extractClientMeta } from './utils/extract-client-meta.util';

type StaffWithPassword = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: import('@prisma/client').StaffRole;
  branchId: string | null;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly staffRepository: StaffRepository,
    private readonly tokenService: TokenService,
    private readonly cookieService: CookieService,
    private readonly hashService: HashService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async login(dto: LoginDto, req: Request, res: Response) {
    const tenant = await this.staffRepository.findTenantBySlug(dto.slug);
    if (!tenant) {
      throw this.invalidCredentials();
    }
    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ErrorCode.TENANT_SUSPENDED,
        'This tenant is suspended',
      );
    }

    const staff = await this.staffRepository.findByEmailWithPassword(
      tenant.id,
      dto.email,
    );
    if (!staff) {
      throw this.invalidCredentials();
    }

    const valid = await this.hashService.compare(dto.password, staff.password);
    if (!valid) {
      throw this.invalidCredentials();
    }

    return this.signIn(staff, req, res);
  }

  async me(actor: AuthenticatedUser) {
    const staff = await this.staffRepository.findByIdInTenant(
      actor.tenantId,
      actor.id,
    );
    if (!staff) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.STAFF_NOT_FOUND,
        'Staff not found',
      );
    }
    return toPublicStaff(staff);
  }

  listSessions(req: Request, userId: string): Promise<AuthSessionView[]> {
    return this.authSessionService.listSessions(
      userId,
      this.readRefreshSid(req),
    );
  }

  async revokeSessionById(
    req: Request,
    res: Response,
    userId: string,
    sid: string,
  ) {
    await this.authSessionService.revokeSession(sid, userId);
    const currentSid = this.readRefreshSid(req);
    if (currentSid && currentSid === sid) {
      this.cookieService.clearAuthCookies(res);
    }
    return { message: 'Session revoked' };
  }

  async refreshTokens(req: Request, res: Response, bodyToken?: string) {
    const refreshToken =
      (req.cookies?.refreshToken as string | undefined) || bodyToken;
    if (!refreshToken) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.NO_REFRESH_TOKEN,
        'No refresh token provided',
      );
    }

    const decoded = this.tokenService.verifyRefreshToken(refreshToken);
    const staff = await this.staffRepository.findByIdInTenant(
      decoded.tenantId,
      decoded.id,
    );
    if (!staff) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_REFRESH_TOKEN,
        'Invalid or expired refresh token',
      );
    }

    if (staff.tenant.status === TenantStatus.SUSPENDED) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ErrorCode.TENANT_SUSPENDED,
        'This tenant is suspended',
      );
    }

    this.assertSessionVersion(staff.sessionVersion, decoded.sv);

    if (!decoded.sid) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_REFRESH_TOKEN,
        'Invalid or expired refresh token',
      );
    }

    const sessionActive = await this.authSessionService.isSessionActive(
      decoded.sid,
      staff.id,
    );
    if (!sessionActive) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.SESSION_REVOKED,
        'Session has been revoked. Please log in again',
      );
    }

    await this.authSessionService.revokeSession(decoded.sid, staff.id);
    return this.signIn(staff, req, res);
  }

  async logout(req: Request, res: Response) {
    const refreshToken =
      (req.cookies?.refreshToken as string | undefined) || undefined;

    if (refreshToken) {
      try {
        const decoded = this.tokenService.verifyRefreshToken(refreshToken);
        if (decoded.sid) {
          await this.authSessionService.revokeSession(decoded.sid, decoded.id);
        }
      } catch {
        // Always clear cookies below.
      }
    }

    this.cookieService.clearAuthCookies(res);
    return { message: 'Logged out' };
  }

  async logoutAll(actor: AuthenticatedUser, res: Response) {
    await this.authSessionService.revokeAllSessions(actor.id);
    await this.staffRepository.bumpSessionVersion(actor.tenantId, actor.id);
    this.cookieService.clearAuthCookies(res);
    return { message: 'Logged out from all devices' };
  }

  async changePassword(
    actor: AuthenticatedUser,
    dto: ChangePasswordDto,
    req: Request,
    res: Response,
  ) {
    const staff = await this.staffRepository.findByIdWithPassword(
      actor.tenantId,
      actor.id,
    );
    if (!staff) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.STAFF_NOT_FOUND,
        'Staff not found',
      );
    }

    const match = await this.hashService.compare(
      dto.currentPassword,
      staff.password,
    );
    if (!match) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.WRONG_CURRENT_PASSWORD,
        'Current password is incorrect',
      );
    }

    const revokeOthers = dto.revokeOtherSessions === true;
    const updated = await this.staffRepository.updatePassword(
      actor.tenantId,
      actor.id,
      await this.hashService.hash(dto.newPassword),
      { bumpSessionVersion: revokeOthers },
    );

    if (revokeOthers) {
      await this.authSessionService.revokeAllSessions(updated.id);
    } else {
      const currentSid = this.readRefreshSid(req);
      if (currentSid) {
        await this.authSessionService.revokeSession(currentSid, updated.id);
      }
    }

    return this.signIn(updated, req, res);
  }

  private async signIn(staff: StaffWithPassword, req: Request, res: Response) {
    const payload = this.tokenService.createPayload(staff);
    const sid = await this.authSessionService.createSession(
      staff.id,
      staff.tenantId,
      extractClientMeta(req),
    );
    const accessToken = this.tokenService.generateAccessToken(payload);
    const refreshToken = this.tokenService.generateRefreshToken({
      ...payload,
      sid,
    });

    this.cookieService.setAuthCookies(res, accessToken, refreshToken);
    return {
      staff: toPublicStaff(staff),
      accessToken,
    };
  }

  private readRefreshSid(req: Request): string | undefined {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) return undefined;
    try {
      return this.tokenService.verifyRefreshToken(refreshToken).sid;
    } catch {
      return undefined;
    }
  }

  private assertSessionVersion(
    userSessionVersion: number,
    tokenSessionVersion?: number,
  ): void {
    if ((tokenSessionVersion ?? 0) !== userSessionVersion) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.SESSION_REVOKED,
        'Session has been revoked. Please log in again',
      );
    }
  }

  private invalidCredentials(): AppHttpException {
    return new AppHttpException(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.INVALID_CREDENTIALS,
      'Invalid email, password, or tenant',
    );
  }
}

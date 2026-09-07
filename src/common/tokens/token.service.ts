import * as jwt from 'jsonwebtoken';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../constants/error-codes';
import { AppHttpException } from '../errors/app-http.exception';
import { JwtPayload } from '../types/jwt-payload.type';

type StaffTokenSource = {
  id: string;
  email: string;
  tenantId: string;
  sessionVersion: number;
};

@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService) {}

  createPayload(
    staff: StaffTokenSource,
  ): Pick<JwtPayload, 'id' | 'email' | 'tenantId' | 'sv'> {
    return {
      id: staff.id,
      email: staff.email,
      tenantId: staff.tenantId,
      sv: staff.sessionVersion,
    };
  }

  generateAccessToken(
    payload: Pick<JwtPayload, 'id' | 'email' | 'tenantId' | 'sv'>,
  ): string {
    return jwt.sign(payload, this.accessSecret(), {
      expiresIn: (this.config.get<string>('jwt.expire') ||
        '15m') as jwt.SignOptions['expiresIn'],
    });
  }

  generateRefreshToken(
    payload: Pick<JwtPayload, 'id' | 'email' | 'tenantId' | 'sv' | 'sid'>,
  ): string {
    return jwt.sign(payload, this.refreshSecret(), {
      expiresIn: (this.config.get<string>('jwt.refreshExpire') ||
        '30d') as jwt.SignOptions['expiresIn'],
    });
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.verify(token, this.accessSecret(), ErrorCode.INVALID_TOKEN);
  }

  verifyRefreshToken(token: string): JwtPayload {
    return this.verify(
      token,
      this.refreshSecret(),
      ErrorCode.INVALID_REFRESH_TOKEN,
    );
  }

  private verify(
    token: string,
    secret: string,
    code:
      typeof ErrorCode.INVALID_TOKEN | typeof ErrorCode.INVALID_REFRESH_TOKEN,
  ): JwtPayload {
    try {
      const decoded = jwt.verify(token, secret);
      if (typeof decoded === 'string') {
        throw new Error('Invalid token payload');
      }
      const payload = decoded as JwtPayload;
      if (!payload.id || !payload.tenantId) {
        throw new Error('Invalid token payload');
      }
      return payload;
    } catch (error) {
      if (error instanceof AppHttpException) {
        throw error;
      }
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        code,
        code === ErrorCode.INVALID_REFRESH_TOKEN
          ? 'Invalid or expired refresh token'
          : 'Invalid or expired access token',
      );
    }
  }

  private accessSecret(): string {
    const secret = this.config.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    return secret;
  }

  private refreshSecret(): string {
    const secret = this.config.get<string>('jwt.refreshSecret');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }
    return secret;
  }
}

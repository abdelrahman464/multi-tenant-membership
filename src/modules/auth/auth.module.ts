import { Module } from '@nestjs/common';
import { CookieService } from '../../common/cookies/cookie.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SecurityModule } from '../../common/security/security.module';
import { TokenService } from '../../common/tokens/token.service';
import { StaffModule } from '../staff/staff.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthSessionService } from './auth-session.service';

@Module({
  imports: [StaffModule, SecurityModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSessionService,
    TokenService,
    CookieService,
    JwtAuthGuard,
  ],
  exports: [TokenService, CookieService, JwtAuthGuard],
})
export class AuthModule {}

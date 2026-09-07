import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, req, res);
  }

  @Public()
  @Post('refresh')
  refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refreshTokens(req, res, dto.refreshToken);
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req, res);
  }

  @Get('me')
  me(@GetAuthUser() actor: AuthenticatedUser) {
    return this.authService.me(actor);
  }

  @Post('logoutAll')
  logoutAll(
    @GetAuthUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logoutAll(actor, res);
  }

  @Get('sessions')
  listSessions(@GetAuthUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.authService.listSessions(req, actor.id);
  }

  @Delete('sessions/:sid')
  revokeSession(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('sid', ParseUuidPipe) sid: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.revokeSessionById(req, res, actor.id, sid);
  }

  @Patch('changePassword')
  changePassword(
    @GetAuthUser() actor: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.changePassword(actor, dto, req, res);
  }
}

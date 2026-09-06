import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      version: this.config.get<string>('app.version'),
    };
  }

  @Get('ready')
  async getReady(@Res({ passthrough: true }) res: Response) {
    const database = await this.prisma.ping();
    if (!database) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: database ? 'ok' : 'degraded',
      version: this.config.get<string>('app.version'),
      checks: {
        api: 'up',
        database: database ? 'up' : 'down',
      },
    };
  }
}

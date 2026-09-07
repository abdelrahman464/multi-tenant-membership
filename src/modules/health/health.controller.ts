import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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
    const [database, cache] = await Promise.all([
      this.prisma.ping(),
      this.redis.ping(),
    ]);
    if (!database || !cache) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: database && cache ? 'ok' : 'degraded',
      version: this.config.get<string>('app.version'),
      checks: {
        api: 'up',
        database: database ? 'up' : 'down',
        redis: cache ? 'up' : 'down',
      },
    };
  }
}

import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const config = {
    get: (key: string) => (key === 'app.version' ? 'abc1234' : undefined),
  } as unknown as ConfigService;

  const prisma = {
    ping: async () => true,
  } as unknown as PrismaService;

  const controller = new HealthController(config, prisma);

  it('returns ok and the version from ConfigService', () => {
    expect(controller.getHealth()).toEqual({
      status: 'ok',
      version: 'abc1234',
    });
  });
});

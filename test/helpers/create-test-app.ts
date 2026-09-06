import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/setup-app';
import { PrismaService } from '../../src/database/prisma.service';

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app, app.get(ConfigService));
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  configureApp(app, config);

  const port = config.get<number>('app.port') ?? 8000;
  await app.listen(port);
  app.get(Logger).log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();

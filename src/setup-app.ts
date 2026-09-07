import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { API_PREFIX } from './common/constants/api.constants';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';

/**
 * HTTP middleware/pipes/filters shared by `main.ts` and e2e tests
 * so production and tests behave the same.
 */
export function configureApp(
  app: INestApplication,
  config: ConfigService,
): void {
  app.enableShutdownHooks();
  app.setGlobalPrefix(API_PREFIX);

  if (isExpressApp(app)) {
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const origins = (config.get<string>('app.webOrigin') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  });
}

function isExpressApp(app: INestApplication): app is NestExpressApplication {
  return typeof (app as NestExpressApplication).set === 'function';
}

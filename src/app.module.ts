import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import { buildLoggerParams } from './config/logger.config';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { TenantsModule } from './modules/tenants/tenants.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      load: [appConfig, databaseConfig, redisConfig],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildLoggerParams(config),
    }),
    PrismaModule,
    HealthModule,
    TenantsModule,
  ],
})
export class AppModule {}

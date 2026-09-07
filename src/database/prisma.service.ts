import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Prisma is the Postgres client (Mongoose analogue).
 *
 * Connection pooling: Nest keeps one PrismaClient. Each HTTP request that
 * touches tenant data must run inside $transaction and SET LOCAL session
 * variables so a returned pool connection cannot leak another gym's RLS.
 *
 * set_config(..., true) = SET LOCAL (ends when the transaction commits).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('database.url') ?? '';
    super({
      adapter: new PrismaPg({
        connectionString,
        // pg has no timeout by default; keep the old 5s connect budget
        connectionTimeoutMillis: 5000,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch {
      this.logger.warn(
        'PostgreSQL is not reachable. Start it with: docker compose up -d postgres',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /** You (platform) may see every tenant. Used by /platform/* routes. */
  withPlatform<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform', 'on', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', '', true)`;
      return fn(tx);
    });
  }

  /**
   * Staff-shaped access. Pass tenant_id from the JWT only — never from the body.
   * RLS then hides every row whose tenant_id does not match.
   */
  withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform', 'off', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }
}

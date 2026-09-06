import { registerAs } from '@nestjs/config';

/**
 * Typed slice read via ConfigService: config.get('app.port').
 * Defaults live here — same pattern as nest-ecommerc. No Zod.
 *
 * `version` is not a product rule. It is the build id (git sha in Jenkins,
 * or 0.1.0 locally) so /health and Docker tags tell you which code is running.
 */
export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8000),
  logLevel: process.env.LOG_LEVEL,
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  version: process.env.APP_VERSION ?? '0.1.0',
  platformApiKey: process.env.PLATFORM_API_KEY ?? '',
}));

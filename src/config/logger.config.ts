import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';

/**
 * nestjs-pino / pino-http options.
 *
 * Dev  → pretty one-line logs.
 * Prod → JSON (ship to CloudWatch / Loki / Datadog later).
 * Test → silent so unit/e2e output stays readable.
 */
export function buildLoggerParams(config: ConfigService): Params {
  const nodeEnv = config.get<string>('app.nodeEnv') ?? 'development';
  const isProd = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';
  const level =
    config.get<string>('app.logLevel') ??
    (isTest ? 'silent' : isProd ? 'info' : 'debug');

  return {
    pinoHttp: {
      level,
      genReqId: (req, res) => {
        const existing = req.headers['x-request-id'];
        const id =
          (Array.isArray(existing) ? existing[0] : existing) || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      transport:
        isProd || isTest
          ? undefined
          : {
              target: 'pino-pretty',
              options: {
                singleLine: true,
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["set-cookie"]',
        ],
        remove: true,
      },
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
      customProps: () => ({
        context: 'HTTP',
      }),
      autoLogging: {
        ignore: (req) =>
          typeof req.url === 'string' && req.url.includes('/health'),
      },
    },
  };
}

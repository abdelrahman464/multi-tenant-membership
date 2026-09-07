import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET ?? '',
  expire: process.env.JWT_EXPIRE ?? '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  refreshExpire: process.env.JWT_REFRESH_EXPIRE ?? '30d',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
}));

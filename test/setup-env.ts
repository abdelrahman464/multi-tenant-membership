process.env.NODE_ENV ??= 'test';
process.env.PLATFORM_API_KEY ??= 'test-platform-key';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_EXPIRE ??= '15m';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.JWT_REFRESH_EXPIRE ??= '30d';
process.env.COOKIE_SECURE ??= 'false';
process.env.REDIS_URL = 'redis://localhost:6379';

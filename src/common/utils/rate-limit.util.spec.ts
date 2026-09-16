import { rateLimitBucket, rateLimitKey } from './rate-limit.util';

describe('rate-limit.util', () => {
  it('keys a bucket to an IP', () => {
    expect(rateLimitKey('login', '127.0.0.1')).toBe('rl:login:127.0.0.1');
  });

  it('picks a bucket from the request path', () => {
    expect(rateLimitBucket('/api/v1/auth/login')).toBe('login');
    expect(rateLimitBucket('/api/v1/auth/refresh')).toBe('refresh');
    expect(rateLimitBucket('/api/v1/reports/members')).toBe('reports');
    expect(rateLimitBucket('/api/v1/payments/abc/receipt')).toBe('reports');
    expect(rateLimitBucket('/api/v1/platform/tenants')).toBe('platform');
    expect(rateLimitBucket('/api/v1/members')).toBe('api');
  });
});

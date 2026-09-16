export function rateLimitKey(bucket: string, ip: string): string {
  return `rl:${bucket}:${ip}`;
}

export function rateLimitBucket(path: string): string {
  if (path.includes('/auth/login')) return 'login';
  if (path.includes('/auth/refresh')) return 'refresh';
  if (path.includes('/reports/')) return 'reports';
  if (path.includes('/platform/')) return 'platform';
  return 'api';
}

export const RATE_LIMIT_WINDOW_SEC = 60;
export const RATE_LIMIT_DEFAULT = 180;
export const RATE_LIMIT_LOGIN = 20;
export const RATE_LIMIT_REFRESH = 60;
export const RATE_LIMIT_REPORTS = 30;
export const RATE_LIMIT_PLATFORM = 60;

export const INCR_WINDOW_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {n, ttl}
`;

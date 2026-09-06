import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url:
    process.env.DATABASE_URL ??
    'postgresql://membership_app:multitenant@localhost:5432/multitenant_membership?schema=public',
}));

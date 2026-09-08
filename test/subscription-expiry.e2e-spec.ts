import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import {
  addUtcDays,
  MS_PER_DAY,
} from '../src/modules/subscriptions/utils/freeze.util';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Subscription expiry (e2e)', () => {
  let app!: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let ready = false;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    redis = app.get(RedisService);
    ready = (await prisma.ping()) && (await redis.ping());
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('settles ACTIVE to EXPIRED at endsAt; grace is calendar until check-in', async () => {
    if (!ready) {
      console.warn(
        'Skipping expiry DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const slug = `exp-${suffix}`;
    const password = 'Password1!';

    const gym = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Expiry Gym',
        slug,
        firstBranch: { name: 'Maadi' },
        firstOwner: {
          name: 'Owner',
          email: `owner-${suffix}@example.com`,
          password,
        },
      })
      .expect(201);

    const tenantId = gym.body.id as string;
    const branchId = gym.body.branches[0].id as string;
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: `owner-${suffix}@example.com`,
        password,
      })
      .expect(201);
    const token = login.body.accessToken as string;

    const member = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ahmed Hassan',
        phone: '+201002220000',
        homeBranchId: branchId,
      })
      .expect(201);

    const plan = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Gold 30',
        durationDays: 30,
        sessionCount: 8,
        price: 1500,
      })
      .expect(201);

    const noGrace = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberId: member.body.id, planId: plan.body.id })
      .expect(201);

    await prisma.withTenant(tenantId, (tx) =>
      tx.subscription.update({
        where: { id: noGrace.body.id },
        data: { endsAt: new Date(Date.now() - 60_000) },
      }),
    );

    const expired = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${noGrace.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(expired.body.status).toBe('EXPIRED');
    expect(expired.body.expiredAt).toEqual(expect.any(String));
    expect(expired.body.inGrace).toBe(false);

    const freezeExpired = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${noGrace.body.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .send({ days: 3 })
      .expect(400);
    expect(freezeExpired.body.code).toBe(ErrorCode.SUBSCRIPTION_NOT_ACTIVE);

    await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ graceEnabled: true, graceDays: 3 })
      .expect(200);

    const withGrace = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberId: member.body.id, planId: plan.body.id })
      .expect(201);

    await prisma.withTenant(tenantId, (tx) =>
      tx.subscription.update({
        where: { id: withGrace.body.id },
        data: { endsAt: addUtcDays(new Date(), -1) },
      }),
    );

    const inGrace = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${withGrace.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(inGrace.body.status).toBe('EXPIRED');
    expect(inGrace.body.inGrace).toBe(true);
    expect(
      new Date(inGrace.body.accessUntil).getTime() -
        new Date(inGrace.body.endsAt).getTime(),
    ).toBeCloseTo(3 * MS_PER_DAY, -3);

    await prisma.withTenant(tenantId, (tx) =>
      tx.subscription.update({
        where: { id: withGrace.body.id },
        data: { endsAt: addUtcDays(new Date(), -4) },
      }),
    );

    const afterGrace = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${withGrace.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterGrace.body.status).toBe('EXPIRED');
    expect(afterGrace.body.inGrace).toBe(false);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?status=EXPIRED')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.total).toBeGreaterThanOrEqual(2);

    const renewed = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${noGrace.body.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(renewed.body.id).not.toBe(noGrace.body.id);
    expect(renewed.body.status).toBe('ACTIVE');
    expect(renewed.body.sessionsRemaining).toBe(8);
  });
});

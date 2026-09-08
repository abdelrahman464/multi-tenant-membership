import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { addUtcDays } from '../src/modules/subscriptions/utils/freeze.util';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Notifications (e2e)', () => {
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

  it('rejects /notifications without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('records expiry once, ignores calendar grace, isolates tenants, and marks read', async () => {
    if (!ready) {
      console.warn(
        'Skipping notification DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const password = 'Password1!';

    const gymA = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Notify A',
        slug: `notify-a-${suffix}`,
        firstBranch: { name: 'Maadi' },
        firstOwner: {
          name: 'Owner A',
          email: `owner-a-${suffix}@example.com`,
          password,
        },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Notify B',
        slug: `notify-b-${suffix}`,
        firstBranch: { name: 'Nasr City' },
        firstOwner: {
          name: 'Owner B',
          email: `owner-b-${suffix}@example.com`,
          password,
        },
      })
      .expect(201);

    const tenantA = gymA.body.id as string;
    const branchA = gymA.body.branches[0].id as string;

    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: `notify-a-${suffix}`,
        email: `owner-a-${suffix}@example.com`,
        password,
      })
      .expect(201);
    const tokenA = loginA.body.accessToken as string;

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: `notify-b-${suffix}`,
        email: `owner-b-${suffix}@example.com`,
        password,
      })
      .expect(201);
    const tokenB = loginB.body.accessToken as string;

    const member = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Ahmed Hassan',
        phone: '+201002220001',
        homeBranchId: branchA,
      })
      .expect(201);

    const plan = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Gold 30',
        durationDays: 30,
        sessionCount: 8,
        price: 1500,
      })
      .expect(201);

    const noGrace = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: member.body.id, planId: plan.body.id })
      .expect(201);

    await prisma.withTenant(tenantA, (tx) =>
      tx.subscription.update({
        where: { id: noGrace.body.id },
        data: { endsAt: new Date(Date.now() - 60_000) },
      }),
    );

    const expiredInbox = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(expiredInbox.body.total).toBe(1);
    expect(expiredInbox.body.data[0].type).toBe('SUBSCRIPTION_EXPIRED');
    expect(expiredInbox.body.data[0].memberName).toBe('Ahmed Hassan');
    expect(expiredInbox.body.data[0].planName).toBe('Gold 30');
    expect(expiredInbox.body.data[0].message).toBe(
      "Ahmed Hassan's Gold 30 has expired",
    );
    expect(expiredInbox.body.data[0].unread).toBe(true);
    expect(expiredInbox.body.data[0].subscriptionId).toBe(noGrace.body.id);

    const again = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(again.body.total).toBe(1);

    const unread = await request(app.getHttpServer())
      .get('/api/v1/notifications/unreadCount')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(unread.body.unread).toBe(1);

    await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ graceEnabled: true, graceDays: 3 })
      .expect(200);

    const withGrace = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: member.body.id, planId: plan.body.id })
      .expect(201);

    await prisma.withTenant(tenantA, (tx) =>
      tx.subscription.update({
        where: { id: withGrace.body.id },
        data: { endsAt: addUtcDays(new Date(), -1) },
      }),
    );

    const stillPaidWindow = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${withGrace.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(stillPaidWindow.body.status).toBe('EXPIRED');
    expect(stillPaidWindow.body.inGrace).toBe(true);

    const noGraceInbox = await request(app.getHttpServer())
      .get('/api/v1/notifications?type=SUBSCRIPTION_IN_GRACE')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(noGraceInbox.body.total).toBe(0);

    await prisma.withTenant(tenantA, (tx) =>
      tx.subscription.update({
        where: { id: withGrace.body.id },
        data: { endsAt: addUtcDays(new Date(), -4) },
      }),
    );

    const afterGrace = await request(app.getHttpServer())
      .get(`/api/v1/notifications?subscriptionId=${withGrace.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(afterGrace.body.total).toBe(1);
    expect(afterGrace.body.data[0].type).toBe('SUBSCRIPTION_EXPIRED');

    const isolated = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(isolated.body.total).toBe(0);

    const isolatedCount = await request(app.getHttpServer())
      .get('/api/v1/notifications/unreadCount')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(isolatedCount.body.unread).toBe(0);

    const expiredId = expiredInbox.body.data[0].id as string;
    const marked = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${expiredId}/read`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(marked.body.unread).toBe(false);
    expect(marked.body.readAt).toEqual(expect.any(String));

    const unreadAfterOne = await request(app.getHttpServer())
      .get('/api/v1/notifications/unreadCount')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(unreadAfterOne.body.unread).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .post('/api/v1/notifications/readAll')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const cleared = await request(app.getHttpServer())
      .get('/api/v1/notifications/unreadCount')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(cleared.body.unread).toBe(0);

    const unreadOnly = await request(app.getHttpServer())
      .get('/api/v1/notifications?unread=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(unreadOnly.body.total).toBe(0);

    const missing = await request(app.getHttpServer())
      .get('/api/v1/notifications/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    expect(missing.body.code).toBe(ErrorCode.NOTIFICATION_NOT_FOUND);

    const otherGym = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${expiredId}/read`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    expect(otherGym.body.code).toBe(ErrorCode.NOTIFICATION_NOT_FOUND);
  });
});

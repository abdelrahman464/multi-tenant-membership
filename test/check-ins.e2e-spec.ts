import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { addUtcDays } from '../src/modules/subscriptions/utils/freeze.util';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Check-ins (e2e)', () => {
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

  it('rejects /checkIns without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/checkIns')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('allows paid and grace visits, expires at endsAt, and blocks after grace', async () => {
    if (!ready) {
      console.warn(
        'Skipping check-in DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const password = 'Password1!';
    const slug = `door-${suffix}`;

    const gym = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Door Gym',
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

    const second = await request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${tenantId}/branches`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({ name: 'Nasr City' })
      .expect(201);

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
        phone: '+201003330001',
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
        maxVisitsPerDay: 1,
        price: 1500,
      })
      .expect(201);

    const selected = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Maadi only',
        durationDays: 30,
        sessionCount: 4,
        price: 800,
        allBranches: false,
        branchIds: [branchId],
      })
      .expect(201);

    const paid = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberId: member.body.id, planId: plan.body.id })
      .expect(201);

    const first = await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberId: member.body.id, branchId })
      .expect(201);
    expect(first.body.status).toBe('ACTIVE');
    expect(first.body.usedGrace).toBe(false);
    expect(first.body.sessionsRemaining).toBe(7);
    expect(first.body.visitsToday).toBe(1);

    const limited = await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: member.body.id,
        branchId,
        subscriptionId: paid.body.id,
      })
      .expect(400);
    expect(limited.body.code).toBe(ErrorCode.CHECKIN_DAILY_LIMIT);

    await prisma.withTenant(tenantId, (tx) =>
      tx.checkIn.deleteMany({ where: { subscriptionId: paid.body.id } }),
    );

    const otherPlan = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberId: member.body.id, planId: selected.body.id })
      .expect(201);

    const wrongBranch = await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: member.body.id,
        branchId: second.body.id,
        subscriptionId: otherPlan.body.id,
      })
      .expect(400);
    expect(wrongBranch.body.code).toBe(ErrorCode.CHECKIN_BRANCH_NOT_ALLOWED);

    await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ graceEnabled: true, graceDays: 5 })
      .expect(200);

    await prisma.withTenant(tenantId, (tx) =>
      tx.subscription.update({
        where: { id: paid.body.id },
        data: { endsAt: addUtcDays(new Date(), -1) },
      }),
    );

    const settled = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${paid.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(settled.body.status).toBe('EXPIRED');
    expect(settled.body.inGrace).toBe(true);

    const graceVisit = await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: member.body.id,
        branchId,
        subscriptionId: paid.body.id,
      })
      .expect(201);
    expect(graceVisit.body.status).toBe('IN_GRACE');
    expect(graceVisit.body.usedGrace).toBe(true);
    expect(graceVisit.body.sessionsRemaining).toBe(6);

    const afterDoor = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${paid.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterDoor.body.status).toBe('IN_GRACE');
    expect(afterDoor.body.graceUsedAt).toEqual(expect.any(String));
    expect(afterDoor.body.graceEndsAt).toEqual(expect.any(String));

    const graceInbox = await request(app.getHttpServer())
      .get(`/api/v1/notifications?type=SUBSCRIPTION_IN_GRACE`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(graceInbox.body.total).toBe(1);
    expect(graceInbox.body.data[0].message).toBe(
      "Ahmed Hassan's Gold 30 used a grace day",
    );

    await prisma.withTenant(tenantId, (tx) =>
      tx.subscription.update({
        where: { id: paid.body.id },
        data: {
          endsAt: addUtcDays(new Date(), -6),
          graceEndsAt: addUtcDays(new Date(), -1),
        },
      }),
    );

    const blocked = await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: member.body.id,
        branchId,
        subscriptionId: paid.body.id,
      })
      .expect(400);
    expect(blocked.body.code).toBe(ErrorCode.CHECKIN_GRACE_USED);

    await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ graceEnabled: true, graceDays: 30 })
      .expect(200);

    await prisma.withTenant(tenantId, (tx) =>
      tx.checkIn.deleteMany({ where: { subscriptionId: paid.body.id } }),
    );

    const reused = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${paid.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(reused.body.status).toBe('EXPIRED');
    expect(reused.body.graceUsedAt).toEqual(expect.any(String));

    const noSecondGrace = await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: member.body.id,
        branchId,
        subscriptionId: paid.body.id,
      })
      .expect(400);
    expect(noSecondGrace.body.code).toBe(ErrorCode.CHECKIN_GRACE_USED);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/checkIns?memberId=${member.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.total).toBe(0);
  });
});

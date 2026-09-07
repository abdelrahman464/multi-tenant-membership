import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';
const MS_PER_DAY = 86_400_000;

describe('Subscription lifecycle (e2e)', () => {
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

  it('configures freeze/grace, freezes, unfreezes, and renews', async () => {
    if (!ready) {
      console.warn(
        'Skipping lifecycle DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const slug = `life-${suffix}`;
    const password = 'Password1!';

    const gym = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Lifecycle Gym',
        slug,
        firstBranch: { name: 'Maadi' },
        firstOwner: {
          name: 'Owner',
          email: `owner-${suffix}@example.com`,
          password,
        },
      })
      .expect(201);

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

    const defaults = await request(app.getHttpServer())
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(defaults.body.freezeEnabled).toBe(false);
    expect(defaults.body.graceEnabled).toBe(false);

    const member = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ahmed Hassan',
        phone: '+201001110000',
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

    const created = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberId: member.body.id, planId: plan.body.id })
      .expect(201);

    const originalEnds = new Date(created.body.endsAt).getTime();
    expect(created.body.inGrace).toBe(false);
    expect(new Date(created.body.accessUntil).getTime()).toBe(originalEnds);

    await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${created.body.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .send({ days: 7 })
      .expect(400)
      .then((res) => {
        expect(res.body.code).toBe(ErrorCode.FREEZE_DISABLED);
      });

    await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        freezeEnabled: true,
        maxFreezeDays: 14,
        maxFreezeDaysPerYear: 20,
        graceEnabled: true,
        graceDays: 3,
      })
      .expect(200);

    const tooLong = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${created.body.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .send({ days: 15 })
      .expect(400);
    expect(tooLong.body.code).toBe(ErrorCode.FREEZE_DAYS_EXCEEDED);

    const frozen = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${created.body.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .send({ days: 7 })
      .expect(201);

    expect(frozen.body.status).toBe('FROZEN');
    expect(frozen.body.frozenAt).toEqual(expect.any(String));
    expect(new Date(frozen.body.endsAt).getTime() - originalEnds).toBeCloseTo(
      7 * MS_PER_DAY,
      -3,
    );

    const again = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${created.body.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .send({ days: 2 })
      .expect(409);
    expect(again.body.code).toBe(ErrorCode.SUBSCRIPTION_ALREADY_FROZEN);

    const renewFrozen = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${created.body.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(renewFrozen.body.code).toBe(ErrorCode.SUBSCRIPTION_FROZEN);

    const resumed = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${created.body.id}/unfreeze`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(resumed.body.status).toBe('ACTIVE');
    expect(resumed.body.frozenAt).toBeNull();
    expect(new Date(resumed.body.endsAt).getTime()).toBeCloseTo(
      originalEnds,
      -3,
    );

    const yearCap = await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ maxFreezeDaysPerYear: 5 })
      .expect(200);
    expect(yearCap.body.maxFreezeDaysPerYear).toBe(5);

    const yearExceeded = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${created.body.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .send({ days: 7 })
      .expect(400);
    expect(yearExceeded.body.code).toBe(ErrorCode.FREEZE_YEAR_EXCEEDED);

    const stillActive = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${created.body.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(stillActive.body.code).toBe(ErrorCode.SUBSCRIPTION_NOT_ENDED);

    await prisma.withTenant(gym.body.id, (tx) =>
      tx.subscription.update({
        where: { id: created.body.id },
        data: { endsAt: new Date(Date.now() - 60_000) },
      }),
    );

    const renewed = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${created.body.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(renewed.body.id).not.toBe(created.body.id);
    expect(renewed.body.memberId).toBe(member.body.id);
    expect(renewed.body.planId).toBe(plan.body.id);
    expect(renewed.body.sessionCount).toBe(8);
    expect(renewed.body.sessionsRemaining).toBe(8);
    expect(
      new Date(renewed.body.endsAt).getTime() -
        new Date(renewed.body.startsAt).getTime(),
    ).toBeCloseTo(30 * MS_PER_DAY, -3);

    const original = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(original.body.sessionsRemaining).toBe(8);
    expect(
      new Date(renewed.body.accessUntil).getTime() -
        new Date(renewed.body.endsAt).getTime(),
    ).toBeCloseTo(3 * MS_PER_DAY, -3);

    const desk = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Desk',
        email: `desk-${suffix}@example.com`,
        password: 'DeskPass1!',
        role: 'BRANCH_STAFF',
        branchId,
      })
      .expect(201);

    const deskLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: desk.body.email,
        password: 'DeskPass1!',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${deskLogin.body.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${deskLogin.body.accessToken}`)
      .send({ freezeEnabled: false })
      .expect(403);
  });
});

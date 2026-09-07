import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Subscriptions (e2e)', () => {
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

  it('rejects /subscriptions without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/subscriptions')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('lets a member join time and pack plans, isolated by tenant', async () => {
    if (!ready) {
      console.warn(
        'Skipping subscription DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const slugA = `sub-a-${suffix}`;
    const slugB = `sub-b-${suffix}`;
    const password = 'Password1!';

    const gymA = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Subs A',
        slug: slugA,
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
        name: 'Subs B',
        slug: slugB,
        firstBranch: { name: 'Nasr City' },
        firstOwner: {
          name: 'Owner B',
          email: `owner-b-${suffix}@example.com`,
          password,
        },
      })
      .expect(201);

    const branchA = gymA.body.branches[0].id as string;
    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: slugA,
        email: `owner-a-${suffix}@example.com`,
        password,
      })
      .expect(201);
    const tokenA = loginA.body.accessToken as string;

    const member = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Ahmed Hassan',
        phone: '+201009998887',
        homeBranchId: branchA,
      })
      .expect(201);

    const monthly = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Gold 30',
        durationDays: 30,
        maxVisitsPerDay: 1,
        price: 1500,
      })
      .expect(201);

    const pack = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: '8 in 30',
        durationDays: 30,
        sessionCount: 8,
        maxVisitsPerDay: 2,
        price: 800,
      })
      .expect(201);

    const timeSub = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: member.body.id, planId: monthly.body.id })
      .expect(201);

    expect(timeSub.body.memberId).toBe(member.body.id);
    expect(timeSub.body.planId).toBe(monthly.body.id);
    expect(timeSub.body.planName).toBe('Gold 30');
    expect(timeSub.body.durationDays).toBe(30);
    expect(timeSub.body.sessionCount).toBeNull();
    expect(timeSub.body.sessionsRemaining).toBeNull();
    expect(timeSub.body.maxVisitsPerDay).toBe(1);
    expect(timeSub.body.status).toBe('ACTIVE');
    expect(new Date(timeSub.body.endsAt).getTime()).toBeGreaterThan(
      new Date(timeSub.body.startsAt).getTime(),
    );

    const packSub = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: member.body.id, planId: pack.body.id })
      .expect(201);

    expect(packSub.body.sessionCount).toBe(8);
    expect(packSub.body.sessionsRemaining).toBe(8);
    expect(packSub.body.maxVisitsPerDay).toBe(2);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions?memberId=${member.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(listed.body.total).toBe(2);

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: slugB,
        email: `owner-b-${suffix}@example.com`,
        password,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${timeSub.body.id}`)
      .set('Authorization', `Bearer ${loginB.body.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/plans/${monthly.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    const archivedPlan = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: member.body.id, planId: monthly.body.id })
      .expect(400);
    expect(archivedPlan.body.code).toBe(ErrorCode.PLAN_ARCHIVED);

    await request(app.getHttpServer())
      .patch(`/api/v1/members/${member.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    const archivedMember = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: member.body.id, planId: pack.body.id })
      .expect(400);
    expect(archivedMember.body.code).toBe(ErrorCode.MEMBER_ARCHIVED);
  });
});

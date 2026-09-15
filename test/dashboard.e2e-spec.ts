import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Dashboard (e2e)', () => {
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

  it('rejects /dashboard without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('returns gym-level counts and isolates tenants', async () => {
    if (!ready) {
      console.warn(
        'Skipping dashboard DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const password = 'Password1!';
    const slugA = `dash-a-${suffix}`;
    const slugB = `dash-b-${suffix}`;

    const gymA = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Dash Gym A',
        slug: slugA,
        firstBranch: { name: 'Maadi' },
        firstOwner: {
          name: 'Owner A',
          email: `owner-a-${suffix}@example.com`,
          password,
        },
      })
      .expect(201);

    const gymB = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Dash Gym B',
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
    const branchB = gymB.body.branches[0].id as string;

    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: slugA,
        email: `owner-a-${suffix}@example.com`,
        password,
      })
      .expect(201);
    const tokenA = loginA.body.accessToken as string;

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: slugB,
        email: `owner-b-${suffix}@example.com`,
        password,
      })
      .expect(201);
    const tokenB = loginB.body.accessToken as string;

    const memberA = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Ahmed Hassan',
        phone: '+201005550001',
        homeBranchId: branchA,
      })
      .expect(201);

    const archived = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Old Member',
        phone: '+201005550002',
        homeBranchId: branchA,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/members/${archived.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    const memberB = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Other Gym',
        phone: '+201005550099',
        homeBranchId: branchB,
      })
      .expect(201);

    const planA = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Gold 30',
        durationDays: 30,
        price: 1000,
      })
      .expect(201);

    const planB = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Silver 30',
        durationDays: 30,
        price: 900,
      })
      .expect(201);

    const subA = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: memberA.body.id, planId: planA.body.id })
      .expect(201);

    const subB = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ memberId: memberB.body.id, planId: planB.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: subA.body.id,
        branchId: branchA,
        method: 'CASH',
        amount: 400,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        subscriptionId: subB.body.id,
        branchId: branchB,
        method: 'CASH',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: memberA.body.id, branchId: branchA })
      .expect(201);

    const dashA = await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(dashA.body.timezone).toBe('Africa/Cairo');
    expect(dashA.body.currency).toBe('EGP');
    expect(dashA.body.from).toEqual(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(dashA.body.to).toBe(dashA.body.from);
    expect(dashA.body.members).toEqual({
      active: 1,
      archived: 1,
      joined: 2,
    });
    expect(dashA.body.subscriptions).toEqual({
      active: 1,
      frozen: 0,
      inGrace: 0,
      expired: 0,
      cancelled: 0,
      endingSoon: 0,
      completedUnrenewed: 0,
    });
    expect(dashA.body.checkIns.total).toBe(1);
    expect(dashA.body.checkIns.uniqueMembers).toBe(1);
    expect(dashA.body.checkIns.byBranch).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: branchA, name: 'Maadi', count: 1 }),
      ]),
    );
    expect(dashA.body.collected).toEqual({
      amount: 400,
      count: 1,
      cash: 400,
      card: 0,
    });
    expect(dashA.body.due).toEqual({ amount: 600, count: 1 });

    const emptyRange = await request(app.getHttpServer())
      .get('/api/v1/dashboard?from=2020-01-01&to=2020-01-02')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(emptyRange.body.from).toBe('2020-01-01');
    expect(emptyRange.body.to).toBe('2020-01-02');
    expect(emptyRange.body.members.active).toBe(1);
    expect(emptyRange.body.checkIns.total).toBe(0);
    expect(emptyRange.body.collected.amount).toBe(0);
    expect(emptyRange.body.due).toEqual({ amount: 600, count: 1 });

    const badRange = await request(app.getHttpServer())
      .get('/api/v1/dashboard?from=2026-09-15&to=2026-09-01')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(400);
    expect(badRange.body.code).toBe(ErrorCode.DATE_RANGE_INVALID);

    const dashB = await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(dashB.body.members.active).toBe(1);
    expect(dashB.body.members.archived).toBe(0);
    expect(dashB.body.subscriptions.active).toBe(1);
    expect(dashB.body.subscriptions.completedUnrenewed).toBe(0);
    expect(dashB.body.checkIns.total).toBe(0);
    expect(dashB.body.collected.amount).toBe(900);
    expect(dashB.body.due).toEqual({ amount: 0, count: 0 });

    await prisma.withTenant(gymA.body.id as string, (tx) =>
      tx.subscription.update({
        where: { id: subA.body.id },
        data: {
          status: 'EXPIRED',
          expiredAt: new Date(),
          endsAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      }),
    );

    const afterExpire = await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(afterExpire.body.subscriptions.expired).toBe(1);
    expect(afterExpire.body.subscriptions.active).toBe(0);
    expect(afterExpire.body.subscriptions.completedUnrenewed).toBe(1);
  });
});

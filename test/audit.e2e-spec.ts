import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Audit (e2e)', () => {
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

  it('rejects /audit without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('records writes per gym and hides them from other tenants', async () => {
    if (!ready) {
      console.warn(
        'Skipping audit DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const password = 'Password1!';
    const slugA = `aud-a-${suffix}`;
    const slugB = `aud-b-${suffix}`;

    const gymA = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Audit Gym A',
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
        name: 'Audit Gym B',
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
        phone: '+201007770001',
        homeBranchId: branchA,
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

    const subA = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: memberA.body.id, planId: planA.body.id })
      .expect(201);

    const payment = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: subA.body.id,
        branchId: branchA,
        method: 'CASH',
        amount: 400,
      })
      .expect(201);

    const desk = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Desk',
        email: `desk-${suffix}@example.com`,
        password,
        role: 'BRANCH_STAFF',
        branchId: branchA,
      })
      .expect(201);

    const loginDesk = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: slugA,
        email: `desk-${suffix}@example.com`,
        password,
      })
      .expect(201);

    const forbidden = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${loginDesk.body.accessToken}`)
      .expect(403);
    expect(forbidden.body.code).toBe(ErrorCode.FORBIDDEN);

    const log = await request(app.getHttpServer())
      .get('/api/v1/audit?action=PAYMENT_CREATED')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(log.body.total).toBe(1);
    expect(log.body.data[0].action).toBe('PAYMENT_CREATED');
    expect(log.body.data[0].entityId).toBe(payment.body.id);
    expect(log.body.data[0].staff.id).toBe(loginA.body.staff.id);
    expect(log.body.data[0]).not.toHaveProperty('userAgent');

    const logins = await request(app.getHttpServer())
      .get('/api/v1/audit?action=LOGIN')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(logins.body.total).toBeGreaterThanOrEqual(2);

    const isolated = await request(app.getHttpServer())
      .get('/api/v1/audit?action=PAYMENT_CREATED')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(isolated.body.total).toBe(0);

    const created = await request(app.getHttpServer())
      .get('/api/v1/audit?action=STAFF_CREATED')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(created.body.data[0].entityId).toBe(desk.body.id);
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Reports (e2e)', () => {
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

  it('rejects /reports/members without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/members')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('exports CSV for members, payments, and check-ins, isolated by tenant', async () => {
    if (!ready) {
      console.warn(
        'Skipping reports DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const password = 'Password1!';
    const slugA = `rep-a-${suffix}`;
    const slugB = `rep-b-${suffix}`;

    const gymA = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Report Gym A',
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
        name: 'Report Gym B',
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
        phone: '+201006660001',
        homeBranchId: branchA,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Other Gym',
        phone: '+201006660099',
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

    const subA = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: memberA.body.id, planId: planA.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: subA.body.id,
        branchId: branchA,
        method: 'CASH',
        amount: 400,
        notes: 'Partial, desk',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: memberA.body.id, branchId: branchA })
      .expect(201);

    const membersCsv = await request(app.getHttpServer())
      .get('/api/v1/reports/members')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(membersCsv.headers['content-type']).toMatch(/text\/csv/);
    expect(membersCsv.headers['content-disposition']).toMatch(
      /attachment; filename="members-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(membersCsv.text.startsWith('\uFEFF')).toBe(true);
    expect(membersCsv.text).toContain(
      'member,code,phone,email,status,homeBranch,plans',
    );
    expect(membersCsv.text).toContain('Ahmed Hassan');
    expect(membersCsv.text).toContain('+201006660001');
    expect(membersCsv.text).toContain('Gold 30');
    expect(membersCsv.text).not.toContain(memberA.body.id);
    expect(membersCsv.text).not.toContain('Other Gym');

    const paymentsCsv = await request(app.getHttpServer())
      .get('/api/v1/reports/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(paymentsCsv.headers['content-type']).toMatch(/text\/csv/);
    expect(paymentsCsv.text).toContain('member,memberPhone,plan');
    expect(paymentsCsv.text).toContain('Ahmed Hassan');
    expect(paymentsCsv.text).toContain('400');
    expect(paymentsCsv.text).toContain('CASH');
    expect(paymentsCsv.text).toContain('Gold 30');
    expect(paymentsCsv.text).toContain('"Partial, desk"');
    expect(paymentsCsv.text).not.toContain(subA.body.id);
    expect(paymentsCsv.text).not.toContain('Other Gym');

    const emptyPayments = await request(app.getHttpServer())
      .get('/api/v1/reports/payments?from=2020-01-01&to=2020-01-02')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(emptyPayments.text).not.toContain('400');
    expect(emptyPayments.headers['content-disposition']).toContain(
      'payments-2020-01-01_2020-01-02.csv',
    );

    const checkInsCsv = await request(app.getHttpServer())
      .get('/api/v1/reports/checkIns')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(checkInsCsv.text).toContain('member,memberPhone,plan');
    expect(checkInsCsv.text).toContain('Ahmed Hassan');
    expect(checkInsCsv.text).toContain('Maadi');
    expect(checkInsCsv.text).toContain('Gold 30');
    expect(checkInsCsv.text).not.toContain(subA.body.id);

    const subscriptionsCsv = await request(app.getHttpServer())
      .get('/api/v1/reports/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(subscriptionsCsv.headers['content-type']).toMatch(/text\/csv/);
    expect(subscriptionsCsv.headers['content-disposition']).toMatch(
      /attachment; filename="subscriptions-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(subscriptionsCsv.text).toContain(
      'member,memberPhone,memberStatus,plan',
    );
    expect(subscriptionsCsv.text).toContain('Gold 30');
    expect(subscriptionsCsv.text).toContain('Ahmed Hassan');
    expect(subscriptionsCsv.text).toContain('Owner A');
    expect(subscriptionsCsv.text).toContain('1000');
    expect(subscriptionsCsv.text).toContain('600');
    expect(subscriptionsCsv.text).not.toContain(subA.body.id);
    expect(subscriptionsCsv.text).not.toContain('Other Gym');

    const unpaidSubs = await request(app.getHttpServer())
      .get('/api/v1/reports/subscriptions?unpaid=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(unpaidSubs.text).toContain('Gold 30');
    expect(unpaidSubs.text).toContain('Ahmed Hassan');

    const badRange = await request(app.getHttpServer())
      .get('/api/v1/reports/payments?from=2026-09-15&to=2026-09-01')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(400);
    expect(badRange.body.code).toBe(ErrorCode.DATE_RANGE_INVALID);

    const membersB = await request(app.getHttpServer())
      .get('/api/v1/reports/members')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(membersB.text).toContain('Other Gym');
    expect(membersB.text).not.toContain('Ahmed Hassan');

    const subsB = await request(app.getHttpServer())
      .get('/api/v1/reports/subscriptions')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(subsB.text).not.toContain('Ahmed Hassan');
    expect(subsB.text).not.toContain('Gold 30');
  });
});

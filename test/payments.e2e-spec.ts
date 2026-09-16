import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Payments (e2e)', () => {
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

  it('rejects /payments without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/payments')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('records desk payments, installments, and isolates gyms', async () => {
    if (!ready) {
      console.warn(
        'Skipping payment DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const password = 'Password1!';
    const slugA = `pay-a-${suffix}`;
    const slugB = `pay-b-${suffix}`;

    const gymA = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Pay Gym A',
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
        name: 'Pay Gym B',
        slug: slugB,
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
    const branchB = gymB.body.branches[0].id as string;

    const secondA = await request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${tenantA}/branches`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({ name: 'Heliopolis' })
      .expect(201);

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
        phone: '+201004440001',
        homeBranchId: branchA,
      })
      .expect(201);

    const memberB = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Sara Ali',
        phone: '+201004440002',
        homeBranchId: branchB,
      })
      .expect(201);

    const gold = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Gold 30',
        durationDays: 30,
        sessionCount: 8,
        price: 1500,
      })
      .expect(201);

    const free = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Comp pass',
        durationDays: 7,
        price: 0,
      })
      .expect(201);

    const otherGymPlan = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Silver 30',
        durationDays: 30,
        price: 900,
      })
      .expect(201);

    const paid = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: memberA.body.id, planId: gold.body.id })
      .expect(201);

    const unpaidDoor = await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: memberA.body.id, branchId: branchA })
      .expect(201);
    expect(unpaidDoor.body.status).toBe('ACTIVE');

    const first = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: paid.body.id,
        branchId: branchA,
        method: 'CASH',
        amount: 500,
        notes: 'deposit',
      })
      .expect(201);
    expect(first.body.amount).toBe(500);
    expect(first.body.currency).toBe('EGP');
    expect(first.body.member.id).toBe(memberA.body.id);
    expect(first.body.price).toBe(1500);
    expect(first.body.paidTotal).toBe(500);
    expect(first.body.dueAmount).toBe(1000);
    expect(first.body.method).toBe('CASH');
    expect(first.body.member).toEqual({
      id: memberA.body.id,
      name: 'Ahmed Hassan',
      phone: '+201004440001',
      status: 'ACTIVE',
    });
    expect(first.body.branch).toEqual({ id: branchA, name: 'Maadi' });
    expect(first.body.staff).toEqual({
      id: loginA.body.staff.id,
      name: 'Owner A',
      role: 'TENANT_OWNER',
    });
    expect(first.body.staff.password).toBeUndefined();
    expect(first.body.subscription).toEqual(
      expect.objectContaining({
        id: paid.body.id,
        planName: 'Gold 30',
        status: 'ACTIVE',
        durationDays: 30,
        sessionCount: 8,
      }),
    );
    expect(first.body.subscription.plan).toEqual({
      id: gold.body.id,
      name: 'Gold 30',
      status: 'ACTIVE',
    });

    const overpay = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: paid.body.id,
        branchId: branchA,
        method: 'CARD',
        amount: 1000.01,
      })
      .expect(400);
    expect(overpay.body.code).toBe(ErrorCode.PAYMENT_EXCEEDS_DUE);

    const remainder = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: paid.body.id,
        branchId: branchA,
        method: 'CARD',
      })
      .expect(201);
    expect(remainder.body.amount).toBe(1000);
    expect(remainder.body.paidTotal).toBe(1500);
    expect(remainder.body.dueAmount).toBe(0);

    const settled = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: paid.body.id,
        branchId: branchA,
        method: 'CASH',
        amount: 1,
      })
      .expect(400);
    expect(settled.body.code).toBe(ErrorCode.PAYMENT_ALREADY_SETTLED);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/payments?subscriptionId=${paid.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(listed.body.total).toBe(2);
    expect(listed.body.data[0].dueAmount).toBe(0);
    expect(listed.body.data[0].member.name).toBe('Ahmed Hassan');
    expect(listed.body.data[0].subscription.plan.name).toBe('Gold 30');

    const fetched = await request(app.getHttpServer())
      .get(`/api/v1/payments/${first.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(fetched.body.id).toBe(first.body.id);
    expect(fetched.body.paidTotal).toBe(1500);

    const receipt = await request(app.getHttpServer())
      .get(`/api/v1/payments/${first.body.id}/receipt`)
      .set('Authorization', `Bearer ${tokenA}`)
      .buffer(true)
      .parse((res, fn) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(receipt.headers['content-type']).toMatch(/application\/pdf/);
    expect(receipt.headers['content-disposition']).toMatch(
      /attachment; filename="receipt-Ahmed-Hassan-\d{4}-\d{2}-\d{2}\.pdf"/,
    );
    const receiptText = Buffer.isBuffer(receipt.body)
      ? receipt.body.toString('latin1')
      : String(receipt.body);
    expect(receiptText.startsWith('%PDF-')).toBe(true);
    expect(receiptText).toContain('Cairo-Regular');

    const missing = await request(app.getHttpServer())
      .get(`/api/v1/payments/${first.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    expect(missing.body.code).toBe(ErrorCode.PAYMENT_NOT_FOUND);

    const missingReceipt = await request(app.getHttpServer())
      .get(`/api/v1/payments/${first.body.id}/receipt`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    expect(missingReceipt.body.code).toBe(ErrorCode.PAYMENT_NOT_FOUND);
    expect(missingReceipt.headers['content-type']).not.toMatch(/pdf/);

    const otherSub = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ memberId: memberB.body.id, planId: otherGymPlan.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        subscriptionId: otherSub.body.id,
        branchId: branchB,
        method: 'CASH',
      })
      .expect(201);

    const gymAList = await request(app.getHttpServer())
      .get('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(
      gymAList.body.data.every(
        (row: { member: { id: string } }) => row.member.id === memberA.body.id,
      ),
    ).toBe(true);
    expect(
      gymAList.body.data.some(
        (row: { subscription: { id: string } }) =>
          row.subscription.id === otherSub.body.id,
      ),
    ).toBe(false);

    const comp = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: memberA.body.id, planId: free.body.id })
      .expect(201);

    const notDue = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: comp.body.id,
        branchId: branchA,
        method: 'CASH',
        amount: 10,
      })
      .expect(400);
    expect(notDue.body.code).toBe(ErrorCode.PAYMENT_NOT_DUE);

    const desk = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Desk Staff',
        email: `desk-${suffix}@example.com`,
        password: 'DeskPass1!',
        role: 'BRANCH_STAFF',
        branchId: branchA,
      })
      .expect(201);
    expect(desk.body.branchId).toBe(branchA);

    const deskLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: slugA,
        email: `desk-${suffix}@example.com`,
        password: 'DeskPass1!',
      })
      .expect(201);

    const extraPlan = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'PT 4',
        durationDays: 30,
        sessionCount: 4,
        price: 400,
      })
      .expect(201);

    const extraSub = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: memberA.body.id, planId: extraPlan.body.id })
      .expect(201);

    const wrongBranch = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${deskLogin.body.accessToken}`)
      .send({
        subscriptionId: extraSub.body.id,
        branchId: secondA.body.id,
        method: 'CASH',
      })
      .expect(403);
    expect(wrongBranch.body.code).toBe(ErrorCode.BRANCH_NOT_ALLOWED);

    const deskPay = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${deskLogin.body.accessToken}`)
      .send({
        subscriptionId: extraSub.body.id,
        branchId: branchA,
        method: 'CASH',
        amount: 100,
      })
      .expect(201);
    expect(deskPay.body.staff.id).toBe(desk.body.id);
    expect(deskPay.body.dueAmount).toBe(300);

    const byGoldPlan = await request(app.getHttpServer())
      .get(`/api/v1/payments?planId=${gold.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(byGoldPlan.body.total).toBe(2);
    expect(
      byGoldPlan.body.data.every(
        (row: { subscription: { plan: { id: string } } }) =>
          row.subscription.plan.id === gold.body.id,
      ),
    ).toBe(true);

    const byExtraPlan = await request(app.getHttpServer())
      .get(`/api/v1/payments?planId=${extraPlan.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(byExtraPlan.body.total).toBe(1);
    expect(byExtraPlan.body.data[0].id).toBe(deskPay.body.id);

    await prisma.withTenant(tenantA, (tx) =>
      tx.subscription.update({
        where: { id: extraSub.body.id },
        data: { status: 'CANCELLED' },
      }),
    );

    const cancelled = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: extraSub.body.id,
        branchId: branchA,
        method: 'CASH',
        amount: 50,
      })
      .expect(400);
    expect(cancelled.body.code).toBe(ErrorCode.SUBSCRIPTION_NOT_ACTIVE);

    const laterPlan = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Drop-in',
        durationDays: 1,
        price: 50,
      })
      .expect(201);

    const laterSub = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: memberA.body.id, planId: laterPlan.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/members/${memberA.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    const archived = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: laterSub.body.id,
        branchId: branchA,
        method: 'CASH',
      })
      .expect(400);
    expect(archived.body.code).toBe(ErrorCode.MEMBER_ARCHIVED);
  });
});

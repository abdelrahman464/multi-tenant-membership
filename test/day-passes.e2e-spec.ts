import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Day passes (e2e)', () => {
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

  it('rejects /dayPasses without a token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/dayPasses')
      .send({ planId: '00000000-0000-4000-8000-000000000001' })
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('sells a walk-in on a day-pass plan', async () => {
    if (!ready) {
      console.warn(
        'Skipping day-pass DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const slug = `day-${suffix}`;
    const password = 'Password1!';

    const gym = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Day Pass Gym',
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

    const monthly = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Gold 30',
        durationDays: 30,
        price: 1500,
      })
      .expect(201);

    const dayPlan = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Walk-in',
        kind: 'DAY_PASS',
        price: 150,
      })
      .expect(201);

    const notDayPass = await request(app.getHttpServer())
      .post('/api/v1/dayPasses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        planId: monthly.body.id,
        branchId,
        name: 'Guest One',
        phone: '+201004440099',
        method: 'CASH',
      })
      .expect(400);
    expect(notDayPass.body.code).toBe(ErrorCode.PLAN_NOT_DAY_PASS);

    await request(app.getHttpServer())
      .post('/api/v1/dayPasses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        planId: dayPlan.body.id,
        branchId,
        method: 'CASH',
      })
      .expect(400);

    const sold = await request(app.getHttpServer())
      .post('/api/v1/dayPasses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        planId: dayPlan.body.id,
        branchId,
        name: 'Walk In Guest',
        phone: '+20 100 444 0001',
        method: 'CASH',
      })
      .expect(201);

    expect(sold.body.memberCreated).toBe(true);
    expect(sold.body.member.phone).toBe('+201004440001');
    expect(sold.body.member.lastCheckedInAt).toEqual(expect.any(String));
    expect(sold.body.subscription.kind).toBe('DAY_PASS');
    expect(sold.body.subscription.durationDays).toBe(1);
    expect(sold.body.subscription.sessionCount).toBe(1);
    expect(sold.body.subscription.sessionsRemaining).toBe(0);
    expect(sold.body.subscription.inGrace).toBe(false);
    expect(sold.body.payment.amount).toBe(150);
    expect(sold.body.checkIn.subscriptionId).toBe(sold.body.subscription.id);
    expect(sold.body.checkIn.visitsToday).toBe(1);

    const soldAudit = await request(app.getHttpServer())
      .get(
        `/api/v1/audit?action=DAY_PASS_SOLD&entityId=${sold.body.subscription.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(soldAudit.body.data[0].metadata).toEqual({
      memberId: sold.body.member.id,
      paymentId: sold.body.payment.id,
      checkInId: sold.body.checkIn.id,
      memberCreated: 'true',
    });

    const freeze = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${sold.body.subscription.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .send({ days: 1 })
      .expect(400);
    expect(freeze.body.code).toBe(ErrorCode.DAY_PASS_NO_FREEZE);

    const endingSoon = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?endingSoon=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(endingSoon.body.total).toBe(0);

    const completed = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?completedUnrenewed=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(completed.body.total).toBe(0);

    const byKind = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?kind=DAY_PASS')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byKind.body.total).toBe(1);

    const dayPassCsv = await request(app.getHttpServer())
      .get('/api/v1/reports/subscriptions?kind=DAY_PASS')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dayPassCsv.text).toContain('Walk-in');
    expect(dayPassCsv.text).toContain('DAY_PASS');
    expect(dayPassCsv.text).toContain('Walk In Guest');
    expect(dayPassCsv.text).not.toContain('MEMBERSHIP');

    const membershipCsv = await request(app.getHttpServer())
      .get('/api/v1/reports/subscriptions?kind=MEMBERSHIP')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(membershipCsv.text).not.toContain('Walk-in');

    const again = await request(app.getHttpServer())
      .post('/api/v1/dayPasses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        planId: dayPlan.body.id,
        branchId,
        name: 'Walk In Guest',
        phone: '+201004440001',
        method: 'CASH',
        checkIn: false,
      })
      .expect(201);
    expect(again.body.memberCreated).toBe(false);
    expect(again.body.member.id).toBe(sold.body.member.id);
    expect(again.body.checkIn).toBeNull();
    expect(again.body.subscription.sessionsRemaining).toBe(1);

    const laterAudit = await request(app.getHttpServer())
      .get(
        `/api/v1/audit?action=DAY_PASS_SOLD&entityId=${again.body.subscription.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(laterAudit.body.data[0].metadata).toEqual({
      memberId: again.body.member.id,
      paymentId: again.body.payment.id,
      memberCreated: 'false',
    });

    const laterDoor = await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: again.body.member.id,
        branchId,
        subscriptionId: again.body.subscription.id,
      })
      .expect(201);
    expect(laterDoor.body.sessionsRemaining).toBe(0);

    const blocked = await request(app.getHttpServer())
      .patch(`/api/v1/members/${sold.body.member.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'BLOCKED' })
      .expect(200);
    expect(blocked.body.status).toBe('BLOCKED');

    const blockedSale = await request(app.getHttpServer())
      .post('/api/v1/dayPasses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        planId: dayPlan.body.id,
        branchId,
        memberId: sold.body.member.id,
        method: 'CASH',
      })
      .expect(400);
    expect(blockedSale.body.code).toBe(ErrorCode.MEMBER_BLOCKED);

    await request(app.getHttpServer())
      .patch(`/api/v1/members/${sold.body.member.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ requirePaymentForAccess: true, minPaidPercentForAccess: 100 })
      .expect(200);

    const unpaidDoor = await request(app.getHttpServer())
      .post('/api/v1/dayPasses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        planId: dayPlan.body.id,
        branchId,
        memberId: sold.body.member.id,
      })
      .expect(400);
    expect(unpaidDoor.body.code).toBe(ErrorCode.CHECKIN_PAYMENT_REQUIRED);

    const afterFail = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?kind=DAY_PASS')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterFail.body.total).toBe(2);

    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${branchId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        hours: {
          sunday: null,
          monday: null,
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: null,
        },
      })
      .expect(200);

    const closed = await request(app.getHttpServer())
      .post('/api/v1/dayPasses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        planId: dayPlan.body.id,
        branchId,
        memberId: sold.body.member.id,
        method: 'CASH',
      })
      .expect(400);
    expect(closed.body.code).toBe(ErrorCode.BRANCH_CLOSED);

    const stillTwo = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?kind=DAY_PASS')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(stillTwo.body.total).toBe(2);
  });
});

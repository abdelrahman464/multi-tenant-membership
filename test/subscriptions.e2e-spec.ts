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
    expect(timeSub.body.member).toEqual({
      id: member.body.id,
      name: 'Ahmed Hassan',
      phone: '+201009998887',
      status: 'ACTIVE',
    });
    expect(timeSub.body.plan).toEqual({
      id: monthly.body.id,
      name: 'Gold 30',
      status: 'ACTIVE',
    });
    expect(timeSub.body.branches).toEqual([{ id: branchA, name: 'Maadi' }]);
    expect(timeSub.body.staff).toEqual({
      id: loginA.body.staff.id,
      name: 'Owner A',
      role: 'TENANT_OWNER',
    });
    expect(timeSub.body.staff.password).toBeUndefined();
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
    expect(listed.body.data[0].member.name).toBe('Ahmed Hassan');
    expect(listed.body.data[0].plan.name).toEqual(expect.any(String));
    expect(listed.body.data[0].branches[0]).toEqual(
      expect.objectContaining({ id: branchA, name: 'Maadi' }),
    );
    expect(listed.body.data[0].dueAmount).toBeGreaterThan(0);

    const soldByOwner = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions?soldByStaffId=${loginA.body.staff.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(soldByOwner.body.total).toBe(2);

    const unpaid = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?unpaid=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(unpaid.body.total).toBe(2);
    expect(
      unpaid.body.data.every((row: { dueAmount: number }) => row.dueAmount > 0),
    ).toBe(true);

    const inProgress = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?inProgress=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(inProgress.body.total).toBe(2);

    const completedNone = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?completedUnrenewed=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(completedNone.body.total).toBe(0);

    const expiredNone = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?expired=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(expiredNone.body.total).toBe(0);

    const endingNone = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?endingSoon=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(endingNone.body.total).toBe(0);

    await prisma.withTenant(gymA.body.id as string, (tx) =>
      tx.subscription.update({
        where: { id: timeSub.body.id },
        data: {
          status: 'EXPIRED',
          expiredAt: new Date(),
          endsAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      }),
    );

    const completed = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?completedUnrenewed=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(completed.body.total).toBe(1);
    expect(completed.body.data[0].id).toBe(timeSub.body.id);

    const expired = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?expired=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(expired.body.total).toBe(1);
    expect(expired.body.data[0].id).toBe(timeSub.body.id);
    expect(expired.body.data[0].status).toBe('EXPIRED');

    const stillGoing = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?inProgress=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(stillGoing.body.total).toBe(1);
    expect(stillGoing.body.data[0].id).toBe(packSub.body.id);

    await prisma.withTenant(gymA.body.id as string, (tx) =>
      tx.subscription.update({
        where: { id: packSub.body.id },
        data: { endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
      }),
    );

    const endingSoon = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?endingSoon=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(endingSoon.body.total).toBe(1);
    expect(endingSoon.body.data[0].id).toBe(packSub.body.id);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${gymA.body.id}/branches`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({ name: 'Heliopolis' })
      .expect(201);

    const allLocations = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${timeSub.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(allLocations.body.allBranches).toBe(true);
    expect(allLocations.body.branches).toEqual([
      { id: second.body.id, name: 'Heliopolis' },
      { id: branchA, name: 'Maadi' },
    ]);

    const selected = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Maadi only',
        durationDays: 30,
        sessionCount: 4,
        price: 800,
        allBranches: false,
        branchIds: [branchA],
      })
      .expect(201);

    const selectedSub = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ memberId: member.body.id, planId: selected.body.id })
      .expect(201);
    expect(selectedSub.body.allBranches).toBe(false);
    expect(selectedSub.body.branches).toEqual([{ id: branchA, name: 'Maadi' }]);

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

    const deskLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: slugA,
        email: `desk-${suffix}@example.com`,
        password: 'DeskPass1!',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${selectedSub.body.id}/cancel`)
      .set('Authorization', `Bearer ${deskLogin.body.accessToken}`)
      .send({ reason: 'Member asked to stop' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${selectedSub.body.id}/cancel`)
      .set('Authorization', `Bearer ${loginB.body.accessToken}`)
      .send({ reason: 'Member asked to stop' })
      .expect(404);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${packSub.body.id}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reason: 'Sold the wrong pack' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.cancelReason).toBe('Sold the wrong pack');
    expect(cancelled.body.cancelledAt).toEqual(expect.any(String));
    expect(cancelled.body.cancelledBy).toEqual(
      expect.objectContaining({
        id: loginA.body.staff.id,
        name: 'Owner A',
        role: 'TENANT_OWNER',
      }),
    );
    expect(cancelled.body.staff.id).toBe(loginA.body.staff.id);

    const cancelledList = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?status=CANCELLED')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(cancelledList.body.total).toBe(1);
    expect(cancelledList.body.data[0].id).toBe(packSub.body.id);

    const cancelledByOwner = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions?cancelledByStaffId=${loginA.body.staff.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(cancelledByOwner.body.total).toBe(1);
    expect(cancelledByOwner.body.data[0].id).toBe(packSub.body.id);

    const payCancelled = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        subscriptionId: packSub.body.id,
        branchId: branchA,
        method: 'CASH',
      })
      .expect(400);
    expect(payCancelled.body.code).toBe(ErrorCode.SUBSCRIPTION_NOT_ACTIVE);

    const checkInCancelled = await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        memberId: member.body.id,
        branchId: branchA,
        subscriptionId: packSub.body.id,
      })
      .expect(400);
    expect(checkInCancelled.body.code).toBe(ErrorCode.SUBSCRIPTION_NOT_ACTIVE);

    const alreadyCancelled = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${packSub.body.id}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reason: 'Sold the wrong pack' })
      .expect(400);
    expect(alreadyCancelled.body.code).toBe(
      ErrorCode.SUBSCRIPTION_ALREADY_CANCELLED,
    );

    const cancelExpired = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${timeSub.body.id}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reason: 'Member quit' })
      .expect(400);
    expect(cancelExpired.body.code).toBe(ErrorCode.SUBSCRIPTION_NOT_ACTIVE);

    await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        freezeEnabled: true,
        maxFreezeDays: 14,
        maxFreezeDaysPerYear: 20,
      })
      .expect(200);

    const frozen = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${selectedSub.body.id}/freeze`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ days: 7 })
      .expect(201);
    expect(frozen.body.status).toBe('FROZEN');

    const cancelFrozen = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${selectedSub.body.id}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reason: 'Injury, stopping the plan' })
      .expect(200);
    expect(cancelFrozen.body.status).toBe('CANCELLED');
    expect(cancelFrozen.body.frozenAt).toBeNull();
    expect(cancelFrozen.body.freezeEndsAt).toBeNull();

    const stillGoingAfterCancel = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?inProgress=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(stillGoingAfterCancel.body.total).toBe(0);

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

    const unpaidAfterArchive = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?unpaid=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(unpaidAfterArchive.body.total).toBe(0);
  });
});

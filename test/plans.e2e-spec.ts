import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Plans (e2e)', () => {
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

  it('rejects /plans without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/plans')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('creates, lists, and isolates plans by tenant', async () => {
    if (!ready) {
      console.warn(
        'Skipping plan DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const slugA = `plan-a-${suffix}`;
    const slugB = `plan-b-${suffix}`;
    const password = 'Password1!';

    const gymA = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Plans A',
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
        name: 'Plans B',
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

    const secondA = await request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${gymA.body.id}/branches`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({ name: 'Zamalek' })
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

    await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Broken', sessionCount: 8, price: 100 })
      .expect(400);

    const allWithBranches = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Gold Monthly',
        durationDays: 30,
        price: 1500,
        allBranches: true,
        branchIds: [branchA],
      })
      .expect(400);
    expect(allWithBranches.body.code).toBe(ErrorCode.BRANCH_NOT_ALLOWED);

    const monthly = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Gold Monthly',
        durationDays: 30,
        price: 1500,
      })
      .expect(201);

    expect(monthly.body.name).toBe('Gold Monthly');
    expect(monthly.body.durationDays).toBe(30);
    expect(monthly.body.sessionCount).toBeNull();
    expect(monthly.body.maxVisitsPerDay).toBe(1);
    expect(monthly.body.price).toBe(1500);
    expect(monthly.body.currency).toBe('EGP');
    expect(monthly.body.allBranches).toBe(true);
    expect(monthly.body.branches).toEqual([]);
    expect(monthly.body.tenantId).toBe(gymA.body.id);
    expect(monthly.body.status).toBe('ACTIVE');

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Gold Monthly',
        durationDays: 30,
        price: 1500,
      })
      .expect(409);
    expect(duplicate.body.code).toBe(ErrorCode.PLAN_NAME_TAKEN);

    const pack = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: '12 Sessions Maadi',
        durationDays: 30,
        sessionCount: 12,
        maxVisitsPerDay: 2,
        price: 800.5,
        allBranches: false,
        branchIds: [branchA, secondA.body.id],
      })
      .expect(201);

    expect(pack.body.allBranches).toBe(false);
    expect(pack.body.durationDays).toBe(30);
    expect(pack.body.sessionCount).toBe(12);
    expect(pack.body.maxVisitsPerDay).toBe(2);
    expect(pack.body.price).toBe(800.5);
    expect(pack.body.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: branchA, name: 'Maadi' }),
        expect.objectContaining({ id: secondA.body.id, name: 'Zamalek' }),
      ]),
    );
    expect(pack.body.branches).toHaveLength(2);

    const heliopolis = await request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${gymA.body.id}/branches`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({ name: 'Heliopolis' })
      .expect(201);

    const atMaadi = await request(app.getHttpServer())
      .get(`/api/v1/plans?branchId=${branchA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(atMaadi.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: monthly.body.id }),
        expect.objectContaining({ id: pack.body.id }),
      ]),
    );

    const atHeliopolis = await request(app.getHttpServer())
      .get(`/api/v1/plans?branchId=${heliopolis.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(atHeliopolis.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: monthly.body.id }),
      ]),
    );
    expect(atHeliopolis.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: pack.body.id })]),
    );

    const otherBranchFilter = await request(app.getHttpServer())
      .get(`/api/v1/plans?branchId=${branchB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    expect(otherBranchFilter.body.code).toBe(ErrorCode.BRANCH_NOT_FOUND);

    const otherGymBranch = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Sneaky',
        durationDays: 30,
        price: 100,
        allBranches: false,
        branchIds: [branchB],
      })
      .expect(404);
    expect(otherGymBranch.body.code).toBe(ErrorCode.BRANCH_NOT_FOUND);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/plans?search=Gold&status=ACTIVE&page=1&limit=10')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(listed.body.total).toBeGreaterThanOrEqual(1);
    expect(listed.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: monthly.body.id, name: 'Gold Monthly' }),
      ]),
    );

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: slugB,
        email: `owner-b-${suffix}@example.com`,
        password,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/plans/${monthly.body.id}`)
      .set('Authorization', `Bearer ${loginB.body.accessToken}`)
      .expect(404);

    const desk = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Desk',
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
        email: desk.body.email,
        password: 'DeskPass1!',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/plans')
      .set('Authorization', `Bearer ${deskLogin.body.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${deskLogin.body.accessToken}`)
      .send({ name: 'Nope', durationDays: 30, price: 1 })
      .expect(403);

    const archived = await request(app.getHttpServer())
      .patch(`/api/v1/plans/${monthly.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    expect(archived.body.status).toBe('ARCHIVED');
    expect(archived.body.allBranches).toBe(true);

    const switched = await request(app.getHttpServer())
      .patch(`/api/v1/plans/${monthly.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        allBranches: false,
        branchIds: [branchA],
      })
      .expect(200);

    expect(switched.body.allBranches).toBe(false);
    expect(switched.body.branches).toEqual([
      expect.objectContaining({ id: branchA, name: 'Maadi' }),
    ]);
  });
});

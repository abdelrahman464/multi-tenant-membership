import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Members (e2e)', () => {
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

  it('rejects /members without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/members')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('creates, lists, and isolates members by tenant', async () => {
    if (!ready) {
      console.warn(
        'Skipping member DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const slugA = `mem-a-${suffix}`;
    const slugB = `mem-b-${suffix}`;
    const password = 'Password1!';

    const gymA = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Members A',
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
        name: 'Members B',
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

    await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Ahmed',
        phone: '01001234567',
        homeBranchId: branchA,
      })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Ahmed Hassan',
        phone: '+20 100 123 4567',
        homeBranchId: branchA,
      })
      .expect(201);

    expect(created.body.phone).toBe('+201001234567');
    expect(created.body.tenantId).toBe(gymA.body.id);
    expect(created.body.homeBranchId).toBe(branchA);
    expect(created.body.status).toBe('ACTIVE');

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Same Phone',
        phone: '+201001234567',
        homeBranchId: branchA,
      })
      .expect(409);

    expect(duplicate.body.code).toBe(ErrorCode.MEMBER_PHONE_TAKEN);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/members?search=Ahmed&page=1&limit=10')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(listed.body.total).toBeGreaterThanOrEqual(1);
    expect(listed.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.body.id,
          phone: '+201001234567',
        }),
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
      .get(`/api/v1/members/${created.body.id}`)
      .set('Authorization', `Bearer ${loginB.body.accessToken}`)
      .expect(404);

    const samePhoneOtherGym = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${loginB.body.accessToken}`)
      .send({
        name: 'Ahmed Other Gym',
        phone: '+201001234567',
        homeBranchId: gymB.body.branches[0].id,
      })
      .expect(201);

    expect(samePhoneOtherGym.body.tenantId).toBe(gymB.body.id);

    const archived = await request(app.getHttpServer())
      .patch(`/api/v1/members/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    expect(archived.body.status).toBe('ARCHIVED');
  });
});

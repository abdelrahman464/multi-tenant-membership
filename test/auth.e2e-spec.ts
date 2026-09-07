import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Staff auth (e2e)', () => {
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

  it('rejects /auth/me and /branches without a token', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);
    expect(me.body.code).toBe(ErrorCode.NO_TOKEN);

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .expect(401);
    expect(branches.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('logs in the first owner, issues JWT, and isolates staff by tenant', async () => {
    if (!ready) {
      console.warn(
        'Skipping auth DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const slug = `auth-gym-${suffix}`;
    const ownerEmail = `owner-${suffix}@example.com`;
    const password = 'Password1!';

    const created = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Auth Gym',
        slug,
        firstBranch: { name: 'Maadi' },
        firstOwner: {
          name: 'Owner One',
          email: ownerEmail,
          password,
        },
      })
      .expect(201);

    expect(created.body.staff).toHaveLength(1);
    expect(created.body.staff[0].email).toBe(ownerEmail);
    expect(created.body.staff[0].role).toBe('TENANT_OWNER');
    expect(created.body.staff[0].password).toBeUndefined();

    const branchId = created.body.branches[0].id as string;

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ slug, email: ownerEmail, password: 'wrong-pass' })
      .expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ slug, email: ownerEmail, password })
      .expect(201);

    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body.staff.role).toBe('TENANT_OWNER');
    expect(login.body.staff.tenantId).toBe(created.body.id);
    expect(login.body.staff.password).toBeUndefined();

    const accessToken = login.body.accessToken as string;
    const cookies = login.headers['set-cookie'];
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accessToken='),
        expect.stringContaining('refreshToken='),
      ]),
    );

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(me.body.email).toBe(ownerEmail);
    expect(me.body.tenantId).toBe(created.body.id);

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches?page=1&limit=10')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(branches.body.total).toBeGreaterThanOrEqual(1);
    expect(branches.body.page).toBe(1);
    expect(branches.body.limit).toBe(10);
    expect(branches.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: branchId,
          tenantId: created.body.id,
          name: 'Maadi',
        }),
      ]),
    );

    const desk = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Desk Staff',
        email: `desk-${suffix}@example.com`,
        password: 'DeskPass1!',
        role: 'BRANCH_STAFF',
        branchId,
      })
      .expect(201);

    expect(desk.body.role).toBe('BRANCH_STAFF');
    expect(desk.body.branchId).toBe(branchId);
    expect(desk.body.password).toBeUndefined();

    const deskLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: `desk-${suffix}@example.com`,
        password: 'DeskPass1!',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${deskLogin.body.accessToken}`)
      .send({
        name: 'Nope',
        email: `nope-${suffix}@example.com`,
        password: 'NopePass1!',
        role: 'BRANCH_STAFF',
        branchId,
      })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${deskLogin.body.accessToken}`)
      .expect(403);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .expect(201);

    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.staff.email).toBe(ownerEmail);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${created.body.id}/suspend`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .expect(200);

    const suspended = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ slug, email: ownerEmail, password })
      .expect(403);

    expect(suspended.body.code).toBe(ErrorCode.TENANT_SUSPENDED);
  });
});

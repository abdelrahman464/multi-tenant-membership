import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Staff (e2e)', () => {
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

  it('rejects /staff without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/staff')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('lets owner edit and archive desk staff, and locks the owner row', async () => {
    if (!ready) {
      console.warn(
        'Skipping staff DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const password = 'Password1!';
    const slug = `staff-${suffix}`;

    const gym = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Staff Gym',
        slug,
        firstBranch: { name: 'Maadi' },
        firstOwner: {
          name: 'Owner',
          email: `owner-${suffix}@example.com`,
          password,
        },
      })
      .expect(201);

    const tenantId = gym.body.id as string;
    const branchId = gym.body.branches[0].id as string;

    const second = await request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${tenantId}/branches`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({ name: 'Nasr City' })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: `owner-${suffix}@example.com`,
        password,
      })
      .expect(201);
    const token = login.body.accessToken as string;
    const ownerId = login.body.staff.id as string;

    const desk = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Desk Staff',
        email: `desk-${suffix}@example.com`,
        password: 'DeskPass1!',
        role: 'BRANCH_STAFF',
        branchId,
      })
      .expect(201);
    expect(desk.body.status).toBe('ACTIVE');
    expect(desk.body.password).toBeUndefined();

    const locked = await request(app.getHttpServer())
      .patch(`/api/v1/staff/${ownerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope' })
      .expect(403);
    expect(locked.body.code).toBe(ErrorCode.STAFF_OWNER_LOCKED);

    const renamed = await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Front Desk' })
      .expect(200);
    expect(renamed.body.name).toBe('Front Desk');
    expect(renamed.body.status).toBe('ACTIVE');

    const moved = await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: second.body.id })
      .expect(200);
    expect(moved.body.branch).toEqual({
      id: second.body.id,
      name: 'Nasr City',
    });

    const promoted = await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ADMIN', branchId: null })
      .expect(200);
    expect(promoted.body.role).toBe('ADMIN');
    expect(promoted.body.branchId).toBeNull();
    expect(promoted.body.branch).toBeNull();

    const demoted = await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'BRANCH_STAFF', branchId })
      .expect(200);
    expect(demoted.body.role).toBe('BRANCH_STAFF');
    expect(demoted.body.branchId).toBe(branchId);

    const reset = await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'NewDesk1!' })
      .expect(200);
    expect(reset.body.password).toBeUndefined();

    const oldPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: `desk-${suffix}@example.com`,
        password: 'DeskPass1!',
      })
      .expect(401);
    expect(oldPassword.body.code).toBe(ErrorCode.INVALID_CREDENTIALS);

    const deskLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: `desk-${suffix}@example.com`,
        password: 'NewDesk1!',
      })
      .expect(201);
    const deskToken = deskLogin.body.accessToken as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${deskToken}`)
      .send({ name: 'Self' })
      .expect(403);

    const archived = await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);
    expect(archived.body.status).toBe('ARCHIVED');

    const archivedLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: `desk-${suffix}@example.com`,
        password: 'NewDesk1!',
      })
      .expect(403);
    expect(archivedLogin.body.code).toBe(ErrorCode.STAFF_ARCHIVED);

    const deadToken = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${deskToken}`)
      .expect(403);
    expect(deadToken.body.code).toBe(ErrorCode.STAFF_ARCHIVED);

    const archivedList = await request(app.getHttpServer())
      .get('/api/v1/staff?status=ARCHIVED')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(archivedList.body.total).toBe(1);
    expect(archivedList.body.data[0].id).toBe(desk.body.id);

    const got = await request(app.getHttpServer())
      .get(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(got.body.status).toBe('ARCHIVED');

    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: `desk-${suffix}@example.com`,
        password: 'NewDesk1!',
      })
      .expect(201);

    const admin = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Admin',
        email: `admin-${suffix}@example.com`,
        password: 'AdminPass1!',
        role: 'ADMIN',
      })
      .expect(201);

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: `admin-${suffix}@example.com`,
        password: 'AdminPass1!',
      })
      .expect(201);

    const adminEditsAdmin = await request(app.getHttpServer())
      .patch(`/api/v1/staff/${admin.body.id}`)
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({ name: 'Nope' })
      .expect(403);
    expect(adminEditsAdmin.body.code).toBe(ErrorCode.FORBIDDEN);

    const adminRenamesDesk = await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({ name: 'Desk Two' })
      .expect(200);
    expect(adminRenamesDesk.body.name).toBe('Desk Two');
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Branches (e2e)', () => {
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

  it('rejects /branches without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .expect(401);
    expect(res.body.code).toBe(ErrorCode.NO_TOKEN);
  });

  it('lets owner create, rename, and archive locations', async () => {
    if (!ready) {
      console.warn(
        'Skipping branch DB tests: docker compose up -d postgres redis && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const password = 'Password1!';
    const slug = `branch-${suffix}`;

    const gym = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Branch Gym',
        slug,
        firstBranch: { name: 'Maadi' },
        firstOwner: {
          name: 'Owner',
          email: `owner-${suffix}@example.com`,
          password,
        },
      })
      .expect(201);

    const maadiId = gym.body.branches[0].id as string;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: `owner-${suffix}@example.com`,
        password,
      })
      .expect(201);
    const token = login.body.accessToken as string;

    const created = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nasr City' })
      .expect(201);
    expect(created.body.name).toBe('Nasr City');
    expect(created.body.status).toBe('ACTIVE');
    expect(created.body.tenantId).toBe(gym.body.id);

    const renamed = await request(app.getHttpServer())
      .patch(`/api/v1/branches/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Heliopolis' })
      .expect(200);
    expect(renamed.body.name).toBe('Heliopolis');

    const taken = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Heliopolis' })
      .expect(409);
    expect(taken.body.code).toBe(ErrorCode.BRANCH_NAME_TAKEN);

    const desk = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Desk Staff',
        email: `desk-${suffix}@example.com`,
        password: 'DeskPass1!',
        role: 'BRANCH_STAFF',
        branchId: created.body.id,
      })
      .expect(201);

    const blockedStaff = await request(app.getHttpServer())
      .patch(`/api/v1/branches/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ARCHIVED' })
      .expect(400);
    expect(blockedStaff.body.code).toBe(ErrorCode.BRANCH_HAS_STAFF);

    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: maadiId })
      .expect(200);

    const archived = await request(app.getHttpServer())
      .patch(`/api/v1/branches/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);
    expect(archived.body.status).toBe('ARCHIVED');

    const listed = await request(app.getHttpServer())
      .get('/api/v1/branches?status=ARCHIVED')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.data[0].id).toBe(created.body.id);

    const got = await request(app.getHttpServer())
      .get(`/api/v1/branches/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(got.body.status).toBe('ARCHIVED');

    const member = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ahmed Hassan',
        phone: '+201003330088',
        homeBranchId: created.body.id,
      })
      .expect(400);
    expect(member.body.code).toBe(ErrorCode.BRANCH_ARCHIVED);

    const okMember = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ahmed Hassan',
        phone: '+201003330088',
        homeBranchId: maadiId,
      })
      .expect(201);

    const door = await request(app.getHttpServer())
      .post('/api/v1/checkIns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: okMember.body.id,
        branchId: created.body.id,
      })
      .expect(400);
    expect(door.body.code).toBe(ErrorCode.BRANCH_ARCHIVED);

    const last = await request(app.getHttpServer())
      .patch(`/api/v1/branches/${maadiId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ARCHIVED' })
      .expect(400);
    expect(last.body.code).toBe(ErrorCode.BRANCH_LAST_ACTIVE);

    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${desk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: created.body.id })
      .expect(400);

    const deskLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug,
        email: `desk-${suffix}@example.com`,
        password: 'DeskPass1!',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${deskLogin.body.accessToken}`)
      .send({ name: '6 October' })
      .expect(403);
  });
});

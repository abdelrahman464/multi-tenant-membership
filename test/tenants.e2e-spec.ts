import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PLATFORM_API_KEY_HEADER } from '../src/common/constants/platform.constants';
import { ErrorCode } from '../src/common/constants/error-codes';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './helpers/create-test-app';

const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

describe('Platform tenants (e2e)', () => {
  let app!: INestApplication;
  let prisma: PrismaService;
  let postgresUp = false;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    postgresUp = await prisma.ping();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects missing platform key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .expect(401);
  });

  it('rejects a wrong platform key', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, 'wrong')
      .send({
        name: 'Delta',
        slug: 'delta-wrong-key',
        firstBranch: { name: 'Maadi' },
      })
      .expect(401);

    expect(res.body.code).toBe(ErrorCode.PLATFORM_KEY_INVALID);
  });

  it('creates, lists, suspends, and isolates tenants when Postgres is up', async () => {
    if (!postgresUp) {
      console.warn(
        'Skipping DB tests: docker compose up -d postgres && npx prisma migrate deploy',
      );
      return;
    }

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const slugA = `gym-a-${suffix}`;
    const slugB = `gym-b-${suffix}`;

    const createdA = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Delta Swim',
        slug: slugA,
        firstBranch: { name: 'Maadi' },
      })
      .expect(201);

    expect(createdA.body.timezone).toBe('Africa/Cairo');
    expect(createdA.body.currency).toBe('EGP');
    expect(createdA.body.branches).toHaveLength(1);
    expect(createdA.body.settings.graceEnabled).toBe(false);

    const reused = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Delta Swim',
        slug: slugA,
        firstBranch: { name: 'Other' },
      })
      .expect(201);

    expect(reused.body.slug).toBe(`${slugA}-1`);

    const createdB = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({
        name: 'Cairo Boxing',
        slug: slugB,
        firstBranch: { name: 'Nasr City' },
      })
      .expect(201);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/platform/tenants')
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .expect(200);

    const slugs = listed.body.data.map((row: { slug: string }) => row.slug);
    expect(slugs).toEqual(expect.arrayContaining([slugA, slugB]));

    const tenantAId = createdA.body.id as string;
    const tenantBId = createdB.body.id as string;

    const branchesA = await prisma.withTenant(tenantAId, (tx) =>
      tx.branch.findMany(),
    );
    const branchesB = await prisma.withTenant(tenantBId, (tx) =>
      tx.branch.findMany(),
    );

    expect(branchesA.every((row) => row.tenantId === tenantAId)).toBe(true);
    expect(branchesA.some((row) => row.tenantId === tenantBId)).toBe(false);
    expect(branchesB.every((row) => row.tenantId === tenantBId)).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${tenantAId}/suspend`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .expect(200);

    const suspended = await request(app.getHttpServer())
      .get(`/api/v1/platform/tenants/${tenantAId}`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .expect(200);

    expect(suspended.body.status).toBe('SUSPENDED');

    await request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${tenantAId}/reactivate`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .expect(200);

    const renamed = await request(app.getHttpServer())
      .patch(`/api/v1/platform/tenants/${tenantAId}`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .send({ name: 'Delta Swim Club' })
      .expect(200);

    expect(renamed.body.name).toBe('Delta Swim Club');
    expect(renamed.body.slug).toBe(slugA);

    await request(app.getHttpServer())
      .delete(`/api/v1/platform/tenants/${reused.body.id}`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/platform/tenants/${reused.body.id}`)
      .set(PLATFORM_API_KEY_HEADER, platformKey)
      .expect(404);
  });
});

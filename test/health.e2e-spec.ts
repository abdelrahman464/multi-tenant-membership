import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.version).toBeDefined();
  });

  it('unknown routes return a JSON error body', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(response.body.statusCode).toBe(404);
    expect(response.body.path).toBe('/api/v1/does-not-exist');
  });
});

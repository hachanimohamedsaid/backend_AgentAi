import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('AppController', () => {
    it('/ (GET)', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect('Hello World!');
    });
  });

  describe('Users API', () => {
    it('POST /users – create user', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Jane', email: 'jane@example.com' })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'Jane',
        email: 'jane@example.com',
      });
      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('createdAt');
    });

    it('GET /users – list users', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const jane = res.body.find((u: { email: string }) => u.email === 'jane@example.com');
      expect(jane).toBeDefined();
      expect(jane).toMatchObject({ name: 'Jane', email: 'jane@example.com' });
    });
  });
});

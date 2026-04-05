import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Request, Response } from 'express';
import { register } from 'prom-client';
import { PrometheusMiddleware } from '../src/observability/prometheus.middleware';
import { RequestIdMiddleware } from '../src/observability/request-id.middleware';

@Controller()
class TestController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Module({
  controllers: [TestController],
})
class TestAppModule {}

describe('Observability (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const requestIdMiddleware = new RequestIdMiddleware();
    const prometheusMiddleware = new PrometheusMiddleware();

    app.use((req: Request, res: Response, next: () => void) =>
      requestIdMiddleware.use(req, res, next),
    );
    app.use((req: Request, res: Response, next: () => void) =>
      prometheusMiddleware.use(req, res, next),
    );

    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.get('/metrics', async (_req: Request, res: Response) => {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    register.resetMetrics();
  });

  it('echoes x-request-id from request headers', async () => {
    const customRequestId = 'req-abc-123';

    const res = await request(app.getHttpServer())
      .get('/ping')
      .set('x-request-id', customRequestId)
      .expect(200);

    expect(res.headers['x-request-id']).toBe(customRequestId);
    expect(res.headers['x-response-time']).toBeDefined();
  });

  it('generates x-request-id when missing', async () => {
    const res = await request(app.getHttpServer()).get('/ping').expect(200);

    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('exposes http metrics including /ping route', async () => {
    await request(app.getHttpServer()).get('/ping').expect(200);

    const metrics = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(metrics.text).toContain('http_requests_total');
    expect(metrics.text).toContain('http_request_duration_seconds');
    expect(metrics.text).toMatch(
      /http_requests_total\{[^}]*route="\/ping"[^}]*status_code="200"[^}]*\} [1-9]/,
    );
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * End-to-end checks for Investor Meeting Intelligence endpoints.
 * Requires MongoDB (MONGO_URI or MONGODB_URI in .env or environment).
 */
describe('Meeting intelligence (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /meetings/intelligence/draft creates a meeting with id', async () => {
    const res = await request(app.getHttpServer())
      .post('/meetings/intelligence/draft')
      .send({ title: 'E2E Intel Draft' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('E2E Intel Draft');
    expect(res.body.roomId).toMatch(/^intel_/);
  });

  it('PATCH context → confirm → briefing culture (fallback) → simulation → report', async () => {
    const draft = await request(app.getHttpServer())
      .post('/meetings/intelligence/draft')
      .send({})
      .expect(201);
    const id = draft.body.id as string;

    await request(app.getHttpServer())
      .patch(`/meetings/${id}/context`)
      .send({
        investor: {
          name: 'Marco Rossi',
          firm: 'Venture Italia',
          location: 'Milan, Italy',
        },
        meeting: {
          datetime: '2026-04-01T14:00:00.000Z',
          timezone: 'Europe/Rome',
          format: 'formal',
        },
        deal: {
          stage: 'Seed',
          sector: 'FinTech',
          targetAmount: 1_000_000,
          valuation: 6_000_000,
          equity: 15,
          meetingType: 'formal',
        },
      })
      .expect(200);

    const confirm = await request(app.getHttpServer())
      .post(`/meetings/${id}/confirm`)
      .expect(201);
    expect(confirm.body).toHaveProperty('briefingVersion');
    expect(confirm.body.missingInfoQuestions).toEqual([]);

    const culture = await request(app.getHttpServer())
      .post(`/meetings/${id}/briefing/culture`)
      .expect(201);
    expect(culture.body).toMatchObject({
      dos: expect.any(Array),
      donts: expect.any(Array),
      communicationStyle: expect.any(String),
      negotiationApproach: expect.any(String),
      openingLine: expect.any(String),
      meetingFlow: expect.any(Array),
    });

    const meetingAfterCulture = await request(app.getHttpServer())
      .get(`/meetings/${id}`)
      .expect(200);
    expect(meetingAfterCulture.body.briefing?.culture).toBeDefined();

    await request(app.getHttpServer())
      .post(`/meetings/${id}/simulation/start`)
      .send({ mode: 'analytical' })
      .expect(201);

    const turn = await request(app.getHttpServer())
      .post(`/meetings/${id}/simulation/turn`)
      .send({ userMessage: 'We have €200K in signed LOIs.' })
      .expect(201);
    expect(turn.body).toMatchObject({
      investorReply: expect.any(String),
      coachFeedback: expect.any(Object),
      scores: expect.objectContaining({
        confidence: expect.any(Number),
        logic: expect.any(Number),
        emotionalControl: expect.any(Number),
      }),
      confidenceScore: expect.any(Number),
      feedback: expect.any(String),
      color: expect.stringMatching(/green|amber|red/i),
    });

    await request(app.getHttpServer())
      .post(`/meetings/${id}/simulation/end`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/meetings/${id}/report/generate`)
      .send({ language: 'en' })
      .expect(201);

    const report = await request(app.getHttpServer())
      .get(`/meetings/${id}/report`)
      .expect(200);
    expect(report.body).not.toBeNull();
    expect(report.body.readinessScore).toBeDefined();
    expect(report.body.sectionStatuses).toBeDefined();
  });

  it('PATCH /meetings/:id/document-facts merges facts', async () => {
    const draft = await request(app.getHttpServer())
      .post('/meetings/intelligence/draft')
      .send({})
      .expect(201);
    const id = draft.body.id as string;

    await request(app.getHttpServer())
      .patch(`/meetings/${id}/document-facts`)
      .send({
        facts: {
          tractionMetrics: ['MRR €50k'],
          companyFacts: ['B2B SaaS'],
        },
      })
      .expect(200);

    const m = await request(app.getHttpServer())
      .get(`/meetings/${id}`)
      .expect(200);
    expect(m.body.documentFacts).toMatchObject({
      tractionMetrics: ['MRR €50k'],
      companyFacts: ['B2B SaaS'],
    });
  });
});

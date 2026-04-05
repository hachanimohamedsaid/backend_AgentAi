import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { webcrypto } from 'node:crypto';
import { register } from 'prom-client';
import { Request, Response } from 'express';
import { Resend } from 'resend';
import { AppModule } from './app.module';

type AlertmanagerAlert = {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  status?: string;
  startsAt?: string;
  endsAt?: string;
};

type AlertmanagerWebhookPayload = {
  receiver?: string;
  status?: string;
  alerts?: AlertmanagerAlert[];
  groupLabels?: Record<string, string>;
  commonLabels?: Record<string, string>;
  commonAnnotations?: Record<string, string>;
};

async function bootstrap() {
  // Some Node runtimes (e.g. older Railway images) do not expose globalThis.crypto.
  // Dependencies used by schedulers/providers may rely on Web Crypto being present.
  if (!(globalThis as any).crypto) {
    (globalThis as any).crypto = webcrypto;
  }

  console.log('[App] Bootstrap starting...');
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const apiPrefix = (process.env.API_PATH_PREFIX ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (apiPrefix) {
    app.setGlobalPrefix(apiPrefix);
  }

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/metrics', async (_req: Request, res: Response) => {
    try {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to collect metrics';
      res.status(500).end(message);
    }
  });

  expressApp.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  expressApp.post('/alerts', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as AlertmanagerWebhookPayload;
    const alerts = Array.isArray(body.alerts) ? body.alerts : [];
    const alertNames = alerts.length
      ? alerts.map((alert) => alert.labels?.alertname ?? 'unknown')
      : [];

    console.log('[AlertWebhook] Received alertmanager webhook', {
      receiver: body.receiver,
      status: body.status,
      alertNames,
      groupLabels: body.groupLabels,
      commonLabels: body.commonLabels,
    });

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const to = (process.env.ALERT_TO_EMAIL || 'mohamedsaidhachani93274190@gmail.com').trim();
    const from = (process.env.EMAIL_FROM || 'onboarding@resend.dev').trim();

    if (!resendApiKey) {
      console.warn('[AlertWebhook] RESEND_API_KEY missing. Email notification skipped.');
      res.status(200).json({ status: 'ok', emailSent: false, reason: 'RESEND_API_KEY missing' });
      return;
    }

    const resend = new Resend(resendApiKey);
    const subjectAlertName = body.commonLabels?.alertname || alertNames[0] || 'Alertmanager Notification';
    const status = (body.status || 'firing').toUpperCase();
    const summary = body.commonAnnotations?.summary || body.commonAnnotations?.description || 'No summary';

    const details = alerts
      .slice(0, 10)
      .map((alert, index) => {
        const name = alert.labels?.alertname || `alert-${index + 1}`;
        const severity = alert.labels?.severity || 'unknown';
        const desc = alert.annotations?.description || alert.annotations?.summary || '';
        return `<li><strong>${name}</strong> [${severity}] ${desc}</li>`;
      })
      .join('');

    const html = `
      <h2>Alertmanager Notification</h2>
      <p><strong>Status:</strong> ${status}</p>
      <p><strong>Receiver:</strong> ${body.receiver || 'default'}</p>
      <p><strong>Summary:</strong> ${summary}</p>
      <p><strong>Alerts:</strong> ${alerts.length}</p>
      <ul>${details || '<li>No alert details</li>'}</ul>
    `;

    resend.emails
      .send({
        from,
        to,
        subject: `[Alertmanager] ${status} - ${subjectAlertName}`,
        html,
      })
      .then((result) => {
        const response = (result as { error?: unknown }).error;
        if (response) {
          console.error('[AlertWebhook] Resend send failed', response);
          return;
        }
        console.log('[AlertWebhook] Email notification sent via Resend', { to, subjectAlertName, status });
      })
      .catch((error: unknown) => {
        console.error('[AlertWebhook] Resend send exception', error);
      });

    res.status(200).json({ status: 'ok' });
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`[App] NestJS server listening on port ${port}`);
  console.log(`[App] Metrics endpoint available at http://localhost:${port}/metrics`);
  console.log(`[App] Health endpoint available at http://localhost:${port}/health`);
  console.log(`[App] Alert webhook endpoint available at http://localhost:${port}/alerts`);
}

bootstrap().catch((err) => {
  console.error('[App] Bootstrap failed:', err?.message ?? err);
  process.exit(1);
});

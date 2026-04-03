import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { webcrypto } from 'node:crypto';
import { register } from 'prom-client';
import { Request, Response } from 'express';
import { AppModule } from './app.module';

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

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  const basePath = apiPrefix ? `/${apiPrefix}` : '';
  console.log(`[App] NestJS server listening on port ${port} — préfixe HTTP: "${basePath || '/'}" (API_PATH_PREFIX=${apiPrefix || '(vide)'})`);
  console.log(`[App] Metrics endpoint available at http://localhost:${port}/metrics`);
  console.log(`[App] Health endpoint available at http://localhost:${port}/health`);
}

bootstrap().catch((err) => {
  console.error('[App] Bootstrap failed:', err?.message ?? err);
  process.exit(1);
});

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { webcrypto } from 'node:crypto';
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
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`[App] NestJS server listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('[App] Bootstrap failed:', err?.message ?? err);
  process.exit(1);
});

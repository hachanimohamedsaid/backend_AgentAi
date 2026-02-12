import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  logger.log('Starting application bootstrap');
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:51178',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:51178',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, etc.)
      if (!origin) return callback(null, true);

      // Allow any localhost / 127.0.0.1 origin in development
      if (
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      ) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS policy: Origin not allowed'), false);
    },
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`NestJS server listening on port ${port}`);
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failed', err as any);
  process.exit(1);
});

// Ajoute Helmet, CORS et express-rate-limit pour sécuriser l'API
// Installation : npm install helmet cors express-rate-limit
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as rateLimit from 'express-rate-limit';
import * as cors from 'cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Protection headers
  app.use(helmet());

  // CORS (config par défaut, à adapter si besoin)
  app.enableCors();

  // Rate limiting (100 requêtes/15min/IP)
  app.use(
    rateLimit.default({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  await app.listen(process.env.PORT || 3000);
}
bootstrap();

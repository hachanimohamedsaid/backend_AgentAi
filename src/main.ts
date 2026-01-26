import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // Confirms app is ready; MongoDB connection log comes from Mongoose in AppModule
  console.log(`[App] NestJS server listening on port ${port}`);
}
bootstrap();

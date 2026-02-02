import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    // Load .env from project root; works locally and on Railway (env vars override)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // MongoDB connection via Mongoose; URI from MONGO_URI or MONGODB_URI env var
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri =
          configService.get<string>('MONGO_URI') ?? configService.get<string>('MONGODB_URI');
        if (!uri) {
          throw new Error(
            'MONGO_URI or MONGODB_URI is not defined. Set it in .env or in your deployment environment (e.g. Railway).',
          );
        }
        return {
          uri,
          connectionFactory: (connection: { on: (ev: string, fn: () => void) => void }) => {
            connection.on('connected', () => {
              console.log('[Mongoose] Successfully connected to MongoDB Atlas.');
            });
            connection.on('error', () => {
              console.error('[Mongoose] MongoDB connection error.');
            });
            return connection;
          },
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

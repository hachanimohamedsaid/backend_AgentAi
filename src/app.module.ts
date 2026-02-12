import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AiModule } from './ai/ai.module';
import { RealtimeModule } from './realtime/realtime.module';
import { MeetingModule } from './meeting/meeting.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri =
          configService.get<string>('MONGO_URI') ??
          configService.get<string>('MONGODB_URI');
        if (!uri) {
          throw new Error(
            'MONGO_URI or MONGODB_URI is not defined.',
          );
        }
        return {
          uri,
          serverSelectionTimeoutMS: 15000,
          connectTimeoutMS: 15000,
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    AiModule,
    RealtimeModule,
    MeetingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

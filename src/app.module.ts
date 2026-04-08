import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AiModule } from './ai/ai.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ProjectDecisionsModule } from './project-decisions/project-decisions.module';
import { ProjectAnalysesModule } from './project-analyses/project-analyses.module';
import { GoalsModule } from './goals/goals.module';
import { AdvisorModule } from './advisor/advisor.module';
import { AssistantModule } from './assistant/assistant.module';
import { MlModule } from './ml/ml.module';
import { MeetingModule } from './meeting/meeting.module';
import { MarketIntelligenceModule } from './market-intelligence/market-intelligence.module';
import { BillingModule } from './billing/billing.module';
import { MobilityModule } from './mobility/mobility.module';
import { SocialCampaignModule } from './social-campaign/social-campaign.module';
import { ChallengesModule } from './challenges/challenges.module';
import { RewardsModule } from './rewards/rewards.module';
import { GoogleConnectModule } from './google-connect/google-connect.module';
import { RequestIdMiddleware } from './observability/request-id.middleware';
import { PrometheusMiddleware } from './observability/prometheus.middleware';
import { LoggerService } from './observability/logger.service';
import { ProjectDispatchModule } from './project-dispatch/project-dispatch.module';
import { RhModule } from './rh/rh.module';

@Module({
  imports: [
    // Load .env from project root; works locally and on Railway (env vars override)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
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
          serverSelectionTimeoutMS: 15000,
          connectTimeoutMS: 15000,
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
    RealtimeModule,
    ProjectDecisionsModule,
    ProjectAnalysesModule,
    GoalsModule,
    AdvisorModule,
    AssistantModule,
    MlModule,
    MeetingModule,
    MarketIntelligenceModule,
    BillingModule,
    MobilityModule,
    SocialCampaignModule,
    ChallengesModule,
    RewardsModule,
    GoogleConnectModule,
    ProjectDispatchModule,
    RhModule,
  ],
  controllers: [AppController],
  providers: [AppService, LoggerService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, PrometheusMiddleware).forRoutes('*');
  }
}

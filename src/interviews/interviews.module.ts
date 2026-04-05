import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module';
import {
  InterviewSession,
  InterviewSessionSchema,
} from './schemas/interview-session.schema';
import { InterviewGeminiService } from './interview-gemini.service';
import { InterviewsService } from './interviews.service';
import { InterviewsController } from './interviews.controller';
import { InterviewsGuestController } from './interviews-guest.controller';
import { GuestTokenService } from './guest-token.service';
import { GuestInterviewStrategy } from './strategies/guest-interview.strategy';
import { GuestInterviewGuard } from './guards/guest-interview.guard';

@Module({
  imports: [
    AuthModule,
    // PassportModule multi-stratégie : 'jwt' (recruteur) + 'interview-guest' (candidat)
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: InterviewSession.name, schema: InterviewSessionSchema },
    ]),
  ],
  // InterviewsGuestController en premier : /interviews/guest/* résolu avant /:sessionId/*
  controllers: [InterviewsGuestController, InterviewsController],
  providers: [
    InterviewsService,
    InterviewGeminiService,
    GuestTokenService,
    GuestInterviewStrategy,
    GuestInterviewGuard,
  ],
})
export class InterviewsModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: InterviewSession.name, schema: InterviewSessionSchema },
    ]),
  ],
  // InterviewsGuestController en premier pour que /interviews/guest/* soit résolu
  // avant le pattern dynamique /interviews/:sessionId/* de InterviewsController
  controllers: [InterviewsGuestController, InterviewsController],
  providers: [InterviewsService, InterviewGeminiService, GuestTokenService],
})
export class InterviewsModule {}

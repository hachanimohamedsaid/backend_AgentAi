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

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: InterviewSession.name, schema: InterviewSessionSchema },
    ]),
  ],
  controllers: [InterviewsController],
  providers: [InterviewsService, InterviewGeminiService],
})
export class InterviewsModule {}

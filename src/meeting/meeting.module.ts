import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingDecision, MeetingDecisionSchema } from './schemas/meeting-decision.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: MeetingDecision.name, schema: MeetingDecisionSchema }])],
  controllers: [MeetingController],
  providers: [MeetingService],
  exports: [MeetingService],
})
export class MeetingModule {}

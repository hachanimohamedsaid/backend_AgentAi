import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { Meeting, MeetingSchema } from './schemas/meeting.schema';
import { MeetingService } from './meeting.service';
import { MeetingAgentsService } from './meeting-agents.service';
import { MeetingPdfService } from './meeting-pdf.service';
import { GooglePlacesService } from './google-places.service';
import { MeetingController } from './meeting.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Meeting.name, schema: MeetingSchema }]),
    HttpModule.register({ timeout: 10000, maxRedirects: 3 }),
  ],
  controllers: [MeetingController],
  providers: [
    MeetingService,
    MeetingAgentsService,
    MeetingPdfService,
    GooglePlacesService,
  ],
  exports: [MeetingService],
})
export class MeetingModule {}

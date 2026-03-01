import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { AppendTranscriptDto } from './dto/append-transcript.dto';
import { SaveSummaryDto } from './dto/save-summary.dto';

@Controller('meetings')
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  async create(@Body() dto: CreateMeetingDto) {
    return this.meetingService.create(dto);
  }

  @Get()
  async findAll() {
    return this.meetingService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.meetingService.findOne(id);
  }

  @Patch(':id/transcript')
  async appendTranscript(
    @Param('id') id: string,
    @Body() dto: AppendTranscriptDto,
  ) {
    return this.meetingService.appendTranscript(id, dto);
  }

  @Patch(':id/summary')
  async saveSummary(
    @Param('id') id: string,
    @Body() dto: SaveSummaryDto,
  ) {
    return this.meetingService.saveSummary(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.meetingService.delete(id);
    return { ok: true };
  }
}

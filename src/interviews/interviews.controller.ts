import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { StartInterviewDto } from './dto/start-interview.dto';
import { InterviewMessageDto } from './dto/interview-message.dto';
import { InterviewsService } from './interviews.service';

@Controller('interviews')
@UseGuards(JwtAuthGuard)
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post('start')
  async start(@Request() req: { user: UserDocument }, @Body() dto: StartInterviewDto) {
    return this.interviewsService.start(req.user, dto);
  }

  @Post(':sessionId/message')
  async message(
    @Request() req: { user: UserDocument },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: InterviewMessageDto,
  ) {
    return this.interviewsService.postMessage(sessionId, req.user, dto);
  }

  @Post(':sessionId/complete')
  async complete(
    @Request() req: { user: UserDocument },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.interviewsService.complete(sessionId, req.user);
  }
}

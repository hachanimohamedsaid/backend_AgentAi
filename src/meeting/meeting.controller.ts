import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { MeetingService, DecisionResponse } from './meeting.service';
import { MeetingDecisionDto } from './dto/decision.dto';

@Controller('meeting')
export class MeetingController {
  private readonly logger = new Logger(MeetingController.name);

  constructor(private readonly meetingService: MeetingService) {}

  @Post('decision')
  @HttpCode(HttpStatus.OK)
  async decision(
    @Body() dto: MeetingDecisionDto,
  ): Promise<DecisionResponse> {
    this.logger.log(
      `Received meeting decision request: ${JSON.stringify(dto)}`,
    );

    if (!dto?.requestId) {
      throw new BadRequestException('requestId is required');
    }

    return this.meetingService.handleDecision(dto);
  }

  @Get('decision/:requestId')
  async getDecisionStatus(@Param('requestId') requestId: string) {
    if (!requestId) {
      throw new BadRequestException('requestId is required');
    }

    const decision =
      await this.meetingService.getDecisionStatus(requestId);

    if (!decision) {
      return {
        status: 'not_found',
        requestId,
      };
    }

    return decision;
  }
}

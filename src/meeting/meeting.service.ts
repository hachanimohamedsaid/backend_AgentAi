import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MeetingDecisionDto,
  DecisionEnum,
} from './dto/decision.dto';
import { MeetingDecision } from './schemas/meeting-decision.schema';

export interface DecisionResponse {
  status: 'created' | 'rejected' | 'already_exists';
  requestId: string;
  googleCalendarLink?: string;
}

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    @InjectModel(MeetingDecision.name)
    private readonly model: Model<MeetingDecision>,
  ) {}

  async handleDecision(
    dto: MeetingDecisionDto,
  ): Promise<DecisionResponse> {
    if (!dto?.requestId) {
      throw new BadRequestException('requestId is required');
    }

    const existing = await this.model
      .findOne({ requestId: dto.requestId })
      .exec();

    if (existing) {
      return {
        status: 'already_exists',
        requestId: dto.requestId,
      };
    }

    const base = {
      meetingDate: dto.meetingDate,
      meetingTime: dto.meetingTime,
      decision: dto.decision,
      durationMinutes: dto.durationMinutes,
      requestId: dto.requestId,
    };

    if (dto.decision === DecisionEnum.REJECT) {
      await new this.model(base).save();
      return {
        status: 'rejected',
        requestId: dto.requestId,
      };
    }

    if (dto.decision === DecisionEnum.ACCEPT) {
      const link = `https://calendar.google.com/event?eid=${encodeURIComponent(
        dto.requestId,
      )}`;

      await new this.model({
        ...base,
        googleCalendarLink: link,
      }).save();

      return {
        status: 'created',
        requestId: dto.requestId,
        googleCalendarLink: link,
      };
    }

    throw new BadRequestException('Invalid decision value');
  }

  async getDecisionStatus(requestId: string) {
    return this.model.findOne({ requestId }).lean().exec();
  }
}

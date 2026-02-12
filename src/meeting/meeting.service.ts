import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  MeetingDecision,
  MeetingDecisionDocument,
} from './schemas/meeting-decision.schema';

export interface DecisionResponse {
  status: string;
  requestId: string;
  googleCalendarLink?: string;
}

@Injectable()
export class MeetingService {
  constructor(
    @InjectModel(MeetingDecision.name)
    private readonly meetingModel: Model<MeetingDecisionDocument>,
    private readonly httpService: HttpService,
  ) {}

  async handleDecision(dto: any): Promise<DecisionResponse> {
    const {
      meetingDate,
      meetingTime,
      decision,
      durationMinutes,
      requestId,
      userEmail,
      userTimezone,
    } = dto;

    // Save initial decision
    const created = await this.meetingModel.create({
      meetingDate,
      meetingTime,
      decision,
      durationMinutes,
      requestId,
    });

    try {
      // Call n8n webhook
      const response = await firstValueFrom(
        this.httpService.post(
          'http://localhost:5678/webhook-test/meeting/decision',
          {
            meetingDate,
            meetingTime,
            decision,
            durationMinutes,
            requestId,
            userEmail,
            userTimezone,
          },
        ),
      );

      const googleCalendarLink =
        response?.data?.googleCalendarLink || null;

      // Update Mongo with Google link
      if (googleCalendarLink) {
        await this.meetingModel.updateOne(
          { requestId },
          { googleCalendarLink },
        );
      }

      return {
        status: 'created',
        requestId,
        googleCalendarLink,
      };
    } catch (error) {
      console.error('n8n error:', error.message);
      return {
        status: 'created_without_calendar',
        requestId,
      };
    }
  }

  async getDecisionStatus(requestId: string) {
    return this.meetingModel.findOne({ requestId }).lean();
  }
}
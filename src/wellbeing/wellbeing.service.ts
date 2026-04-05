import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import {
  currentCycleKeyUtc,
  formatDateIsoUtc,
  nextCycleStartUtc,
} from './domain/cycle';
import { validateWellbeingAnswers } from './domain/questions';
import { computeDiagnostic, type ComputedScores } from './domain/scoring';
import {
  WellbeingDiagnostic,
  WellbeingDiagnosticDocument,
} from './schemas/wellbeing-diagnostic.schema';
import {
  WellbeingUser,
  WellbeingUserDocument,
} from './schemas/wellbeing-user.schema';
import { WellbeingAiService } from './wellbeing-ai.service';

export interface RegisterWellbeingUserResult {
  id: string;
  created_at: string;
  diagnostic_anchor_day: number;
}

export interface WellbeingStatusResult {
  availableThisCycle: boolean;
  nextAvailableDate: string | null;
  diagnosticAnchorDay: number;
  cycleKey: string;
}

export interface WellbeingSubmitResult {
  scores: ComputedScores;
  aiResponse: string;
}

@Injectable()
export class WellbeingService {
  constructor(
    @InjectModel(WellbeingUser.name)
    private readonly userModel: Model<WellbeingUserDocument>,
    @InjectModel(WellbeingDiagnostic.name)
    private readonly diagnosticModel: Model<WellbeingDiagnosticDocument>,
    private readonly wellbeingAi: WellbeingAiService,
  ) {}

  async register(): Promise<RegisterWellbeingUserResult> {
    const now = new Date();
    const diagnosticAnchorDay = now.getUTCDate();
    const uuid = randomUUID();
    const doc = await this.userModel.create({
      uuid,
      diagnosticAnchorDay,
    });
    const createdRaw = doc.get('createdAt');
    const created = createdRaw instanceof Date ? createdRaw : now;
    return {
      id: doc.uuid,
      created_at: created.toISOString(),
      diagnostic_anchor_day: doc.diagnosticAnchorDay,
    };
  }

  async getStatus(userId: string): Promise<WellbeingStatusResult> {
    const user = await this.userModel.findOne({ uuid: userId }).exec();
    if (!user) {
      throw new HttpException(
        { detail: 'User not found', user_id: userId },
        HttpStatus.NOT_FOUND,
      );
    }
    const now = new Date();
    const cycleKey = currentCycleKeyUtc(now, user.diagnosticAnchorDay);
    const existing = await this.diagnosticModel
      .findOne({ userUuid: userId, cycleKey })
      .exec();

    if (existing) {
      const nextStart = nextCycleStartUtc(now, user.diagnosticAnchorDay);
      return {
        availableThisCycle: false,
        nextAvailableDate: formatDateIsoUtc(nextStart),
        diagnosticAnchorDay: user.diagnosticAnchorDay,
        cycleKey,
      };
    }

    return {
      availableThisCycle: true,
      nextAvailableDate: null,
      diagnosticAnchorDay: user.diagnosticAnchorDay,
      cycleKey,
    };
  }

  async submitDiagnostic(
    answers: number[],
    previousScore?: number,
    userId?: string,
  ): Promise<WellbeingSubmitResult> {
    const err = validateWellbeingAnswers(answers);
    if (err) {
      throw new BadRequestException({ detail: err });
    }

    const scores = computeDiagnostic(answers, previousScore ?? null);
    const aiResponse = await this.wellbeingAi.getAiResponse(scores);

    if (userId) {
      const user = await this.userModel.findOne({ uuid: userId }).exec();
      if (!user) {
        throw new HttpException(
          { detail: 'User not found', user_id: userId },
          HttpStatus.NOT_FOUND,
        );
      }
      const now = new Date();
      const cycleKey = currentCycleKeyUtc(now, user.diagnosticAnchorDay);
      const existing = await this.diagnosticModel
        .findOne({ userUuid: userId, cycleKey })
        .exec();
      if (existing) {
        const nextStart = nextCycleStartUtc(now, user.diagnosticAnchorDay);
        throw new HttpException(
          {
            detail: 'Diagnostic already completed for this monthly cycle',
            nextAvailableDate: formatDateIsoUtc(nextStart),
            cycleKey,
          },
          HttpStatus.FORBIDDEN,
        );
      }

      await this.diagnosticModel.create({
        userUuid: userId,
        cycleKey,
        answers: [...answers],
        scores: { ...scores },
        aiResponse,
      });
    }

    return { scores, aiResponse };
  }
}

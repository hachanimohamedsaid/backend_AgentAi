import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Context,
  ContextDocument,
} from './schemas/context.schema';
import {
  Suggestion,
  SuggestionDocument,
  SuggestionStatus,
  SuggestionType,
} from './schemas/suggestion.schema';
import {
  Habit,
  HabitDocument,
} from './schemas/habit.schema';
import {
  InteractionLog,
  InteractionLogDocument,
} from './schemas/interaction-log.schema';
import {
  TrainingSample,
  TrainingSampleDocument,
} from './schemas/training-sample.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateContextDto } from './dto/create-context.dto';
import { MlService } from './ml.service';

interface GeneratedSuggestion {
  type: SuggestionType;
  message: string;
  baseConfidence: number;
}

const ACCEPTED_THRESHOLD = 30;
const RETRAIN_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class AssistantService {
  private static readonly HABIT_ALPHA = 0.2;

  constructor(
    @InjectModel(Context.name)
    private readonly contextModel: Model<ContextDocument>,
    @InjectModel(Suggestion.name)
    private readonly suggestionModel: Model<SuggestionDocument>,
    @InjectModel(Habit.name)
    private readonly habitModel: Model<HabitDocument>,
    @InjectModel(InteractionLog.name)
    private readonly interactionLogModel: Model<InteractionLogDocument>,
    @InjectModel(TrainingSample.name)
    private readonly trainingSampleModel: Model<TrainingSampleDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mlService: MlService,
  ) {}

  async saveContextAndGenerateSuggestions(
    dto: CreateContextDto,
  ): Promise<SuggestionDocument[]> {
    await this.contextModel.create({
      userId: dto.userId,
      time: dto.time,
      location: dto.location,
      weather: dto.weather,
      meetings: dto.meetings ?? [],
      focusHours: dto.focusHours,
    });
    return this.generateSuggestionsFromContextDto(dto);
  }

  /**
   * If user.mlTrained → call ML /predict. Otherwise use rule-based suggestions.
   * Stores suggestions with context snapshot (time, location, weather, focusHours) for training.
   */
  async generateSuggestionsFromContextDto(
    dto: CreateContextDto,
  ): Promise<SuggestionDocument[]> {
    const user = await this.userModel.findOne({ userId: dto.userId }).exec();
    const contextLike = {
      userId: dto.userId,
      time: dto.time,
      location: dto.location,
      weather: dto.weather,
      meetings: dto.meetings ?? [],
      focusHours: dto.focusHours,
    } as ContextDocument;

    const contextFields = {
      time: dto.time,
      location: dto.location,
      weather: dto.weather,
      focusHours: dto.focusHours,
    };

    if (user?.mlTrained) {
      const suggestions = await this.mlService.predict({
        userId: dto.userId,
        time: dto.time,
        location: dto.location,
        weather: dto.weather,
        focusHours: dto.focusHours,
        meetings: Array.isArray(dto.meetings) ? dto.meetings.length : 0,
      });

      if (!suggestions.length) {
        const fallback = new this.suggestionModel({
          userId: dto.userId,
          type: 'break',
          message: 'Stay hydrated and take a short break when you can.',
          confidence: 0.5,
          status: 'pending' as SuggestionStatus,
          ...contextFields,
        });
        await fallback.save();
        return [fallback];
      }

      const docs = await this.suggestionModel.insertMany(
        suggestions.map((s) => ({
          userId: dto.userId,
          type: 'break' as SuggestionType,
          message: s.message,
          confidence: Math.min(1, Math.max(0, s.confidence)),
          status: 'pending' as SuggestionStatus,
          ...contextFields,
        })),
      );
      return docs;
    }

    // Fallback: rule-based suggestions when ML not trained for this user
    const generated = await this.generateRuleBasedSuggestions(contextLike);
    if (!generated.length) {
      const fallback = new this.suggestionModel({
        userId: dto.userId,
        type: 'break',
        message: 'Stay hydrated and take a short break when you can.',
        confidence: 0.5,
        status: 'pending' as SuggestionStatus,
        ...contextFields,
      });
      await fallback.save();
      return [fallback];
    }

    const docs = await this.suggestionModel.insertMany(
      generated.map((s) => ({
        userId: dto.userId,
        type: s.type,
        message: s.message,
        confidence: s.baseConfidence,
        status: 'pending' as SuggestionStatus,
        ...contextFields,
      })),
    );
    return docs;
  }

  private async getHabit(
    userId: string,
    type: SuggestionType,
  ): Promise<HabitDocument | null> {
    return this.habitModel.findOne({ userId, suggestionType: type }).exec();
  }

  private adjustConfidence(
    base: number,
    habit: HabitDocument | null,
  ): number {
    const successRate = habit?.successRate ?? 0.5;
    const adjusted =
      base + (successRate - 0.5) * 0.3; // shift +/-0.15 max
    return Math.min(1, Math.max(0, adjusted));
  }

  private getMinutes(time: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }
    return hours * 60 + minutes;
  }

  private hasUpcomingMeeting(
    context: ContextDocument,
    nowMinutes: number,
  ): boolean {
    const next45 = nowMinutes + 45;
    return (
      (context.meetings ?? []).some((m) => {
        const mt = this.getMinutes(m.time);
        return mt !== null && mt >= nowMinutes && mt <= next45;
      }) ?? false
    );
  }

  private async generateRuleBasedSuggestions(
    context: ContextDocument,
  ): Promise<GeneratedSuggestion[]> {
    const suggestions: GeneratedSuggestion[] = [];
    const nowMinutes = this.getMinutes(context.time) ?? 0;

    const eight = 8 * 60;
    const nineThirty = 9 * 60 + 30;
    if (
      nowMinutes >= eight &&
      nowMinutes <= nineThirty &&
      context.location === 'home'
    ) {
      suggestions.push({
        type: 'coffee',
        message: 'Want your usual coffee?',
        baseConfidence: 0.7,
      });
    }

    const hasUpcomingMeeting = this.hasUpcomingMeeting(context, nowMinutes);
    if (hasUpcomingMeeting) {
      suggestions.push({
        type: 'leave_home',
        message: 'You should leave now to arrive on time.',
        baseConfidence: 0.8,
      });
    }

    if (context.weather === 'rain') {
      suggestions.push({
        type: 'umbrella',
        message: 'Rain is expected. Bring an umbrella.',
        baseConfidence: 0.6,
      });
    }

    if (context.focusHours >= 2) {
      suggestions.push({
        type: 'break',
        message: `You've been focused for ${context.focusHours} hours. Take a break.`,
        baseConfidence: 0.65,
      });
    }

    const withHabits: GeneratedSuggestion[] = [];
    for (const s of suggestions) {
      const habit = await this.getHabit(context.userId, s.type);
      const adjusted = this.adjustConfidence(s.baseConfidence, habit);
      withHabits.push({ ...s, baseConfidence: adjusted });
    }

    withHabits.sort((a, b) => b.baseConfidence - a.baseConfidence);
    return withHabits;
  }

  private async generateSuggestions(
    context: ContextDocument,
  ): Promise<GeneratedSuggestion[]> {
    return this.generateRuleBasedSuggestions(context);
  }

  async getTodayPendingSuggestions(
    userId: string,
  ): Promise<SuggestionDocument[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return this.suggestionModel
      .find({
        userId,
        status: 'pending',
        createdAt: { $gte: startOfDay },
      })
      .sort({ confidence: -1 })
      .exec();
  }

  async handleFeedback(
    suggestionId: string,
    action: 'accepted' | 'dismissed',
  ): Promise<void> {
    if (
      !suggestionId ||
      typeof suggestionId !== 'string' ||
      !/^[a-fA-F0-9]{24}$/.test(suggestionId)
    ) {
      throw new BadRequestException(
        'Invalid suggestion ID. Must be a 24-character hex string (MongoDB ObjectId).',
      );
    }
    const suggestion = await this.suggestionModel
      .findById(suggestionId)
      .exec();
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    if (suggestion.status !== 'pending') {
      return;
    }

    suggestion.status = action === 'accepted' ? 'accepted' : 'dismissed';
    await suggestion.save();

    await this.updateHabit(
      suggestion.userId,
      suggestion.type,
      action === 'accepted',
    );

    const now = new Date();
    await this.interactionLogModel.create({
      userId: suggestion.userId,
      suggestionType: suggestion.type,
      action,
      timeOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
    });

    // Store training sample when we have context snapshot on the suggestion
    const hasContext =
      suggestion.time != null &&
      suggestion.location != null &&
      suggestion.weather != null &&
      suggestion.focusHours != null;

    if (hasContext) {
      await this.trainingSampleModel.create({
        userId: suggestion.userId,
        time: suggestion.time!,
        location: suggestion.location!,
        weather: suggestion.weather!,
        focusHours: suggestion.focusHours!,
        suggestionType: suggestion.type,
        accepted: action === 'accepted',
      });

      await this.maybeTriggerRetrain(suggestion.userId, now);
    }
  }

  /**
   * If user has >= ACCEPTED_THRESHOLD accepted samples and (mlTrained is false and lastTrainingAt allows),
   * call ML retrain and set user.mlTrained = true, user.lastTrainingAt = now.
   */
  private async maybeTriggerRetrain(
    userId: string,
    now: Date,
  ): Promise<void> {
    const acceptedCount = await this.trainingSampleModel
      .countDocuments({ userId, accepted: true })
      .exec();

    if (acceptedCount < ACCEPTED_THRESHOLD) {
      return;
    }

    const user = await this.userModel.findOne({ userId }).exec();
    if (!user) {
      return;
    }
    if (user.mlTrained) {
      return;
    }
    if (
      user.lastTrainingAt != null &&
      now.getTime() - user.lastTrainingAt.getTime() < RETRAIN_COOLDOWN_MS
    ) {
      return;
    }

    try {
      const result = await this.mlService.retrain(userId);
      if (result?.trained) {
        await this.userModel
          .updateOne(
            { userId },
            { $set: { mlTrained: true, lastTrainingAt: now } },
          )
          .exec();
      }
    } catch {
      // Avoid crashing feedback; retrain can be retried later
    }
  }

  private async updateHabit(
    userId: string,
    type: SuggestionType,
    accepted: boolean,
  ): Promise<void> {
    const now = new Date();
    let habit = await this.habitModel
      .findOne({ userId, suggestionType: type })
      .exec();
    if (!habit) {
      habit = new this.habitModel({
        userId,
        suggestionType: type,
        successRate: 0.5,
        occurrences: 0,
        lastUsedAt: null,
      });
    }

    const oldRate = habit.successRate ?? 0.5;
    const target = accepted ? 1 : 0;
    const alpha = AssistantService.HABIT_ALPHA;
    const newRate = oldRate + alpha * (target - oldRate);

    habit.successRate = Math.min(1, Math.max(0, newRate));
    habit.occurrences = (habit.occurrences ?? 0) + 1;
    habit.lastUsedAt = now;
    await habit.save();
  }
}


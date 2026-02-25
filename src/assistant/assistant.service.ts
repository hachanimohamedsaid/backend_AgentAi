import { Injectable, NotFoundException } from '@nestjs/common';
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
import { CreateContextDto } from './dto/create-context.dto';
import { MlService } from './ml.service';

interface GeneratedSuggestion {
  type: SuggestionType;
  message: string;
  baseConfidence: number;
}

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
    private readonly mlService: MlService,
  ) {}

  async saveContextAndGenerateSuggestions(
    dto: CreateContextDto,
  ): Promise<SuggestionDocument[]> {
    const context = await this.contextModel.create({
      userId: dto.userId,
      time: dto.time,
      location: dto.location,
      weather: dto.weather,
      meetings: dto.meetings ?? [],
      focusHours: dto.focusHours,
    });

    const generated = await this.generateSuggestions(context);
    const docs = await this.suggestionModel.insertMany(
      generated.map((g) => ({
        userId: context.userId,
        type: g.type,
        message: g.message,
        confidence: g.baseConfidence,
        status: 'pending' as SuggestionStatus,
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
    const nowMinutes = this.getMinutes(context.time) ?? 0;
    const timeOfDay = Math.floor(nowMinutes / 60);
    const dayOfWeek = new Date().getDay();

    const candidates: { type: SuggestionType; message: string }[] = [];

    if (context.location === 'home') {
      candidates.push({
        type: 'coffee',
        message: 'Want your usual coffee?',
      });
    }

    if (this.hasUpcomingMeeting(context, nowMinutes)) {
      candidates.push({
        type: 'leave_home',
        message: 'You should leave now to arrive on time.',
      });
    }

    if (context.weather === 'rain') {
      candidates.push({
        type: 'umbrella',
        message: 'Rain is expected. Bring an umbrella.',
      });
    }

    if (context.focusHours >= 2) {
      candidates.push({
        type: 'break',
        message: `You've been focused for ${context.focusHours} hours. Take a break.`,
      });
    }

    if (!candidates.length) {
      return [];
    }

    try {
      const results: GeneratedSuggestion[] = [];
      for (const c of candidates) {
        const probability = await this.mlService.predict({
          timeOfDay,
          dayOfWeek,
          suggestionType: c.type,
        });
        if (probability >= 0.5) {
          results.push({
            type: c.type,
            message: c.message,
            baseConfidence: probability, // confidence = probability
          });
        }
      }
      return results;
    } catch {
      // Safety fallback to rule-based engine
      return this.generateRuleBasedSuggestions(context);
    }
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
    const suggestion = await this.suggestionModel
      .findById(suggestionId)
      .exec();
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    if (suggestion.status !== 'pending') {
      // Already processed; no-op
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


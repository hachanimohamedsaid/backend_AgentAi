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
import {
  OpenAiSuggestionClient,
  AvaSuggestion,
} from './openai-suggestion.client';
import {
  OpenAiNotificationClient,
  AssistantNotification,
} from './openai-notification.client';
import { Goal, GoalDocument } from '../goals/schemas/goal.schema';
import {
  AssistantFeedback,
  AssistantFeedbackDocument,
} from './schemas/assistant-feedback.schema';
import {
  AssistantUserProfile,
  AssistantUserProfileDocument,
} from './schemas/assistant-user-profile.schema';
import { GenerateNotificationsDto } from './dto/generate-notifications.dto';

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
    @InjectModel(Goal.name)
    private readonly goalModel: Model<GoalDocument>,
    @InjectModel(AssistantFeedback.name)
    private readonly assistantFeedbackModel: Model<AssistantFeedbackDocument>,
    @InjectModel(AssistantUserProfile.name)
    private readonly assistantUserProfileModel: Model<AssistantUserProfileDocument>,
    private readonly mlService: MlService,
    private readonly openAiSuggestions: OpenAiSuggestionClient,
    private readonly openAiNotifications: OpenAiNotificationClient,
  ) {}

  /**
   * Génère 3 questions de suggestion (AVA) via OpenAI, à partir
   * du profil utilisateur + données internes + contexte courant.
   * N'affecte pas la logique ML existante (retrain, training_samples, etc.).
   */
  async generateContextQuestions(
    dto: CreateContextDto,
  ): Promise<AvaSuggestion[]> {
    const user = await this.userModel.findOne({ userId: dto.userId }).exec();

    const profile = {
      name: user?.name ?? 'Unknown user',
      role: user?.role ?? null,
      bio: user?.bio ?? null,
      location: user?.location ?? null,
    };

    const behaviorSummary = {
      timeOfDay: dto.time,
      focusHours: dto.focusHours,
      location: dto.location,
      weather: dto.weather,
    };

    // Pour l'instant on ne lit pas encore les emails / finance / projets détaillés,
    // on construit des résumés simples basés sur ce que l'assistant connaît déjà.
    const recentContexts = await this.contextModel
      .find({ userId: dto.userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();

    const recentSuggestions = await this.suggestionModel
      .find({ userId: dto.userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .exec();

    const goals = await this.goalModel
      .find({ userId: dto.userId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean()
      .exec();

    const emailsSummary =
      'Emails data is not yet connected to the assistant backend.';

    const financeSummary =
      'Finance data is not yet fully connected; focus on general spending and savings habits.';

    const projectsSummary =
      recentSuggestions.length > 0
        ? `The assistant recently proposed ${recentSuggestions.length} suggestions for this user (types: ${[
            ...new Set(recentSuggestions.map((s) => s.type)),
          ].join(', ')}).`
        : 'No recent assistant suggestions found for this user.';

    let goalsSummary: string;
    if (!goals.length) {
      goalsSummary =
        'No explicit goals are registered for this user yet in the goals module.';
    } else {
      const total = goals.length;
      const avgProgress =
        goals.reduce(
          (sum: number, g: any) => sum + (g.progress ?? 0),
          0,
        ) / total;
      const categories = Array.from(
        new Set(
          goals
            .map((g: any) => g.category)
            .filter((c: unknown): c is string => typeof c === 'string'),
        ),
      );
      const topCategories =
        categories.length > 0 ? categories.slice(0, 3).join(', ') : 'general';
      goalsSummary = `User has ${total} active goals (avg progress about ${Math.round(
        avgProgress,
      )}%). Main categories: ${topCategories}.`;
    }

    const learnedPreferences = await this.buildLearnedPreferences(dto.userId!);

    const contextForModel = {
      profile,
      appDataSummary: {
        emailsSummary,
        financeSummary,
        projectsSummary,
        goalsSummary,
      },
      behaviorSummary,
      learnedPreferences,
      recentContexts,
    };

    return this.openAiSuggestions.generateSuggestions(contextForModel);
  }

  async saveContextAndGenerateSuggestions(
    dto: CreateContextDto,
  ): Promise<SuggestionDocument[]> {
    await this.autoTrainIfNeeded(dto.userId);

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
   * Generate AVA suggestions via OpenAI and persist them into assistant_suggestions
   * so that feedback and ML can consume them later.
   */
  async generateAndStoreAvaSuggestions(
    dto: CreateContextDto,
  ): Promise<SuggestionDocument[]> {
    const avaSuggestions = await this.generateContextQuestions(dto);
    if (!avaSuggestions.length) {
      return [];
    }

    const contextFields = {
      time: dto.time,
      location: dto.location,
      weather: dto.weather,
      focusHours: dto.focusHours,
    };

    const docs = await this.suggestionModel.insertMany(
      avaSuggestions.slice(0, 3).map((s) => ({
        userId: dto.userId,
        type: s.type ?? 'other',
        message: s.message,
        confidence: Math.min(1, Math.max(0, s.confidence)),
        status: 'pending' as SuggestionStatus,
        source: 'openai' as const,
        ...contextFields,
      })),
    );

    return docs;
  }

  /**
   * Transform normalized "signals" (backend/ML/Mongo + front) into user notifications.
   * Uses OpenAI when configured; does NOT persist anything in Mongo.
   * Signaux = signaux construits depuis le contexte Mongo (réunions, pause) + signaux envoyés par le front (emails, etc.).
   */
  async generateNotifications(
    dto: GenerateNotificationsDto,
  ): Promise<AssistantNotification[]> {
    const user = await this.userModel.findOne({ userId: dto.userId }).exec();

    const profile = {
      name: user?.name ?? null,
      role: user?.role ?? null,
    };

    const locale = dto.locale?.trim() || 'fr-TN';
    const timezone = dto.timezone?.trim() || 'Africa/Tunis';
    const tone = dto.tone ?? 'professional';
    const maxItems = dto.maxItems ?? 5;

    const backendSignals = await this.buildBackendSignals(
      dto.userId,
      dto.currentTime?.trim(),
    );
    const frontSignals = Array.isArray(dto.signals) ? dto.signals : [];
    const signals = [...backendSignals, ...frontSignals];

    const learnedPreferences = await this.buildLearnedPreferences(dto.userId);

    const ai = await this.openAiNotifications.generateNotifications({
      profile,
      locale,
      timezone,
      tone,
      learnedPreferences,
      signals,
      maxItems,
    });

    return ai;
  }

  /**
   * Construit des signaux à partir des données Mongo/ML (contexte, réunions, focus)
   * pour que les notifications ne soient pas limitées aux seuls emails envoyés par le front.
   */
  private async buildBackendSignals(
    userId: string,
    currentTime?: string,
  ): Promise<Array<{ signalType: string; payload?: Record<string, any>; source: string }>> {
    const latestContext = await this.contextModel
      .findOne({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (!latestContext) {
      return [];
    }

    const nowMinutes: number =
      (currentTime ? this.getMinutes(currentTime) : null) ??
      this.getMinutes((latestContext as any).time) ??
      0;
    const signals: Array<{
      signalType: string;
      payload?: Record<string, any>;
      source: string;
    }> = [];

    const meetings = (latestContext as any).meetings ?? [];
    const location = (latestContext as any).location ?? null;

    for (const m of meetings) {
      const mt = this.getMinutes(m.time);
      if (mt === null) continue;
      if (mt < nowMinutes) continue;
      const startsInMin = mt - nowMinutes;
      if (startsInMin > 45) continue;
      signals.push({
        signalType: 'MEETING_SOON',
        payload: {
          title: m.title,
          startsInMin,
          location: location ?? undefined,
        },
        source: 'backend',
      });
    }

    const focusHours = (latestContext as any).focusHours;
    if (typeof focusHours === 'number' && focusHours >= 2) {
      signals.push({
        signalType: 'BREAK_SUGGESTED',
        payload: { focusHours },
        source: 'backend',
      });
    }

    const weather = (latestContext as any).weather;
    if (weather === 'rain') {
      signals.push({
        signalType: 'WEATHER_ALERT',
        payload: { condition: 'rain', message: 'Rain expected' },
        source: 'backend',
      });
    }

    const mlSignals = await this.buildMlSignalsForUser(userId, latestContext as any);
    signals.push(...mlSignals);

    return signals;
  }

  /**
   * Appelle le service ML pour ce user avec le dernier contexte et transforme
   * les prédictions en signaux de notification personnalisés (ML_SUGGESTION).
   */
  private async buildMlSignalsForUser(
    userId: string,
    latestContext: {
      time: string;
      location: string;
      weather: string;
      focusHours: number;
      meetings?: Array<{ title: string; time: string }>;
    },
  ): Promise<Array<{ signalType: string; payload?: Record<string, any>; source: string }>> {
    const user = await this.userModel.findOne({ userId }).lean().exec();
    if (!user?.mlTrained) {
      return [];
    }

    try {
      const suggestions = await this.mlService.predict({
        userId,
        time: latestContext.time,
        location: latestContext.location,
        weather: latestContext.weather,
        focusHours:
          typeof latestContext.focusHours === 'number' ? latestContext.focusHours : 0,
        meetings: Array.isArray(latestContext.meetings) ? latestContext.meetings.length : 0,
      });

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        return [];
      }

      const out: Array<{
        signalType: string;
        payload?: Record<string, any>;
        source: string;
      }> = [];

      const minConfidence = 0.5;
      for (const s of suggestions) {
        if (!s || typeof s.message !== 'string' || (s.confidence ?? 0) < minConfidence) {
          continue;
        }
        out.push({
          signalType: 'ML_PERSONALIZED_SUGGESTION',
          payload: {
            message: s.message.trim(),
            confidence: Math.min(1, Math.max(0, Number(s.confidence) ?? 0.5)),
          },
          source: 'ml',
        });
      }

      return out;
    } catch {
      return [];
    }
  }

  private async buildLearnedPreferences(userId: string): Promise<string | null> {
    // 1) Prefer using aggregated ML profile if it exists
    const profile = await this.assistantUserProfileModel
      .findOne({ userId })
      .lean()
      .exec();

    if (profile) {
      const parts: string[] = [];
      if (profile.acceptedTypes?.length) {
        parts.push(
          `User tends to accept: ${profile.acceptedTypes.join(', ')}.`,
        );
      }
      if (profile.dismissedTypes?.length) {
        parts.push(
          `User tends to refuse: ${profile.dismissedTypes.join(', ')}.`,
        );
      }
      if (parts.length) {
        return parts.join(' ');
      }
    }

    // 2) Fallback: derive preferences directly from recent training samples
    const samples = await this.trainingSampleModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();

    if (!samples.length) {
      return null;
    }

    const stats: Record<
      string,
      { accepted: number; dismissed: number }
    > = {};

    for (const s of samples) {
      const key = s.suggestionType ?? 'unknown';
      if (!stats[key]) {
        stats[key] = { accepted: 0, dismissed: 0 };
      }
      if (s.accepted) {
        stats[key].accepted += 1;
      } else {
        stats[key].dismissed += 1;
      }
    }

    const acceptedThemes = Object.entries(stats)
      .filter(([, v]) => v.accepted > v.dismissed)
      .map(([k]) => k);
    const refusedThemes = Object.entries(stats)
      .filter(([, v]) => v.dismissed > v.accepted)
      .map(([k]) => k);

    const parts: string[] = [];
    if (acceptedThemes.length) {
      parts.push(`User tends to accept: ${acceptedThemes.join(', ')}.`);
    }
    if (refusedThemes.length) {
      parts.push(`User tends to refuse: ${refusedThemes.join(', ')}.`);
    }

    return parts.length ? parts.join(' ') : null;
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

  async handleFeedback(params: {
    suggestionId: string;
    action: 'accepted' | 'dismissed';
    userId?: string | null;
    message?: string | null;
    type?: string | null;
  }): Promise<void> {
    const {
      suggestionId,
      action,
      userId: bodyUserId,
      message: bodyMessage,
      type: bodyType,
    } = params;

    if (!suggestionId || typeof suggestionId !== 'string') {
      throw new BadRequestException('suggestionId is required.');
    }

    const accepted = action === 'accepted';

    // 1) Toujours enregistrer le feedback dans assistant_feedback (contrat Flutter + apprentissage)
    await this.assistantFeedbackModel.create({
      suggestionId: suggestionId.trim(),
      action,
      userId: bodyUserId?.trim() ?? null,
      message: bodyMessage?.trim() ?? null,
      type: bodyType?.trim() ?? null,
    });

    const isMongoId = /^[a-fA-F0-9]{24}$/.test(suggestionId.trim());
    const suggestion = isMongoId
      ? await this.suggestionModel.findById(suggestionId).exec()
      : null;

    if (suggestion) {
      // 2) Si la suggestion existe en base : mettre à jour statut, habits, logs, training, profil ML
      if (suggestion.status === 'pending') {
        suggestion.status = accepted ? 'accepted' : 'dismissed';
        await suggestion.save();

        await this.updateHabit(suggestion.userId, suggestion.type, accepted);

        const now = new Date();
        await this.interactionLogModel.create({
          userId: suggestion.userId,
          suggestionType: suggestion.type,
          action,
          timeOfDay: now.getHours(),
          dayOfWeek: now.getDay(),
        });

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
            accepted,
          });
          await this.maybeTriggerRetrain(suggestion.userId, now);
        }

        await this.updateAssistantUserProfile(
          suggestion.userId,
          suggestion.type,
          accepted,
          suggestion.message,
        );
      }
      return;
    }

    // 3) Pas de document suggestion en base (ex. id client openai_*) : mettre à jour le profil ML si on a userId
    const userId = bodyUserId?.trim();
    if (userId) {
      await this.updateAssistantUserProfile(
        userId,
        bodyType?.trim() || 'other',
        accepted,
        bodyMessage?.trim() || '',
      );
    }
  }

  /**
   * When a user already has enough accepted training samples (e.g. from seed),
   * trigger ML retrain on first context request so mlTrained becomes true without requiring feedback.
   */
  private async autoTrainIfNeeded(userId: string): Promise<void> {
    const user = await this.userModel.findOne({ userId }).exec();
    if (!user) {
      return;
    }
    if (user.mlTrained === true) {
      return;
    }
    const acceptedCount = await this.trainingSampleModel
      .countDocuments({ userId, accepted: true })
      .exec();
    if (acceptedCount < ACCEPTED_THRESHOLD) {
      return;
    }
    try {
      await this.mlService.retrain(userId);
      console.log('ML model retrained successfully for user:', userId);
      const now = new Date();
      await this.userModel
        .updateOne(
          { userId },
          { $set: { mlTrained: true, lastTrainingAt: now } },
        )
        .exec();
    } catch {
      // Avoid crashing context flow; retrain can be retried on next request
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
      await this.mlService.retrain(userId);
      console.log('ML model retrained successfully for user:', userId);
      await this.userModel
        .updateOne(
          { userId },
          { $set: { mlTrained: true, lastTrainingAt: now } },
        )
        .exec();
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

  private async updateAssistantUserProfile(
    userId: string,
    type: string,
    accepted: boolean,
    message: string,
  ): Promise<void> {
    const now = new Date();

    let profile = await this.assistantUserProfileModel
      .findOne({ userId })
      .exec();

    if (!profile) {
      profile = new this.assistantUserProfileModel({
        userId,
        acceptedTypes: [],
        dismissedTypes: [],
        acceptedExamples: [],
        dismissedExamples: [],
        lastUpdatedAt: now,
      });
    }

    const acceptedTypes = new Set(profile.acceptedTypes ?? []);
    const dismissedTypes = new Set(profile.dismissedTypes ?? []);

    if (accepted) {
      acceptedTypes.add(type);
    } else {
      dismissedTypes.add(type);
    }

    profile.acceptedTypes = Array.from(acceptedTypes);
    profile.dismissedTypes = Array.from(dismissedTypes);

    const snippet =
      typeof message === 'string'
        ? message.length > 160
          ? `${message.slice(0, 157)}...`
          : message
        : '';

    if (snippet) {
      const field = accepted ? 'acceptedExamples' : 'dismissedExamples';
      const current = (profile as any)[field] as string[] | undefined;
      const updated = Array.from(new Set([snippet, ...(current ?? [])])).slice(
        0,
        20,
      );
      (profile as any)[field] = updated;
    }

    profile.lastUpdatedAt = now;
    await profile.save();
  }
}


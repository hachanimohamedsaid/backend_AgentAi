import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AssistantService } from './assistant.service';
import { CreateContextDto } from './dto/create-context.dto';
import { AssistantFeedbackDto } from './dto/feedback.dto';
import { GenerateNotificationsDto } from './dto/generate-notifications.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  /**
   * Assistant / suggestions – POST /assistant/context
   *
   * But: générer 3 questions de suggestion personnalisées à partir
   * de toutes les données de l’utilisateur (contexte temps/météo + données MongoDB).
   *
   * Body attendu depuis Flutter:
   * {
   *   "userId": "USER_ID",
   *   "time": "HH:mm",
   *   "location": "home|work|outside",
   *   "weather": "sunny|cloudy|rain",
   *   "focusHours": 1,
   *   "meetings": [ { "title": "...", "time": "HH:mm" } ]
   * }
   */
  @Post('context')
  @UseGuards(OptionalJwtAuthGuard)
  async handleContext(
    @Body() dto: CreateContextDto,
    @Req() req: Request,
  ) {
    const authUser = (req as any).user as
      | { sub?: string; id?: string; userId?: string }
      | undefined;
    const resolvedUserId =
      authUser?.userId ?? authUser?.id ?? authUser?.sub ?? dto.userId;

    const effectiveDto: CreateContextDto = {
      ...dto,
      userId: resolvedUserId,
    };

    // Conserve la logique existante (contexte + ML / suggestions enregistrées)
    // pour le tracking et le training, mais les questions affichées au front
    // viennent de l'IA AVA (OpenAI) via generateContextQuestions.
    await this.assistantService.saveContextAndGenerateSuggestions(effectiveDto);

    // Generate AVA (OpenAI) questions and persist them so feedback can be learned
    const avaSuggestionDocs =
      await this.assistantService.generateAndStoreAvaSuggestions(effectiveDto);

    return avaSuggestionDocs.slice(0, 3).map((s) => {
      const obj = s.toJSON ? (s.toJSON() as any) : (s as any);
      return {
        id: obj.id ?? obj._id?.toString(),
        type: s.type,
        message: s.message,
        confidence: s.confidence,
      };
    });
  }

  @Get('suggestions/:userId')
  async getSuggestions(@Param('userId') userId: string) {
    const suggestions =
      await this.assistantService.getTodayPendingSuggestions(userId);
    return suggestions.map((s) => (s.toJSON ? s.toJSON() : (s as any)));
  }

  @Post('feedback')
  @UseGuards(OptionalJwtAuthGuard)
  async feedback(@Body() dto: AssistantFeedbackDto, @Req() req: Request) {
    const authUser = (req as any).user as
      | { sub?: string; id?: string; userId?: string }
      | undefined;
    const resolvedUserId =
      dto.userId?.trim() ||
      authUser?.userId ||
      authUser?.id ||
      authUser?.sub ||
      undefined;
    await this.assistantService.handleFeedback({
      suggestionId: dto.suggestionId,
      action: dto.action,
      userId: resolvedUserId,
      message: dto.message,
      type: dto.type,
    });
    return { ok: true };
  }

  /**
   * Assistant / notifications – POST /assistant/notifications
   *
   * Body attendu:
   * {
   *   "userId": "USER_ID",
   *   "locale": "fr-TN",
   *   "timezone": "Africa/Tunis",
   *   "tone": "professional",
   *   "maxItems": 5,
   *   "signals": [
   *     { "signalType": "MEETING_SOON", "payload": { "title": "...", "startsInMin": 15, "location": "..." } }
   *   ]
   * }
   */
  @Post('notifications')
  @UseGuards(OptionalJwtAuthGuard)
  async notifications(@Body() dto: GenerateNotificationsDto, @Req() req: Request) {
    const authUser = (req as any).user as
      | { sub?: string; id?: string; userId?: string }
      | undefined;
    const resolvedUserId =
      authUser?.userId ?? authUser?.id ?? authUser?.sub ?? dto.userId;

    const effectiveDto: GenerateNotificationsDto = {
      ...dto,
      userId: resolvedUserId,
    };

    return this.assistantService.generateNotifications(effectiveDto);
  }
}


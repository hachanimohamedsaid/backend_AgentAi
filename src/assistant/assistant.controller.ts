import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { CreateContextDto } from './dto/create-context.dto';
import { AssistantFeedbackDto } from './dto/feedback.dto';

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
  async handleContext(@Body() dto: CreateContextDto) {
    // Conserve la logique existante (contexte + ML / suggestions enregistrées)
    // pour le tracking et le training, mais les questions affichées au front
    // viennent de l'IA AVA (OpenAI) via generateContextQuestions.
    await this.assistantService.saveContextAndGenerateSuggestions(dto);

    const suggestions =
      await this.assistantService.generateContextQuestions(dto);
    return {
      suggestions,
    };
  }

  @Get('suggestions/:userId')
  async getSuggestions(@Param('userId') userId: string) {
    const suggestions =
      await this.assistantService.getTodayPendingSuggestions(userId);
    return suggestions.map((s) => (s.toJSON ? s.toJSON() : (s as any)));
  }

  @Post('feedback')
  async feedback(@Body() dto: AssistantFeedbackDto) {
    await this.assistantService.handleFeedback(
      dto.suggestionId,
      dto.action,
    );
    return { ok: true };
  }
}


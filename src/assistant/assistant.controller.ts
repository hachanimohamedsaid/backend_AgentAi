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

  @Post('context')
  async handleContext(@Body() dto: CreateContextDto) {
    const suggestions =
      await this.assistantService.saveContextAndGenerateSuggestions(dto);
    return {
      suggestions: suggestions.map((s) =>
        s.toJSON ? s.toJSON() : (s as any),
      ),
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


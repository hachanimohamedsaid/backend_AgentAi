import { Body, Controller, Post, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AiService, ChatResponse } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Talk to buddy (assistant vocal / chat).
   * Body : { "messages": [ { "role": "system"|"user"|"assistant", "content": "..." } ] }.
   * Si l'utilisateur est connecté, le frontend envoie Authorization: Bearer <accessToken> ; le backend peut alors identifier l'utilisateur.
   * Réponse : { "message": "..." } (réponse IA).
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  async chat(
    @Body() dto: ChatDto,
    @CurrentUser() user: UserDocument | undefined,
  ): Promise<ChatResponse> {
    return this.aiService.chat(dto.messages, user);
  }
}

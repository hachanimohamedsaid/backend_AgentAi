import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { AiService, ChatResponse } from './ai.service';
import { ChatDto } from './dto/chat.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Talk to buddy (assistant vocal / chat).
   * Body : { "messages": [ { "role": "user" | "assistant", "content": "..." } ] }.
   * Réponse : { "message": "..." } (réponse IA).
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatDto): Promise<ChatResponse> {
    return this.aiService.chat(dto.messages);
  }
}

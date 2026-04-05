import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { GuestStartDto } from './dto/guest-start.dto';
import { GuestMessageDto } from './dto/guest-message.dto';
import { GuestCompleteDto } from './dto/guest-complete.dto';
import { GuestTokenService } from './guest-token.service';
import { InterviewsService } from './interviews.service';

/**
 * Routes publiques (sans JWT recruteur) — candidat invité.
 * Sécurisées par un guest token signé HMAC/JWT (court, expirant).
 * Préfixe : /interviews/guest
 */
@Controller('interviews/guest')
export class InterviewsGuestController {
  constructor(
    private readonly interviewsService: InterviewsService,
    private readonly guestTokenService: GuestTokenService,
  ) {}

  /**
   * POST /interviews/guest/start
   * Body: { token: "<signed_guest_token>" }
   * Réponse: { sessionId, assistantMessage }
   */
  @Post('start')
  async start(@Body() dto: GuestStartDto) {
    const payload = this.guestTokenService.verify(dto.token);
    return this.interviewsService.startGuest(payload);
  }

  /**
   * POST /interviews/guest/:sessionId/message
   * Body: { token: "...", content: "..." }
   * Réponse: { assistantMessage }
   */
  @Post(':sessionId/message')
  async message(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: GuestMessageDto,
  ) {
    return this.interviewsService.postMessageGuest(sessionId, dto.token, dto.content);
  }

  /**
   * POST /interviews/guest/:sessionId/complete
   * Body: { token: "..." }
   * Réponse: { summary }
   */
  @Post(':sessionId/complete')
  async complete(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: GuestCompleteDto,
  ) {
    return this.interviewsService.completeGuest(sessionId, dto.token);
  }
}

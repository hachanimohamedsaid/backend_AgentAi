import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { GuestStartDto } from './dto/guest-start.dto';
import { GuestMessageDto } from './dto/guest-message.dto';
import { GuestCompleteDto } from './dto/guest-complete.dto';
import { ProctorEventsDto } from './dto/proctor-events.dto';
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
   * Headers: Authorization: Bearer <guest_token>  (ou body.token)
   * Body: { token?: "..." }
   * Réponse: { sessionId, assistantMessage }
   */
  @Post('start')
  async start(
    @Body() dto: GuestStartDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const token = this.interviewsService.extractGuestToken(authHeader, dto.token);
    const payload = this.guestTokenService.verify(token);
    return this.interviewsService.startGuest(payload);
  }

  /**
   * POST /interviews/guest/:sessionId/message
   * Headers: Authorization: Bearer <guest_token>  (ou body.token)
   * Body: { content: "...", token?: "..." }
   * Réponse: { assistantMessage }
   */
  @Post(':sessionId/message')
  async message(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: GuestMessageDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const token = this.interviewsService.extractGuestToken(authHeader, dto.token);
    return this.interviewsService.postMessageGuest(sessionId, token, dto.content);
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
    @Headers('authorization') authHeader?: string,
  ) {
    const token = this.interviewsService.extractGuestToken(authHeader, dto.token);
    return this.interviewsService.completeGuest(sessionId, token);
  }

  /**
   * POST /interviews/guest/:sessionId/proctoring-events
   * Headers: Authorization: Bearer <guest_token>  (ou body.token en fallback)
   * Body: { events: [{ type, ts, clientEventId?, durationMs?, count? }], token? }
   * Réponse: { accepted: N, deduplicated: M }
   *
   * Enregistre des événements de proctoring textuel (pas de flux vidéo).
   * Types acceptés : honesty_attestation | session_proctoring_started |
   *   face_absent | multiple_faces | visibility_hidden | app_backgrounded
   */
  @Post(':sessionId/proctoring-events')
  @HttpCode(HttpStatus.OK)
  async proctoringEvents(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: ProctorEventsDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const token = this.interviewsService.extractGuestToken(authHeader, dto.token);
    return this.interviewsService.appendProctoringEvents(sessionId, token, dto.events);
  }
}

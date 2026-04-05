import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GuestInterviewGuard } from './guards/guest-interview.guard';
import { GuestPayload } from './decorators/guest-payload.decorator';
import type { GuestTokenPayload } from './guest-token.service';
import { GuestStartDto } from './dto/guest-start.dto';
import { InterviewMessageDto } from './dto/interview-message.dto';
import { ProctorEventsDto } from './dto/proctor-events.dto';
import { InterviewsService } from './interviews.service';

/**
 * Routes candidat invité — authentification par guest JWT (Authorization: Bearer <guest_jwt>).
 * Guard : GuestInterviewGuard (stratégie Passport 'interview-guest').
 *   → 401 token absent / invalide / expiré
 *   → 403 token valide mais sessionId ne correspond pas (géré dans le service)
 * Aucun accès aux handlers recruteur (JwtAuthGuard) — stratégies séparées.
 */
@Controller('interviews/guest')
@UseGuards(GuestInterviewGuard)
export class InterviewsGuestController {
  constructor(private readonly interviewsService: InterviewsService) {}

  /**
   * POST /interviews/guest/start
   * Headers : Authorization: Bearer <guest_jwt>
   * Body : { sessionId? }  — si fourni, tente de reprendre la session existante
   * Réponse : { sessionId, assistantMessage }
   */
  @Post('start')
  async start(
    @GuestPayload() payload: GuestTokenPayload,
    @Body() dto: GuestStartDto,
  ) {
    return this.interviewsService.startGuest(payload, dto.sessionId);
  }

  /**
   * POST /interviews/guest/:sessionId/message
   * Headers : Authorization: Bearer <guest_jwt>
   * Body : { content: "texte candidat" }
   * Réponse : { assistantMessage }
   */
  @Post(':sessionId/message')
  async message(
    @GuestPayload() payload: GuestTokenPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: InterviewMessageDto,
  ) {
    return this.interviewsService.postMessageGuest(sessionId, payload, dto.content);
  }

  /**
   * POST /interviews/guest/:sessionId/complete
   * Headers : Authorization: Bearer <guest_jwt>
   * Body : {}
   * Réponse : { summary }
   */
  @Post(':sessionId/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @GuestPayload() payload: GuestTokenPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.interviewsService.completeGuest(sessionId, payload);
  }

  /**
   * POST /interviews/guest/:sessionId/proctoring-events
   * Headers : Authorization: Bearer <guest_jwt>
   * Body : { events: [...] }
   * Réponse : { accepted: N, deduplicated: M }
   */
  @Post(':sessionId/proctoring-events')
  @HttpCode(HttpStatus.OK)
  async proctoringEvents(
    @GuestPayload() payload: GuestTokenPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: ProctorEventsDto,
  ) {
    return this.interviewsService.appendProctoringEvents(sessionId, payload, dto.events);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { StartInterviewDto } from './dto/start-interview.dto';
import { InterviewMessageDto } from './dto/interview-message.dto';
import { GenerateInviteDto } from './dto/generate-invite.dto';
import { SendInviteEmailDto } from './dto/send-invite-email.dto';
import { InterviewsService } from './interviews.service';

@Controller('interviews')
@UseGuards(JwtAuthGuard)
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  // ─── Routes recruteur ────────────────────────────────────────────────────

  /**
   * POST /interviews/start
   * Crée une session d'entretien pour un candidat (recruteur connecté).
   */
  @Post('start')
  async start(@Request() req: { user: UserDocument }, @Body() dto: StartInterviewDto) {
    return this.interviewsService.start(req.user, dto);
  }

  /**
   * POST /interviews/generate-invite
   * Génère un lien signé à envoyer au candidat (accès public /guest-interview?token=...).
   */
  @Post('generate-invite')
  @HttpCode(HttpStatus.OK)
  async generateInvite(@Body() dto: GenerateInviteDto) {
    return this.interviewsService.generateInvite(dto);
  }

  /**
   * POST /interviews/send-invite-email
   * Envoie l'e-mail d'invitation entretien au candidat via Resend.
   * Body: { to, guestInterviewUrl, evaluationId?, candidateName?, jobTitle? }
   */
  @Post('send-invite-email')
  @HttpCode(HttpStatus.OK)
  async sendInviteEmail(@Body() dto: SendInviteEmailDto) {
    return this.interviewsService.sendInviteEmail(dto);
  }

  /**
   * GET /interviews/by-evaluation/:evaluationId
   * Retourne toutes les sessions (guest + directes) liées à une évaluation.
   * Permet au recruteur de voir le transcript et la synthèse du candidat.
   */
  @Get('by-evaluation/:evaluationId')
  async byEvaluation(@Param('evaluationId') evaluationId: string) {
    const sessions = await this.interviewsService.findByEvaluationId(evaluationId);
    return sessions.map((s) => ({
      sessionId: s.sessionId,
      isGuest: s.isGuest,
      candidateName: s.candidateName,
      jobTitle: s.jobTitle,
      status: s.completedAt ? 'completed' : 'in_progress',
      summary: s.summary,
      transcript: s.messages.map((m) => ({ role: m.role, content: m.content, at: m.at })),
      proctoringEvents: s.proctoringEvents.map((e) => ({
        type: e.type,
        ts: e.ts,
        clientEventId: e.clientEventId,
        durationMs: e.durationMs,
        count: e.count,
        receivedAt: e.receivedAt,
      })),
      createdAt: (s as any).createdAt,
      completedAt: s.completedAt,
    }));
  }

  // ─── Routes avec sessionId ────────────────────────────────────────────────

  /** POST /interviews/:sessionId/message */
  @Post(':sessionId/message')
  async message(
    @Request() req: { user: UserDocument },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: InterviewMessageDto,
  ) {
    return this.interviewsService.postMessage(sessionId, req.user, dto);
  }

  /** POST /interviews/:sessionId/complete */
  @Post(':sessionId/complete')
  async complete(
    @Request() req: { user: UserDocument },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.interviewsService.complete(sessionId, req.user);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { UserDocument } from '../users/schemas/user.schema';
import {
  InterviewSession,
  InterviewSessionDocument,
} from './schemas/interview-session.schema';
import { StartInterviewDto } from './dto/start-interview.dto';
import { InterviewMessageDto } from './dto/interview-message.dto';
import { GenerateInviteDto } from './dto/generate-invite.dto';
import { SendInviteEmailDto } from './dto/send-invite-email.dto';
import {
  buildInterviewKickoffUserMessage,
  InterviewGeminiService,
} from './interview-gemini.service';
import { GuestTokenPayload, GuestTokenService } from './guest-token.service';
import { ProctoringEventDto } from './dto/proctor-events.dto';

const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7; // 7 jours

@Injectable()
export class InterviewsService {
  constructor(
    @InjectModel(InterviewSession.name)
    private readonly sessionModel: Model<InterviewSessionDocument>,
    private readonly gemini: InterviewGeminiService,
    private readonly configService: ConfigService,
    private readonly guestTokenService: GuestTokenService,
  ) {}

  private userObjectId(user: UserDocument): Types.ObjectId {
    const id = user._id;
    if (id instanceof Types.ObjectId) return id;
    return new Types.ObjectId(String(id));
  }

  private ttlMs(): number {
    const raw = this.configService.get<string>('INTERVIEW_SESSION_TTL_SECONDS');
    const sec = raw ? parseInt(raw, 10) : DEFAULT_TTL_SEC;
    const s = Number.isFinite(sec) && sec > 60 ? sec : DEFAULT_TTL_SEC;
    return s * 1000;
  }

  private contextLines(dto: Partial<StartInterviewDto>): string[] {
    const lines: string[] = [];
    if (dto.evaluationId?.trim()) lines.push(`ID évaluation : ${dto.evaluationId.trim()}`);
    if (dto.candidateName?.trim()) lines.push(`Candidat : ${dto.candidateName.trim()}`);
    if (dto.jobTitle?.trim()) lines.push(`Intitulé du poste : ${dto.jobTitle.trim()}`);
    if (dto.jobId?.trim()) lines.push(`ID poste : ${dto.jobId.trim()}`);
    return lines;
  }

  // ─── Recruteur (JWT) ──────────────────────────────────────────────────────

  async start(user: UserDocument, dto: StartInterviewDto) {
    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs());
    const userKick = buildInterviewKickoffUserMessage(this.contextLines(dto));
    const assistantMessage = await this.gemini.firstAssistantMessage(userKick);

    await this.sessionModel.create({
      sessionId,
      userId: this.userObjectId(user),
      isGuest: false,
      guestTokenSub: null,
      evaluationId: dto.evaluationId,
      candidateName: dto.candidateName,
      jobTitle: dto.jobTitle,
      jobId: dto.jobId,
      messages: [
        { role: 'user', content: userKick, at: now },
        { role: 'model', content: assistantMessage, at: new Date() },
      ],
      summary: null,
      completedAt: null,
      expiresAt,
    });

    return { sessionId, assistantMessage };
  }

  private async getSessionForUser(
    sessionId: string,
    user: UserDocument,
  ): Promise<InterviewSessionDocument> {
    const userId = this.userObjectId(user);
    const doc = await this.sessionModel.findOne({ sessionId }).exec();
    if (!doc || !doc.userId || !doc.userId.equals(userId)) {
      throw new NotFoundException('Session introuvable');
    }
    return doc;
  }

  async postMessage(sessionId: string, user: UserDocument, dto: InterviewMessageDto) {
    const doc = await this.getSessionForUser(sessionId, user);
    if (doc.completedAt) {
      throw new BadRequestException('Cette session est clôturée ; envoyez un nouvel entretien.');
    }
    const userLine = dto.content.trim();
    if (!userLine) throw new BadRequestException('Le message ne peut pas être vide');

    const prior = doc.messages.map((m) => ({ role: m.role, content: m.content }));
    const assistantMessage = await this.gemini.continueConversation(prior, userLine);

    doc.messages.push({ role: 'user', content: userLine, at: new Date() });
    doc.messages.push({ role: 'model', content: assistantMessage, at: new Date() });
    await doc.save();
    return { assistantMessage };
  }

  async complete(sessionId: string, user: UserDocument) {
    const doc = await this.getSessionForUser(sessionId, user);
    if (doc.summary?.trim() && doc.completedAt) return { summary: doc.summary.trim() };

    const transcript = doc.messages
      .map((m) => `${m.role === 'user' ? 'Candidat' : 'Recruteur'} : ${m.content}`)
      .join('\n\n');
    const summary = await this.gemini.summarizeConversation(transcript);
    doc.summary = summary;
    doc.completedAt = new Date();
    await doc.save();
    return { summary };
  }

  generateInvite(dto: GenerateInviteDto): { token: string; link: string } {
    const token = this.guestTokenService.sign(
      { sub: dto.evaluationId, candidateName: dto.candidateName, jobTitle: dto.jobTitle, email: dto.email },
      dto.ttlDays ?? 7,
    );
    const base = (this.configService.get<string>('FRONTEND_GUEST_INTERVIEW_URL') ?? '').replace(/\/+$/, '');
    const link = base ? `${base}?token=${token}` : `?token=${token}`;
    return { token, link };
  }

  async findByEvaluationId(evaluationId: string): Promise<InterviewSessionDocument[]> {
    return this.sessionModel.find({ evaluationId }).sort({ createdAt: -1 }).exec();
  }

  async sendInviteEmail(dto: SendInviteEmailDto): Promise<{ sent: boolean; messageId?: string }> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) throw new BadRequestException('RESEND_API_KEY non configurée sur le serveur.');

    const from = this.configService.get<string>('EMAIL_FROM') ?? 'onboarding@resend.dev';
    const candidate = dto.candidateName?.trim() || 'Candidat';
    const job = dto.jobTitle?.trim() || 'ce poste';

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
<tr><td style="background:#0d1b2a;padding:28px 40px"><h1 style="color:#fff;margin:0;font-size:22px">Ava — Invitation à un entretien</h1></td></tr>
<tr><td style="padding:36px 40px;color:#222">
  <p style="font-size:16px;margin-top:0">Bonjour <strong>${candidate}</strong>,</p>
  <p style="font-size:15px;line-height:1.6">Vous êtes invité(e) à passer un entretien en ligne pour <strong>${job}</strong>. L'entretien est conduit par notre assistant IA et prend environ 20 à 30 minutes.</p>
  <p style="text-align:center;margin:32px 0"><a href="${dto.guestInterviewUrl}" style="background:#00b4d8;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block">Démarrer l'entretien</a></p>
  <p style="font-size:13px;color:#666;word-break:break-all">Lien direct : <a href="${dto.guestInterviewUrl}" style="color:#00b4d8">${dto.guestInterviewUrl}</a></p>
  ${dto.evaluationId ? `<p style="font-size:12px;color:#aaa;margin-bottom:0">Réf. : ${dto.evaluationId}</p>` : ''}
</td></tr>
<tr><td style="background:#f0f4f8;padding:16px 40px;font-size:12px;color:#999;text-align:center">Ce lien est personnel. Ne le partagez pas.</td></tr>
</table></td></tr></table></body></html>`.trim();

    const resend = new Resend(apiKey);
    try {
      const result = await resend.emails.send({ from, to: dto.to, subject: `Invitation à votre entretien — ${job}`, html });
      return { sent: true, messageId: result.data?.id };
    } catch (err: unknown) {
      throw new BadRequestException(`Échec envoi Resend : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Invité / Guest (GuestInterviewGuard) ────────────────────────────────

  /**
   * Démarre une nouvelle session OU reprend une session existante (si sessionId fourni).
   * 401 → guard (token absent/invalide/expiré).
   * 403 → sessionId fourni mais appartient à un autre token sub.
   */
  async startGuest(
    payload: GuestTokenPayload,
    resumeSessionId?: string,
  ): Promise<{ sessionId: string; assistantMessage: string }> {
    // Tentative de reprise
    if (resumeSessionId) {
      const existing = await this.sessionModel.findOne({ sessionId: resumeSessionId }).exec();
      if (existing) {
        if (existing.guestTokenSub !== payload.sub) {
          throw new ForbiddenException(
            'Ce sessionId ne correspond pas à votre token invité.',
          );
        }
        // Retourne le dernier message assistant
        const lastAssistant = [...existing.messages]
          .reverse()
          .find((m) => m.role === 'model');
        return {
          sessionId: existing.sessionId,
          assistantMessage: lastAssistant?.content ?? '',
        };
      }
    }

    // Nouvelle session
    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs());
    const userKick = buildInterviewKickoffUserMessage(
      this.contextLines({ evaluationId: payload.sub, candidateName: payload.candidateName, jobTitle: payload.jobTitle }),
    );
    const assistantMessage = await this.gemini.firstAssistantMessage(userKick);

    await this.sessionModel.create({
      sessionId,
      userId: null,
      isGuest: true,
      guestTokenSub: payload.sub,
      evaluationId: payload.sub,
      candidateName: payload.candidateName,
      jobTitle: payload.jobTitle,
      messages: [
        { role: 'user', content: userKick, at: now },
        { role: 'model', content: assistantMessage, at: new Date() },
      ],
      summary: null,
      completedAt: null,
      expiresAt,
    });

    return { sessionId, assistantMessage };
  }

  /**
   * 401 → guard. 403 → sessionId appartient à un autre sub. 400 → session clôturée.
   */
  private async getSessionForGuest(
    sessionId: string,
    tokenSub: string,
  ): Promise<InterviewSessionDocument> {
    const doc = await this.sessionModel.findOne({ sessionId }).exec();
    if (!doc || !doc.isGuest) throw new NotFoundException('Session introuvable.');
    if (doc.guestTokenSub !== tokenSub) {
      throw new ForbiddenException(
        'Ce sessionId ne correspond pas à votre token invité.',
      );
    }
    return doc;
  }

  async postMessageGuest(
    sessionId: string,
    payload: GuestTokenPayload,
    content: string,
  ): Promise<{ assistantMessage: string }> {
    const doc = await this.getSessionForGuest(sessionId, payload.sub);
    if (doc.completedAt) throw new BadRequestException('Session clôturée.');
    const userLine = content.trim();
    if (!userLine) throw new BadRequestException('Message vide.');

    const prior = doc.messages.map((m) => ({ role: m.role, content: m.content }));
    const assistantMessage = await this.gemini.continueConversation(prior, userLine);
    doc.messages.push({ role: 'user', content: userLine, at: new Date() });
    doc.messages.push({ role: 'model', content: assistantMessage, at: new Date() });
    await doc.save();
    return { assistantMessage };
  }

  async completeGuest(
    sessionId: string,
    payload: GuestTokenPayload,
  ): Promise<{ summary: string }> {
    const doc = await this.getSessionForGuest(sessionId, payload.sub);
    if (doc.summary?.trim() && doc.completedAt) return { summary: doc.summary.trim() };

    const transcript = doc.messages
      .map((m) => `${m.role === 'user' ? 'Candidat' : 'Recruteur'} : ${m.content}`)
      .join('\n\n');
    const summary = await this.gemini.summarizeConversation(transcript);
    doc.summary = summary;
    doc.completedAt = new Date();
    await doc.save();
    return { summary };
  }

  async appendProctoringEvents(
    sessionId: string,
    payload: GuestTokenPayload,
    events: ProctoringEventDto[],
  ): Promise<{ accepted: number; deduplicated: number }> {
    const doc = await this.getSessionForGuest(sessionId, payload.sub);

    const receivedAt = new Date();
    const existingClientIds = new Set(
      doc.proctoringEvents.map((e) => e.clientEventId).filter((id): id is string => !!id),
    );

    let deduplicated = 0;
    const toAppend: typeof doc.proctoringEvents = [];

    for (const ev of events) {
      if (ev.clientEventId && existingClientIds.has(ev.clientEventId)) {
        deduplicated++;
        continue;
      }
      toAppend.push({
        type: ev.type,
        ts: new Date(ev.ts),
        clientEventId: ev.clientEventId ?? null,
        durationMs: ev.durationMs ?? null,
        count: ev.count ?? null,
        receivedAt,
      });
      if (ev.clientEventId) existingClientIds.add(ev.clientEventId);
    }

    if (toAppend.length > 0) {
      doc.proctoringEvents.push(...toAppend);
      await doc.save();
    }

    return { accepted: toAppend.length, deduplicated };
  }
}

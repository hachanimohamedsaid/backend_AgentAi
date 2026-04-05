import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { UserDocument } from '../users/schemas/user.schema';
import {
  InterviewSession,
  InterviewSessionDocument,
} from './schemas/interview-session.schema';
import { StartInterviewDto } from './dto/start-interview.dto';
import { InterviewMessageDto } from './dto/interview-message.dto';
import { GenerateInviteDto } from './dto/generate-invite.dto';
import {
  buildInterviewKickoffUserMessage,
  InterviewGeminiService,
} from './interview-gemini.service';
import { GuestTokenPayload, GuestTokenService } from './guest-token.service';

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

  // ─── Routes recruteur (JWT) ───────────────────────────────────────────────

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

  async postMessage(
    sessionId: string,
    user: UserDocument,
    dto: InterviewMessageDto,
  ) {
    const doc = await this.getSessionForUser(sessionId, user);
    if (doc.completedAt) {
      throw new BadRequestException('Cette session est clôturée ; envoyez un nouvel entretien.');
    }

    const userLine = dto.content.trim();
    if (!userLine) {
      throw new BadRequestException('Le message ne peut pas être vide');
    }

    const prior = doc.messages.map((m) => ({ role: m.role, content: m.content }));
    const assistantMessage = await this.gemini.continueConversation(prior, userLine);

    const t1 = new Date();
    const t2 = new Date();
    doc.messages.push({ role: 'user', content: userLine, at: t1 });
    doc.messages.push({ role: 'model', content: assistantMessage, at: t2 });
    await doc.save();

    return { assistantMessage };
  }

  async complete(sessionId: string, user: UserDocument) {
    const doc = await this.getSessionForUser(sessionId, user);

    if (doc.summary?.trim() && doc.completedAt) {
      return { summary: doc.summary.trim() };
    }

    const transcript = doc.messages
      .map((m) => `${m.role === 'user' ? 'Candidat' : 'Recruteur'} : ${m.content}`)
      .join('\n\n');

    const summary = await this.gemini.summarizeConversation(transcript);
    doc.summary = summary;
    doc.completedAt = new Date();
    await doc.save();

    return { summary };
  }

  /** Génère un lien signé d'invitation candidat (7 jours par défaut). */
  generateInvite(dto: GenerateInviteDto): { token: string; link: string } {
    const token = this.guestTokenService.sign(
      {
        sub: dto.evaluationId,
        candidateName: dto.candidateName,
        jobTitle: dto.jobTitle,
        email: dto.email,
      },
      dto.ttlDays ?? 7,
    );
    const base = (
      this.configService.get<string>('FRONTEND_GUEST_INTERVIEW_URL') ?? ''
    ).replace(/\/+$/, '');
    const link = base ? `${base}?token=${token}` : `?token=${token}`;
    return { token, link };
  }

  /** Retourne toutes les sessions liées à une evaluationId (guest + recruteur), triées par date. */
  async findByEvaluationId(evaluationId: string): Promise<InterviewSessionDocument[]> {
    return this.sessionModel
      .find({ evaluationId })
      .sort({ createdAt: -1 })
      .exec();
  }

  // ─── Routes invité / guest (sans JWT recruteur) ───────────────────────────

  async startGuest(
    payload: GuestTokenPayload,
  ): Promise<{ sessionId: string; assistantMessage: string }> {
    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs());

    const userKick = buildInterviewKickoffUserMessage(
      this.contextLines({
        evaluationId: payload.sub,
        candidateName: payload.candidateName,
        jobTitle: payload.jobTitle,
      }),
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

  private async getSessionForGuest(
    sessionId: string,
    tokenSub: string,
  ): Promise<InterviewSessionDocument> {
    const doc = await this.sessionModel.findOne({ sessionId }).exec();
    if (!doc || !doc.isGuest || doc.guestTokenSub !== tokenSub) {
      throw new NotFoundException('Session introuvable.');
    }
    return doc;
  }

  async postMessageGuest(
    sessionId: string,
    token: string,
    content: string,
  ): Promise<{ assistantMessage: string }> {
    const payload = this.guestTokenService.verify(token);
    const doc = await this.getSessionForGuest(sessionId, payload.sub);

    if (doc.completedAt) {
      throw new BadRequestException('Cette session est clôturée.');
    }
    const userLine = content.trim();
    if (!userLine) throw new BadRequestException('Le message ne peut pas être vide.');

    const prior = doc.messages.map((m) => ({ role: m.role, content: m.content }));
    const assistantMessage = await this.gemini.continueConversation(prior, userLine);

    doc.messages.push({ role: 'user', content: userLine, at: new Date() });
    doc.messages.push({ role: 'model', content: assistantMessage, at: new Date() });
    await doc.save();

    return { assistantMessage };
  }

  async completeGuest(
    sessionId: string,
    token: string,
  ): Promise<{ summary: string }> {
    const payload = this.guestTokenService.verify(token);
    const doc = await this.getSessionForGuest(sessionId, payload.sub);

    if (doc.summary?.trim() && doc.completedAt) {
      return { summary: doc.summary.trim() };
    }

    const transcript = doc.messages
      .map((m) => `${m.role === 'user' ? 'Candidat' : 'Recruteur'} : ${m.content}`)
      .join('\n\n');

    const summary = await this.gemini.summarizeConversation(transcript);
    doc.summary = summary;
    doc.completedAt = new Date();
    await doc.save();

    return { summary };
  }
}

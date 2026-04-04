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
import {
  buildInterviewKickoffUserMessage,
  InterviewGeminiService,
} from './interview-gemini.service';

const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7; // 7 jours

@Injectable()
export class InterviewsService {
  constructor(
    @InjectModel(InterviewSession.name)
    private readonly sessionModel: Model<InterviewSessionDocument>,
    private readonly gemini: InterviewGeminiService,
    private readonly configService: ConfigService,
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

  private contextLines(dto: StartInterviewDto): string[] {
    const lines: string[] = [];
    if (dto.evaluationId?.trim()) lines.push(`ID évaluation : ${dto.evaluationId.trim()}`);
    if (dto.candidateName?.trim()) lines.push(`Candidat : ${dto.candidateName.trim()}`);
    if (dto.jobTitle?.trim()) lines.push(`Intitulé du poste : ${dto.jobTitle.trim()}`);
    if (dto.jobId?.trim()) lines.push(`ID poste : ${dto.jobId.trim()}`);
    return lines;
  }

  async start(user: UserDocument, dto: StartInterviewDto) {
    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs());
    const userKick = buildInterviewKickoffUserMessage(this.contextLines(dto));
    const assistantMessage = await this.gemini.firstAssistantMessage(userKick);

    await this.sessionModel.create({
      sessionId,
      userId: this.userObjectId(user),
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
    if (!doc || !doc.userId.equals(userId)) {
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
}

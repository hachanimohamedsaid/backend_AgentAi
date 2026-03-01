import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { Meeting, MeetingDocument } from './schemas/meeting.schema';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingAgentsService } from './meeting-agents.service';
import { MeetingPdfService } from './meeting-pdf.service';

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    @InjectModel(Meeting.name)
    private readonly meetingModel: Model<MeetingDocument>,
    private readonly meetingAgentsService: MeetingAgentsService,
    private readonly meetingPdfService: MeetingPdfService,
  ) {}

  /**
   * Ensures the meeting exists and belongs to the given user.
   * Call at the start of every meeting operation.
   * @throws NotFoundException if meeting does not exist
   * @throws ForbiddenException if meeting.userId !== userId
   */
  async validateOwnership(
    meetingId: string,
    userId: string,
  ): Promise<MeetingDocument> {
    const meeting = await this.meetingModel.findById(meetingId).exec();
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (meeting.userId !== userId) {
      throw new ForbiddenException('You do not have access to this meeting');
    }
    return meeting;
  }

  /**
   * Returns meeting status for the loading screen (Page 3).
   * If all 5 agent results are non-null, returns 'ready'; otherwise 'pending'.
   * Also returns 'complete' when the report has been generated.
   */
  async getStatus(
    meetingId: string,
    userId: string,
  ): Promise<{ status: 'pending' | 'ready' | 'complete' }> {
    const meeting = await this.validateOwnership(meetingId, userId);
    if (meeting.status === 'complete') {
      return { status: 'complete' };
    }
    const allFiveReady =
      meeting.culturalResult != null &&
      meeting.psychResult != null &&
      meeting.offerResult != null &&
      meeting.imageResult != null &&
      meeting.locationResult != null;
    return {
      status: allFiveReady ? 'ready' : 'pending',
    };
  }

  /**
   * Returns cultural briefing (Page 4). Cache pattern: return stored result or run agent and save.
   */
  async getCultural(
    meetingId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const meeting = await this.validateOwnership(meetingId, userId);
    if (meeting.culturalResult != null) {
      return meeting.culturalResult;
    }
    const result = await this.meetingAgentsService.runCultural(meeting);
    await this.meetingModel
      .updateOne({ _id: meetingId }, { $set: { culturalResult: result } })
      .exec();
    return result;
  }

  /**
   * Returns investor psychological profile (Page 5). Cache pattern.
   */
  async getPsych(
    meetingId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const meeting = await this.validateOwnership(meetingId, userId);
    if (meeting.psychResult != null) {
      return meeting.psychResult;
    }
    const result = await this.meetingAgentsService.runPsych(meeting);
    await this.meetingModel
      .updateOne({ _id: meetingId }, { $set: { psychResult: result } })
      .exec();
    return result;
  }

  /**
   * Returns offer strategy (Page 7). Cache pattern.
   */
  async getOffer(
    meetingId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const meeting = await this.validateOwnership(meetingId, userId);
    if (meeting.offerResult != null) {
      return meeting.offerResult;
    }
    const result = await this.meetingAgentsService.runOffer(meeting);
    await this.meetingModel
      .updateOne({ _id: meetingId }, { $set: { offerResult: result } })
      .exec();
    return result;
  }

  /**
   * Returns executive image coach (Page 8). Cache pattern.
   */
  async getImage(
    meetingId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const meeting = await this.validateOwnership(meetingId, userId);
    if (meeting.imageResult != null) {
      return meeting.imageResult;
    }
    const result = await this.meetingAgentsService.runImage(meeting);
    await this.meetingModel
      .updateOne({ _id: meetingId }, { $set: { imageResult: result } })
      .exec();
    return result;
  }

  /**
   * Returns smart location advisor (Page 9). Cache pattern.
   */
  async getLocation(
    meetingId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const meeting = await this.validateOwnership(meetingId, userId);
    if (meeting.locationResult != null) {
      return meeting.locationResult;
    }
    const result = await this.meetingAgentsService.runLocation(meeting);
    await this.meetingModel
      .updateOne({ _id: meetingId }, { $set: { locationResult: result } })
      .exec();
    return result;
  }

  /**
   * Negotiation: start simulation. Returns investor's opening line and saves it as first entry in negotiationHistory.
   */
  async startNegotiation(
    meetingId: string,
    userId: string,
  ): Promise<{ openingLine: string }> {
    const meeting = await this.validateOwnership(meetingId, userId);
    const history = meeting.negotiationHistory ?? [];
    const firstAssistant = history.find((e) => e.role === 'assistant');
    if (firstAssistant?.content) {
      return { openingLine: firstAssistant.content };
    }
    const openingLine =
      await this.meetingAgentsService.getNegotiationOpening(meeting);
    const newEntry = {
      role: 'assistant' as const,
      content: openingLine,
      timestamp: new Date(),
    };
    await this.meetingModel
      .updateOne(
        { _id: meetingId },
        { $push: { negotiationHistory: newEntry } },
      )
      .exec();
    return { openingLine };
  }

  /**
   * Negotiation: send user message; get investor reply and score (two parallel LLM calls, real-time, no cache).
   * LLM is both opponent (investor) and coach (scorer). Goal: user walks in having already had the hard conversation once.
   */
  async sendNegotiationMessage(
    meetingId: string,
    userId: string,
    userMessage: string,
  ): Promise<{
    investorReply: string;
    confidence_score: number;
    logic_score: number;
    emotional_control_score: number;
    feedback: string;
    color: 'green' | 'amber' | 'red';
    suggested_improvement: string;
  }> {
    const meeting = await this.validateOwnership(meetingId, userId);
    const history = meeting.negotiationHistory ?? [];

    // Append user message
    const userEntry = {
      role: 'user' as const,
      content: userMessage.trim(),
      timestamp: new Date(),
    };
    await this.meetingModel
      .updateOne(
        { _id: meetingId },
        { $push: { negotiationHistory: userEntry } },
      )
      .exec();

    const historyWithUser = [
      ...history.map((e) => ({ role: e.role, content: e.content })),
      { role: 'user' as const, content: userMessage.trim() },
    ];

    // Last assistant message (investor question) for scoring
    const lastAssistant = [...history]
      .reverse()
      .find((e) => e.role === 'assistant');
    const investorQuestion = lastAssistant?.content ?? 'Opening challenge';

    const exchangeNumber = history.filter((e) => e.role === 'user').length + 1;

    const [investorReply, scoreResult] = await Promise.all([
      this.meetingAgentsService.getNegotiationInvestorReply(
        meeting,
        historyWithUser,
      ),
      this.meetingAgentsService.scoreNegotiationResponse(
        investorQuestion,
        userMessage.trim(),
        exchangeNumber,
      ),
    ]);

    const assistantEntry = {
      role: 'assistant' as const,
      content: investorReply,
      timestamp: new Date(),
    };
    const avg =
      (scoreResult.confidence_score +
        scoreResult.logic_score +
        scoreResult.emotional_control_score) /
      3;
    await this.meetingModel
      .updateOne(
        { _id: meetingId },
        {
          $push: { negotiationHistory: assistantEntry },
          $set: {
            negotiationScores: {
              confidence: scoreResult.confidence_score,
              logic: scoreResult.logic_score,
              emotional: scoreResult.emotional_control_score,
              average: Math.round(avg * 10) / 10,
            },
          },
        },
      )
      .exec();

    return {
      investorReply,
      confidence_score: scoreResult.confidence_score,
      logic_score: scoreResult.logic_score,
      emotional_control_score: scoreResult.emotional_control_score,
      feedback: scoreResult.feedback,
      color: scoreResult.color,
      suggested_improvement: scoreResult.suggested_improvement,
    };
  }

  /**
   * Computes readiness score from formula. Backend-only; LLM never decides the number.
   * Formula: 50% negotiation performance, 30% offer fairness, 20% section completion.
   */
  private computeReadinessScore(meeting: MeetingDocument): number {
    const offerScore =
      typeof (meeting.offerResult as any)?.fair_score === 'number'
        ? (meeting.offerResult as any).fair_score
        : 0;
    const scores = meeting.negotiationScores as {
      confidence?: number;
      logic?: number;
      emotional?: number;
    } | null;
    const negotiationAvg =
      scores &&
      [scores.confidence, scores.logic, scores.emotional].every(
        (n) => typeof n === 'number',
      )
        ? ((scores.confidence ?? 0) +
            (scores.logic ?? 0) +
            (scores.emotional ?? 0)) /
          3
        : 0;
    const completed = [
      meeting.culturalResult,
      meeting.psychResult,
      meeting.offerResult,
      meeting.imageResult,
      meeting.locationResult,
    ].filter((r) => r != null).length;
    const completionScore = (completed / 5) * 100;
    return Math.round(
      negotiationAvg * 0.5 + offerScore * 0.3 + completionScore * 0.2,
    );
  }

  /**
   * Computes section status chips from backend rules. Single source of truth.
   */
  private computeSectionStatuses(
    meeting: MeetingDocument,
  ): Record<string, string> {
    const offer = meeting.offerResult as { fair_score?: number } | null;
    const fairScore =
      typeof offer?.fair_score === 'number' ? offer.fair_score : 0;
    const scores = meeting.negotiationScores as {
      confidence?: number;
      logic?: number;
      emotional?: number;
    } | null;
    const negotiationAvg =
      scores &&
      [scores.confidence, scores.logic, scores.emotional].every(
        (n) => typeof n === 'number',
      )
        ? ((scores.confidence ?? 0) +
            (scores.logic ?? 0) +
            (scores.emotional ?? 0)) /
          3
        : 0;

    const offerStatus =
      fairScore >= 78 ? 'strong' : fairScore >= 52 ? 'ready' : 'review';
    const negotiationStatus =
      negotiationAvg >= 80
        ? 'strong'
        : negotiationAvg >= 60
          ? 'ready'
          : 'review';

    return {
      cultural: 'ready',
      psych: 'ready',
      offer: offerStatus,
      image: 'ready',
      location: 'ready',
      negotiation: negotiationStatus,
    };
  }

  /**
   * Executive briefing (Page 10) — the document the entrepreneur reads the morning of the meeting.
   * All five agents have run; negotiation has been practiced. LLM synthesizes everything into one
   * complete document: every section summarized, every status clear, one readiness number, one
   * message from AVA that sends them into the room with confidence. Exportable as PDF to save and
   * read the morning of. They walk in fully prepared.
   */
  async getReport(
    meetingId: string,
    userId: string,
  ): Promise<{
    readinessScore: number;
    sectionStatuses: Record<string, string>;
    cultural_summary?: string;
    profile_summary?: string;
    negotiation_summary?: string;
    offer_summary?: string;
    image_summary?: string;
    location_summary?: string;
    motivational_message?: string;
    overall_verdict?: string;
  }> {
    const meeting = await this.validateOwnership(meetingId, userId);
    const readinessScore = this.computeReadinessScore(meeting);
    const sectionStatuses = this.computeSectionStatuses(meeting);

    if (meeting.reportResult != null) {
      const report = meeting.reportResult;
      return {
        readinessScore: meeting.readinessScore ?? readinessScore,
        sectionStatuses:
          (meeting.sectionStatuses as Record<string, string>) ??
          sectionStatuses,
        cultural_summary: (report.cultural_summary as string) ?? '',
        profile_summary: (report.profile_summary as string) ?? '',
        negotiation_summary: (report.negotiation_summary as string) ?? '',
        offer_summary: (report.offer_summary as string) ?? '',
        image_summary: (report.image_summary as string) ?? '',
        location_summary: (report.location_summary as string) ?? '',
        motivational_message: (report.motivational_message as string) ?? '',
        overall_verdict: (report.overall_verdict as string) ?? '',
      };
    }

    const reportResult = await this.meetingAgentsService.generateReport(
      meeting,
      readinessScore,
      sectionStatuses,
    );

    await this.meetingModel
      .updateOne(
        { _id: meetingId },
        {
          $set: {
            reportResult,
            readinessScore,
            sectionStatuses,
            status: 'complete',
          },
        },
      )
      .exec();

    return {
      readinessScore,
      sectionStatuses,
      cultural_summary: (reportResult.cultural_summary as string) ?? '',
      profile_summary: (reportResult.profile_summary as string) ?? '',
      negotiation_summary: (reportResult.negotiation_summary as string) ?? '',
      offer_summary: (reportResult.offer_summary as string) ?? '',
      image_summary: (reportResult.image_summary as string) ?? '',
      location_summary: (reportResult.location_summary as string) ?? '',
      motivational_message: (reportResult.motivational_message as string) ?? '',
      overall_verdict: (reportResult.overall_verdict as string) ?? '',
    };
  }

  /**
   * Upload a file for the meeting. Stores file on disk, extracts text from PDFs, appends to attachmentTexts.
   * Clears psychResult so next GET /psych re-runs with the new content.
   */
  async addAttachment(
    meetingId: string,
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<{ name: string; url: string; type: string }> {
    const meeting = await this.validateOwnership(meetingId, userId);

    const sanitized =
      file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) ||
      'document';
    const ext =
      path.extname(sanitized) ||
      (file.mimetype === 'application/pdf' ? '.pdf' : '');
    const filename = ext ? sanitized : `${sanitized}.pdf`;
    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      'meetings',
      meetingId,
    );
    const filePath = path.join(uploadDir, filename);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(filePath, file.buffer);

    const relativeUrl = `meetings/${meetingId}/${filename}`;
    const type =
      file.mimetype === 'application/pdf'
        ? 'pdf'
        : file.mimetype.split('/')[0] || 'file';

    let extractedText = '';
    if (file.mimetype === 'application/pdf' && file.buffer.length > 0) {
      try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(file.buffer);
        extractedText =
          data?.text && String(data.text).trim()
            ? `\n\n--- ${file.originalname} ---\n${String(data.text).trim()}`
            : '';
      } catch (err) {
        this.logger.warn('PDF text extraction failed', err);
      }
    }

    const newAttachment = { name: file.originalname, url: relativeUrl, type };
    const updatedAttachments = [...(meeting.attachments ?? []), newAttachment];
    const updatedAttachmentTexts = [meeting.attachmentTexts, extractedText]
      .filter(Boolean)
      .join('');

    await this.meetingModel
      .updateOne(
        { _id: meetingId },
        {
          $set: {
            attachments: updatedAttachments,
            attachmentTexts: updatedAttachmentTexts || null,
            psychResult: null,
          },
        },
      )
      .exec();

    return newAttachment;
  }

  /**
   * Updates meeting form data (partial). Only provided fields are updated.
   */
  async update(
    meetingId: string,
    userId: string,
    dto: Record<string, unknown>,
  ): Promise<MeetingDocument> {
    const meeting = await this.validateOwnership(meetingId, userId);
    const updates: Record<string, unknown> = {};
    const allowed = [
      'investorName',
      'investorCompany',
      'country',
      'city',
      'meetingAt',
      'dealType',
      'meetingType',
      'sector',
      'valuation',
      'equity',
      'investmentAsked',
      'revenue',
      'teamSize',
      'investorBio',
      'investorPosts',
    ];
    for (const key of allowed) {
      if (dto[key] !== undefined) {
        if (typeof dto[key] === 'string')
          (updates as any)[key] = dto[key].trim();
        else (updates as any)[key] = dto[key];
      }
    }
    if (Object.keys(updates).length === 0) return meeting;
    await this.meetingModel
      .updateOne({ _id: meetingId }, { $set: updates })
      .exec();
    const updated = await this.meetingModel.findById(meetingId).exec();
    return updated ?? meeting;
  }

  /**
   * Generates the Executive Briefing PDF. Report must already exist (call GET /report first if needed).
   */
  async exportReportPdf(meetingId: string, userId: string): Promise<Buffer> {
    const meeting = await this.validateOwnership(meetingId, userId);
    if (meeting.reportResult == null) {
      throw new BadRequestException(
        'Report not generated. Call GET /meeting/:id/report first, then export.',
      );
    }
    return this.meetingPdfService.generateReportPdf(meeting);
  }

  /**
   * Creates a new meeting from the setup form, generates confirmation text via LLM,
   * saves it, then fires the 5 agents in parallel in the background.
   * Returns immediately with sessionId and confirmationText; agents run async.
   */
  async create(
    userId: string,
    dto: CreateMeetingDto,
  ): Promise<MeetingDocument> {
    const meeting = await this.meetingModel.create({
      userId,
      investorName: dto.investorName.trim(),
      investorCompany: dto.investorCompany?.trim() ?? null,
      country: dto.country.trim(),
      city: dto.city.trim(),
      meetingAt: dto.meetingAt,
      dealType: dto.dealType ?? null,
      meetingType: dto.meetingType ?? null,
      sector: dto.sector ?? null,
      valuation: dto.valuation ?? null,
      equity: dto.equity ?? null,
      investmentAsked: dto.investmentAsked ?? null,
      revenue: dto.revenue ?? null,
      teamSize: dto.teamSize ?? null,
      investorBio: dto.investorBio?.trim() ?? null,
      investorPosts: dto.investorPosts?.trim() ?? null,
      attachments: [],
      attachmentTexts: null,
      status: 'pending',
      readinessScore: null,
      sectionStatuses: {},
      confirmationText: null,
      culturalResult: null,
      psychResult: null,
      offerResult: null,
      imageResult: null,
      locationResult: null,
      negotiationHistory: [],
      negotiationScores: {},
      reportResult: null,
    });

    // Generate confirmation text (one LLM call) and save
    try {
      const confirmationText =
        await this.meetingAgentsService.generateConfirmationText(meeting);
      (meeting as any).confirmationText = confirmationText;
      await meeting.save();
    } catch (err) {
      this.logger.warn('Confirmation text generation failed', err);
      (meeting as any).confirmationText =
        `Meeting with ${meeting.investorName} in ${meeting.city}, ${meeting.country}.`;
      await meeting.save();
    }

    // Fire 5 agents in parallel in the background (do not await)
    const meetingId = (meeting as any)._id?.toString();
    if (meetingId) {
      this.runBackgroundAgents(meetingId).catch((err) => {
        this.logger.error('Background agents failed', err);
      });
    }

    return meeting;
  }

  /**
   * Runs Cultural, Psych, Offer, Image, Location agents in parallel.
   * When all 5 succeed, sets status to 'ready'.
   */
  private async runBackgroundAgents(meetingId: string): Promise<void> {
    const meeting = await this.meetingModel.findById(meetingId).exec();
    if (!meeting) return;

    const results = await Promise.allSettled([
      this.meetingAgentsService.runCultural(meeting),
      this.meetingAgentsService.runPsych(meeting),
      this.meetingAgentsService.runOffer(meeting),
      this.meetingAgentsService.runImage(meeting),
      this.meetingAgentsService.runLocation(meeting),
    ]);

    const updates: Record<string, unknown> = {};
    if (results[0].status === 'fulfilled')
      updates.culturalResult = results[0].value;
    else this.logger.warn('Cultural agent failed', results[0].reason);
    if (results[1].status === 'fulfilled')
      updates.psychResult = results[1].value;
    else this.logger.warn('Psych agent failed', results[1].reason);
    if (results[2].status === 'fulfilled')
      updates.offerResult = results[2].value;
    else this.logger.warn('Offer agent failed', results[2].reason);
    if (results[3].status === 'fulfilled')
      updates.imageResult = results[3].value;
    else this.logger.warn('Image agent failed', results[3].reason);
    if (results[4].status === 'fulfilled')
      updates.locationResult = results[4].value;
    else this.logger.warn('Location agent failed', results[4].reason);

    const allSucceeded = results.every((r) => r.status === 'fulfilled');
    if (allSucceeded) {
      updates.status = 'ready';
    }

    await this.meetingModel
      .updateOne({ _id: meetingId }, { $set: updates })
      .exec();
  }
}

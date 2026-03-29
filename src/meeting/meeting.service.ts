import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Meeting, MeetingDocument } from './meeting.schema';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { AppendTranscriptDto } from './dto/append-transcript.dto';
import { SaveSummaryDto } from './dto/save-summary.dto';
import OpenAI from 'openai';
import {
  CreateDocumentDto,
  CreateIntelligenceDraftDto,
  FlutterDraftDealTermsDto,
  GenerateReportDto,
  PatchDocumentFactsDto,
  PatchMeetingContextDto,
  PatchMeetingDocumentDto,
  SimulationStartDto,
  SimulationTurnDto,
} from './dto/meeting-context.dto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { toFlutterReport } from './meeting-flutter.mapper';

@Injectable()
export class MeetingService {
  constructor(
    @InjectModel(Meeting.name)
    private readonly meetingModel: Model<MeetingDocument>,
    private readonly configService: ConfigService,
  ) {}

  private defaultTitle(): string {
    const date = new Date().toISOString().slice(0, 10);
    return `Meeting - ${date}`;
  }

  private isValidObjectId(id: string): boolean {
    return (
      Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id
    );
  }

  async create(dto: CreateMeetingDto): Promise<MeetingDocument> {
    const title = (dto.title ?? '').trim() || this.defaultTitle();
    const payload: Record<string, unknown> = {
      title,
      roomId: dto.roomId,
      startTime: new Date(dto.startTime),
      duration: dto.duration ?? 0,
      participants: dto.participants ?? [],
      transcript: dto.transcript ?? [],
      keyPoints: dto.keyPoints ?? [],
      actionItems: dto.actionItems ?? [],
      decisions: dto.decisions ?? [],
      summary: dto.summary ?? '',
    };
    if (dto.endTime) payload.endTime = new Date(dto.endTime);
    const doc = await this.meetingModel.create(payload as any);
    const json = (doc as any).toJSON ? (doc as any).toJSON() : doc;
    return json as MeetingDocument;
  }

  async findAll(): Promise<MeetingDocument[]> {
    const list = await this.meetingModel
      .find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return list.map((doc: any) => {
      const id = doc._id?.toString();
      return { ...doc, id, _id: undefined, __v: undefined } as MeetingDocument;
    });
  }

  async findOne(id: string): Promise<MeetingDocument> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting id');
    }
    const doc = await this.meetingModel.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException('Meeting not found');
    }
    const ret = doc as any;
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret as MeetingDocument;
  }

  async appendTranscript(
    id: string,
    dto: AppendTranscriptDto,
  ): Promise<MeetingDocument> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting id');
    }
    const meeting = await this.meetingModel.findById(id).exec();
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    const chunks = (dto.chunks ?? []).map((c) => ({
      speaker: c.speaker,
      text: c.text,
      timestamp: c.timestamp,
    }));
    meeting.transcript = meeting.transcript ?? [];
    meeting.transcript.push(...chunks);

    // Optional metadata updates (sent by client on end-call).
    if (dto.title !== undefined) {
      const t = dto.title.trim();
      if (t) (meeting as any).title = t;
    }
    if (dto.endTime !== undefined) {
      (meeting as any).endTime = dto.endTime
        ? new Date(dto.endTime)
        : undefined;
    }
    if (dto.duration !== undefined) {
      (meeting as any).duration = Math.max(0, Number(dto.duration) || 0);
    }
    if (dto.participants !== undefined) {
      const incoming = (dto.participants ?? [])
        .map((p) => (p ?? '').trim())
        .filter((p) => p.length > 0);
      const existing = Array.isArray((meeting as any).participants)
        ? ((meeting as any).participants as string[])
        : [];
      const merged = Array.from(new Set([...existing, ...incoming]));
      (meeting as any).participants = merged;
    }

    await meeting.save();
    return meeting.toJSON() as MeetingDocument;
  }

  async saveSummary(id: string, dto: SaveSummaryDto): Promise<MeetingDocument> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting id');
    }
    const meeting = await this.meetingModel.findById(id).exec();
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (dto.summary !== undefined) (meeting as any).summary = dto.summary;
    if (dto.keyPoints !== undefined) (meeting as any).keyPoints = dto.keyPoints;
    if (dto.actionItems !== undefined)
      (meeting as any).actionItems = dto.actionItems;
    if (dto.decisions !== undefined) (meeting as any).decisions = dto.decisions;
    await meeting.save();
    return meeting.toJSON() as MeetingDocument;
  }

  async delete(id: string): Promise<void> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting id');
    }
    const result = await this.meetingModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Meeting not found');
    }
  }

  // --- Investor Meeting Intelligence flow ---

  async patchContext(
    id: string,
    dto: PatchMeetingContextDto,
  ): Promise<MeetingDocument> {
    const meeting = await this.getDocForUpdate(id);
    const current = (meeting.meetingContext ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...current };

    if (dto.investor !== undefined) {
      next.investor = this.deepMergePartial(
        (current.investor as Record<string, unknown>) ?? {},
        dto.investor as Record<string, unknown>,
      );
    }
    if (dto.meeting !== undefined) {
      next.meeting = this.deepMergePartial(
        (current.meeting as Record<string, unknown>) ?? {},
        dto.meeting as Record<string, unknown>,
      );
    }
    if (dto.deal !== undefined) {
      next.deal = this.deepMergePartial(
        (current.deal as Record<string, unknown>) ?? {},
        dto.deal as Record<string, unknown>,
      );
    }
    if (dto.extensions !== undefined) {
      next.extensions = this.deepMergePartial(
        (current.extensions as Record<string, unknown>) ?? {},
        dto.extensions,
      );
    }

    meeting.meetingContext = next as any;
    await meeting.save();
    return meeting.toJSON() as MeetingDocument;
  }

  async createIntelligenceDraft(
    dto: CreateIntelligenceDraftDto,
  ): Promise<MeetingDocument | Record<string, string>> {
    const flutterWizard =
      dto.investorName != null ||
      dto.investorCompany != null ||
      dto.country != null ||
      dto.city != null ||
      dto.meetingAt != null;

    if (flutterWizard) {
      return this.createFlutterWizardDraft(dto);
    }

    const roomId =
      (dto.roomId ?? '').trim() ||
      `intel_${new Types.ObjectId().toString()}`;
    const title = (dto.title ?? '').trim() || this.defaultTitle();
    const payload: Record<string, unknown> = {
      title,
      roomId,
      startTime: new Date(),
      duration: 0,
      participants: [],
      transcript: [],
      keyPoints: [],
      actionItems: [],
      decisions: [],
      summary: '',
      meetingContext: {},
      documents: [],
      briefing: null,
      simulation: null,
      finalReport: null,
      documentFacts: null,
    };
    const doc = await this.meetingModel.create(payload as any);
    const id = (doc as any)._id.toString();
    if (dto.initialContext) {
      await this.patchContext(id, dto.initialContext);
      const updated = await this.meetingModel.findById(id).exec();
      return updated!.toJSON() as MeetingDocument;
    }
    return doc.toJSON() as MeetingDocument;
  }

  /** Flutter `POST /meetings/intelligence/draft` step 1 — flat investor + meeting fields. */
  private async createFlutterWizardDraft(
    dto: CreateIntelligenceDraftDto,
  ): Promise<Record<string, string>> {
    const name = (dto.investorName ?? '').trim();
    const country = (dto.country ?? '').trim();
    const city = (dto.city ?? '').trim();
    const meetingAt = (dto.meetingAt ?? '').trim();
    if (!name || !country || !city || !meetingAt) {
      throw new BadRequestException(
        'investorName, country, city, and meetingAt are required.',
      );
    }

    const roomId =
      (dto.roomId ?? '').trim() ||
      `intel_${new Types.ObjectId().toString()}`;
    const title = (dto.title ?? '').trim() || this.defaultTitle();
    const payload: Record<string, unknown> = {
      title,
      roomId,
      startTime: new Date(),
      duration: 0,
      participants: [],
      transcript: [],
      keyPoints: [],
      actionItems: [],
      decisions: [],
      summary: '',
      meetingContext: {},
      documents: [],
      briefing: null,
      simulation: null,
      finalReport: null,
      documentFacts: null,
    };
    const doc = await this.meetingModel.create(payload as any);
    const id = (doc as any)._id.toString();

    const company = (dto.investorCompany ?? '').trim();
    await this.patchContext(id, {
      investor: {
        name,
        company: company || undefined,
        firm: company || undefined,
        country,
        city,
        location: [city, country].filter(Boolean).join(', '),
      },
      meeting: {
        datetime: meetingAt,
        timezone: 'UTC',
      },
      deal: {},
    });

    return {
      id,
      status: 'draft',
      confirmationText:
        'Saved. Continue with deal details in the next step.',
    };
  }

  /** Flutter `PATCH /meetings/intelligence/draft/:id` step 2. */
  async patchFlutterDraftDealTerms(
    id: string,
    dto: FlutterDraftDealTermsDto,
  ): Promise<Record<string, string>> {
    await this.getDocForUpdate(id);
    const rawEq = dto.equity?.trim() ?? '';
    const equityNum = parseFloat(rawEq.replace(/[^0-9.]/g, ''));
    await this.patchContext(id, {
      deal: {
        stage: dto.dealType?.trim(),
        meetingType: dto.meetingFormat?.trim(),
        sector: dto.sector?.trim(),
        valuationLabel: dto.valuation?.trim(),
        targetAmountLabel: dto.investmentAsked?.trim(),
        equity: Number.isFinite(equityNum) ? equityNum : undefined,
      },
      meeting: {
        format: dto.meetingFormat?.trim(),
      },
      extensions: {
        revenue: dto.revenue?.trim(),
        teamSize: dto.teamSize?.trim(),
        investorBio: dto.investorBio?.trim(),
        publicPosts: dto.publicPosts?.trim(),
        documentFileName: dto.documentFileName?.trim(),
      },
    });
    return {
      id,
      status: 'updated',
      confirmationText: 'Deal context saved.',
    };
  }

  /** Flutter `POST .../start-briefing` — runs the same checks as confirm. */
  async startBriefingFromDraft(id: string): Promise<Record<string, unknown>> {
    const confirm = await this.confirmContext(id);
    return { meetingId: id, ...confirm };
  }

  /** Flutter loading screen `GET /meetings/:id/status`. */
  async getMeetingUiStatus(id: string): Promise<{ status: string }> {
    const meeting = await this.getDocForUpdate(id);
    const confirmed = (meeting as any).briefing?.confirmedAt;
    return { status: confirmed ? 'ready' : 'pending' };
  }

  /** Final report in the shape expected by Flutter `ReportResult`. */
  async getFlutterFinalReport(id: string): Promise<Record<string, unknown> | null> {
    const meeting = await this.findOne(id);
    const fr = (meeting as any).finalReport as Record<string, unknown> | null;
    if (!fr || typeof fr !== 'object') return null;
    return toFlutterReport(fr, (meeting as any).briefing);
  }

  async exportMeetingPdf(id: string): Promise<Buffer> {
    await this.findOne(id);
    const meeting = await this.meetingModel.findById(id).lean().exec();
    const ctx = (meeting as any)?.meetingContext ?? {};
    const inv = ctx.investor ?? {};
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const lines = [
      'Investor Meeting Briefing (AVA)',
      `Investor: ${inv.name ?? ''}`,
      `Company: ${inv.firm ?? inv.company ?? ''}`,
      `When: ${ctx.meeting?.datetime ?? ''}`,
      '',
      'This is a lightweight export from your meeting record.',
      'Generate the full report in the app for complete analysis.',
    ];
    let y = 760;
    for (const line of lines) {
      const slice = line.slice(0, 95);
      page.drawText(slice, { x: 50, y, size: 11, font });
      y -= 18;
      if (y < 50) break;
    }
    return Buffer.from(await pdf.save());
  }

  async addDocument(
    id: string,
    dto: CreateDocumentDto,
  ): Promise<MeetingDocument> {
    const meeting = await this.getDocForUpdate(id);
    const docs = Array.isArray(meeting.documents)
      ? (meeting.documents as any[])
      : [];
    const docId = new Types.ObjectId().toString();
    const now = new Date().toISOString();
    docs.push({
      id: docId,
      filename: dto.filename,
      mimeType: dto.mimeType,
      source: dto.source ?? 'upload',
      docType: dto.docType,
      storageUrl: dto.storageUrl,
      sizeBytes: dto.sizeBytes,
      extractedText: dto.extractedText,
      extractedSummary: dto.extractedSummary,
      keyFacts: dto.keyFacts ?? null,
      createdAt: now,
      updatedAt: now,
    });
    meeting.documents = docs;
    await meeting.save();
    return meeting.toJSON() as MeetingDocument;
  }

  async patchDocument(
    id: string,
    docId: string,
    dto: PatchMeetingDocumentDto,
  ): Promise<MeetingDocument> {
    const meeting = await this.getDocForUpdate(id);
    const docs = Array.isArray(meeting.documents)
      ? [...(meeting.documents as any[])]
      : [];
    const idx = docs.findIndex((d) => d.id === docId);
    if (idx === -1) {
      throw new NotFoundException('Document not found');
    }
    const prev = docs[idx];
    const merged = {
      ...prev,
      ...Object.fromEntries(
        Object.entries(dto).filter(([, v]) => v !== undefined),
      ),
      keyFacts:
        dto.keyFacts !== undefined
          ? this.deepMergePartial(prev.keyFacts ?? {}, dto.keyFacts)
          : prev.keyFacts,
      updatedAt: new Date().toISOString(),
    };
    docs[idx] = merged;
    meeting.documents = docs;
    await meeting.save();
    return meeting.toJSON() as MeetingDocument;
  }

  async patchDocumentFacts(
    id: string,
    dto: PatchDocumentFactsDto,
  ): Promise<MeetingDocument> {
    const meeting = await this.getDocForUpdate(id);
    const current = (meeting.documentFacts as Record<string, unknown>) ?? {};
    meeting.documentFacts = this.deepMergePartial(current, dto.facts) as any;
    await meeting.save();
    return meeting.toJSON() as MeetingDocument;
  }

  async confirmContext(id: string): Promise<any> {
    const meeting = await this.getDocForUpdate(id);
    const ctx = (meeting.meetingContext ?? {}) as any;
    const inv = ctx?.investor ?? {};
    const firm = inv.firm || inv.company;
    const locationLine = inv.city || inv.location;

    const gaps: string[] = [];
    if (!inv.name) gaps.push('Investor name is missing.');
    if (!locationLine) gaps.push('Investor city or location is missing.');
    if (!ctx?.meeting?.datetime) gaps.push('Meeting datetime is missing.');
    // Timezone optional for Flutter wizard (ISO datetime + UTC implied).
    if (!ctx?.deal?.stage)
      gaps.push('Deal stage (seed/series A/...) is missing.');
    if (!ctx?.deal?.sector) gaps.push('Sector/industry is missing.');
    const hasValuation =
      ctx?.deal?.valuation !== undefined && ctx?.deal?.valuation !== null;
    const hasValuationLabel =
      typeof ctx?.deal?.valuationLabel === 'string' &&
      ctx.deal.valuationLabel.trim().length > 0;
    if (!hasValuation && !hasValuationLabel)
      gaps.push('Valuation is missing (number or label).');
    if (ctx?.deal?.equity === undefined || ctx?.deal?.equity === null)
      gaps.push('Equity offered is missing.');

    const riskFlags: string[] = [];
    if (!firm) {
      riskFlags.push(
        'Investor company not specified; some briefings will use limited context.',
      );
    }
    if (hasValuationLabel && !hasValuation) {
      riskFlags.push('Valuation is only a label; numeric valuation helps offer analysis.');
    }
    if (!meeting.documents?.length) {
      riskFlags.push('No documents uploaded; briefings will rely on assumptions.');
    }

    const confirmationSummary =
      gaps.length === 0
        ? 'Context looks complete. Ready to generate the briefing.'
        : 'Context saved, but some fields are missing. Please complete them for best results.';

    const assumptions: string[] = [];
    if (!ctx?.deal?.targetAmount && !ctx?.deal?.targetAmountLabel) {
      assumptions.push('Investment target not specified; using deal context only.');
    }

    const briefingVersion = `v_${new Date().toISOString()}`;
    meeting.briefing = meeting.briefing ?? {};
    meeting.briefing.briefingVersion = briefingVersion;
    meeting.briefing.confirmedAt = new Date().toISOString();
    meeting.briefing.confirmation = {
      confirmationSummary,
      assumptions,
      missingInfoQuestions: gaps,
      riskFlags,
      generatedAt: new Date().toISOString(),
    };
    await meeting.save();

    return {
      meetingId: meeting._id?.toString(),
      briefingVersion,
      confirmationSummary,
      assumptions,
      missingInfoQuestions: gaps,
      riskFlags,
    };
  }

  async generateBriefingTab(
    id: string,
    tab: 'culture' | 'profile' | 'offer' | 'executiveImage' | 'location',
  ): Promise<any> {
    const meeting = await this.getDocForUpdate(id);
    const ctx = meeting.meetingContext ?? {};
    const docs = Array.isArray(meeting.documents) ? meeting.documents : [];

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model =
      this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';

    const meta = {
      generatedAt: new Date().toISOString(),
      assumptions: [] as string[],
      sourcesUsed: [] as { docId: string; snippet: string }[],
    };

    if (!apiKey) {
      const fallback = this.fallbackBriefing(tab, meta, ctx);
      meeting.briefing = meeting.briefing ?? {};
      meeting.briefing[tab] = fallback;
      await meeting.save();
      return fallback;
    }

    try {
      const openai = new OpenAI({ apiKey });
      const systemPrompt = this.getSystemPromptForTab(tab, ctx);
      const userPayload = { meetingContext: ctx, documents: docs };

      const raw = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content:
              'Return ONLY strict JSON for the requested schema. Input JSON:\n' +
              JSON.stringify(userPayload, null, 2),
          },
        ],
      });

      const text = raw.choices[0]?.message?.content?.trim() ?? '';
      const jsonText = this.extractJson(text);
      const parsed = JSON.parse(jsonText);

      meeting.briefing = meeting.briefing ?? {};
      meeting.briefing[tab] = parsed;
      await meeting.save();
      return parsed;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[MeetingService] briefing/${tab} OpenAI failed, using fallback:`,
        msg,
      );
      meta.assumptions.push(
        'AI generation failed (invalid key, network, or bad JSON). Placeholder briefing returned.',
      );
      const fallback = this.fallbackBriefing(tab, meta, ctx);
      meeting.briefing = meeting.briefing ?? {};
      meeting.briefing[tab] = fallback;
      await meeting.save();
      return fallback;
    }
  }

  async simulationStart(id: string, dto: SimulationStartDto): Promise<any> {
    const meeting = await this.getDocForUpdate(id);
    const ctx = (meeting.meetingContext ?? {}) as any;
    const inv = ctx?.investor ?? {};
    const personaName =
      dto.personaName?.trim() ||
      inv.name ||
      'Investor';
    const personaArchetype =
      dto.personaArchetype?.trim() ||
      (meeting.briefing as any)?.profile?.archetypeTags?.[0] ||
      'Analytical';

    meeting.simulation = {
      status: 'running',
      startedAt: new Date().toISOString(),
      endedAt: undefined,
      mode: dto.mode ?? 'negotiation',
      personaName,
      personaArchetype,
      turns: [],
      scores: [],
      mistakes: [],
      bestMoments: [],
    };
    await meeting.save();

    let openingLine = this.buildFallbackOpeningChallenge(
      personaName,
      personaArchetype,
      ctx,
    );
    const apiKeyStart = this.configService.get<string>('OPENAI_API_KEY');
    const modelStart =
      this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
    if (apiKeyStart) {
      try {
        const openai = new OpenAI({ apiKey: apiKeyStart });
        const profile = (meeting.briefing as any)?.profile ?? {};
        const sys = `You write the FIRST message in a founder–investor negotiation role-play.
The investor is ${personaName} (${personaArchetype}). They do NOT greet or make small talk.
They open with a sharp, analytical CHALLENGE tied to the founder's deal (valuation, stage, sector, traction).
Output ONLY strict JSON: { "openingLine": string }
Rules: 1–3 sentences; first person as the investor; specific and testing; no meta-advice to the user.`;
        const raw = await openai.chat.completions.create({
          model: modelStart,
          messages: [
            { role: 'system', content: sys },
            {
              role: 'user',
              content: JSON.stringify({
                meetingContext: ctx,
                investorPsychProfile: profile,
              }),
            },
          ],
        });
        const text = raw.choices[0]?.message?.content?.trim() ?? '';
        const jsonText = this.extractJson(text);
        const parsedOpen = JSON.parse(jsonText);
        const line = String(parsedOpen?.openingLine ?? '').trim();
        if (line) openingLine = line;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          '[MeetingService] simulation opening OpenAI failed, using template:',
          msg,
        );
      }
    }

    return { ...meeting.simulation, openingLine };
  }

  async simulationTurn(id: string, dto: SimulationTurnDto): Promise<any> {
    const userText = (dto.userMessage ?? dto.message ?? '').trim();
    if (!userText) {
      throw new BadRequestException('userMessage or message is required.');
    }

    const meeting = await this.getDocForUpdate(id);
    const sim = meeting.simulation ?? {
      status: 'running',
      startedAt: new Date().toISOString(),
      turns: [],
      scores: [],
      mistakes: [],
      bestMoments: [],
    };

    const ts = new Date().toISOString();
    sim.turns = sim.turns ?? [];
    sim.turns.push({ speaker: 'founder', text: userText, ts });
    const exchangeIndex = sim.turns.filter(
      (t: { speaker?: string }) => t.speaker === 'founder',
    ).length;

    const lastInvestorLine = this.getLastInvestorMessageBeforeTurn(sim.turns);

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model =
      this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';

    let investorReply = '';
    let coachFeedback: {
      good: string[];
      risky: string[];
      nextSuggestion: string;
    } = {
      good: ['You engaged directly.'],
      risky: ['Tighten with one named number or proof point.'],
      nextSuggestion:
        'Lead with one metric + timeframe + where it is documented (deck, data room, customer name).',
    };
    let scores = { confidence: 68, logic: 62, emotionalControl: 78 };
    let nextInvestorGoal = 'Probe evidence and downside risk.';
    let llmFeedback = '';
    let llmSuggested = '';
    let llmColor: string | null = null;
    let llmSucceeded = false;

    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey });
        const systemPrompt =
          this.getSystemPromptForSimulationTurn(exchangeIndex);
        const ctx = meeting.meetingContext ?? {};
        const docs = Array.isArray(meeting.documents) ? meeting.documents : [];
        const profile = (meeting.briefing as any)?.profile ?? {};
        const payload = {
          meetingContext: ctx,
          investorPsychProfile: profile,
          simulationPersona: {
            name: sim.personaName,
            archetype: sim.personaArchetype,
          },
          documents: docs,
          history: sim.turns?.slice(-14) ?? [],
          userMessage: userText,
          exchangeIndex,
          lastInvestorMessage: lastInvestorLine || undefined,
        };

        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(payload, null, 2) },
          ],
        });

        const text = completion.choices[0]?.message?.content?.trim() ?? '';
        const jsonText = this.extractJson(text);
        const parsed = JSON.parse(jsonText);
        const candidate = String(parsed?.investorReply ?? '').trim();
        if (candidate) {
          investorReply = candidate;
          llmSucceeded = true;
        }
        coachFeedback = parsed?.coachFeedback ?? coachFeedback;
        scores = parsed?.scores ?? scores;
        nextInvestorGoal = String(parsed?.nextInvestorGoal ?? nextInvestorGoal);
        llmFeedback = String(parsed?.feedback ?? parsed?.observation ?? '').trim();
        llmSuggested = String(parsed?.suggestedImprovement ?? '').trim();
        llmColor =
          parsed?.color != null
            ? String(parsed.color)
            : parsed?.feedbackColor != null
              ? String(parsed.feedbackColor)
              : null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          '[MeetingService] simulation turn OpenAI failed, using defaults:',
          msg,
        );
      }
    } else {
      scores = this.simulationFallbackScores(exchangeIndex);
    }

    const mustUseHeuristic =
      !investorReply.trim() ||
      !llmSucceeded ||
      this.isDuplicateOrStaleInvestorReply(investorReply, lastInvestorLine);
    if (mustUseHeuristic) {
      investorReply = this.buildHeuristicInvestorReply(
        userText,
        exchangeIndex,
        lastInvestorLine,
      );
      if (!llmSucceeded) {
        coachFeedback = this.heuristicCoachFeedback(userText);
        scores = this.simulationFallbackScores(exchangeIndex);
      }
    }

    sim.turns.push({
      speaker: 'investor',
      text: investorReply,
      ts: new Date().toISOString(),
    });
    sim.turns.push({
      speaker: 'coach',
      text: JSON.stringify(coachFeedback),
      ts: new Date().toISOString(),
    });
    sim.scores = sim.scores ?? [];
    sim.scores.push({ ts: new Date().toISOString(), ...scores });
    meeting.simulation = sim;

    const nextSug = String(coachFeedback?.nextSuggestion ?? '');
    let feedbackUi = llmFeedback;
    if (!feedbackUi) {
      const risky = Array.isArray(coachFeedback?.risky)
        ? coachFeedback.risky.join(' ')
        : '';
      const good = Array.isArray(coachFeedback?.good)
        ? coachFeedback.good.join(' ')
        : '';
      feedbackUi =
        [risky, good].filter(Boolean).join(' ') ||
        'Tighten logic and evidence — analytical investors punish vague claims under pressure.';
    }
    let suggestedImp = llmSuggested || nextSug;

    let colorOut = this.deriveSimulationFeedbackColor(scores, exchangeIndex);
    const cr = String(llmColor ?? '')
      .toLowerCase()
      .trim();
    if (cr === 'green' || cr === 'amber' || cr === 'red') {
      colorOut = cr as 'green' | 'amber' | 'red';
    }
    if (colorOut === 'green' && !llmSuggested) {
      suggestedImp = '';
    }

    await meeting.save();

    return {
      investorReply,
      coachFeedback,
      scores,
      nextInvestorGoal,
      confidenceScore: scores.confidence,
      logicScore: scores.logic,
      emotionalControlScore: scores.emotionalControl,
      feedback: feedbackUi,
      color: colorOut,
      suggestedImprovement: suggestedImp,
    };
  }

  async simulationEnd(id: string): Promise<any> {
    const meeting = await this.getDocForUpdate(id);
    const sim = meeting.simulation ?? {};
    sim.status = 'ended';
    sim.endedAt = new Date().toISOString();
    meeting.simulation = sim;
    await meeting.save();
    const scoresArr = Array.isArray(sim.scores) ? sim.scores : [];
    let averageScore = 0;
    if (scoresArr.length > 0) {
      const sum = scoresArr.reduce(
        (acc: number, row: Record<string, unknown>) => {
          const c = Number(row.confidence) || 0;
          const l = Number(row.logic) || 0;
          const e = Number(row.emotionalControl) || 0;
          return acc + (c + l + e) / 3;
        },
        0,
      );
      averageScore = Math.round((sum / scoresArr.length) * 10) / 10;
    }
    return { ...sim, averageScore };
  }

  async generateFinalReport(id: string, dto: GenerateReportDto): Promise<any> {
    const meeting = await this.getDocForUpdate(id);
    const ctx = meeting.meetingContext ?? {};
    const briefing = meeting.briefing ?? {};
    const sim = meeting.simulation ?? {};

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model =
      this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';

    if (!apiKey) {
      const report = {
        generatedAt: new Date().toISOString(),
        readinessScore: 70,
        top3Risks: [
          'Not enough hard metrics cited.',
          'Valuation justification unclear.',
          'Objection handling needs practice.',
        ],
        talkTrack: {
          opening: 'Start with rapport, then one crisp traction proof point.',
        },
        objectionPlaybook: [],
        negotiationPlan: { anchor: 'State your range and justify with facts.' },
        finalChecklist: ['Bring metrics', 'Bring deck', 'Prepare 3 objections'],
        avaQuote:
          'You are prepared. Walk in with conviction — you have done the work.',
        intelligenceCards: [],
        exportPayload: {},
        extensions: {},
      };
      meeting.finalReport = report;
      await meeting.save();
      return report;
    }

    try {
      const openai = new OpenAI({ apiKey });
      const systemPrompt = this.getSystemPromptForFinalReport(
        dto.language ?? 'en',
      );
      const payload = {
        meetingContext: ctx,
        briefing,
        simulation: sim,
        options: dto,
      };

      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(payload, null, 2) },
        ],
      });

      const text = completion.choices[0]?.message?.content?.trim() ?? '';
      const jsonText = this.extractJson(text);
      const parsed = JSON.parse(jsonText);
      meeting.finalReport = {
        ...parsed,
        generatedAt: new Date().toISOString(),
      };
      await meeting.save();
      return meeting.finalReport;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        '[MeetingService] final report OpenAI failed, using fallback:',
        msg,
      );
      const report = {
        generatedAt: new Date().toISOString(),
        readinessScore: 70,
        top3Risks: [
          'Not enough hard metrics cited.',
          'Valuation justification unclear.',
          'Objection handling needs practice.',
        ],
        talkTrack: {
          opening: 'Start with rapport, then one crisp traction proof point.',
        },
        objectionPlaybook: [] as { objection: string; bestResponse: string }[],
        negotiationPlan: { anchor: 'State your range and justify with facts.' },
        finalChecklist: ['Bring metrics', 'Bring deck', 'Prepare 3 objections'],
        avaQuote:
          'You are prepared. Walk in with conviction — you have done the work.',
        intelligenceCards: [] as Record<string, unknown>[],
        exportPayload: {},
        extensions: { openAiError: msg },
      };
      meeting.finalReport = report;
      await meeting.save();
      return meeting.finalReport;
    }
  }

  async getFinalReport(id: string): Promise<any> {
    const meeting = await this.findOne(id);
    return (meeting as any).finalReport ?? null;
  }

  /** Shallow merge for nested context objects (wizard steps). */
  private deepMergePartial(
    base: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const out = { ...base };
    for (const key of Object.keys(patch)) {
      const pv = patch[key];
      if (pv === undefined) continue;
      out[key] = pv as unknown;
    }
    return out;
  }

  private async getDocForUpdate(id: string): Promise<any> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting id');
    }
    const meeting = await this.meetingModel.findById(id).exec();
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return meeting;
  }

  private extractJson(text: string): string {
    const fenceMatch = text.match(/```(?:json)?([\s\S]*?)```/i);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1);
    }
    return text;
  }

  /**
   * Injects geography + format so the model does not default to Italy/Milan when
   * meetingContext says e.g. Paris, France.
   */
  private formatGeoContextForPrompt(ctx: unknown): string {
    const root = (ctx ?? {}) as Record<string, unknown>;
    const inv = (root.investor ?? {}) as Record<string, unknown>;
    const mtg = (root.meeting ?? {}) as Record<string, unknown>;
    const name = String(inv.name ?? '').trim();
    const company = String(inv.company ?? inv.firm ?? '').trim();
    const city = String(inv.city ?? '').trim();
    const country = String(inv.country ?? '').trim();
    const locationLine = String(inv.location ?? '').trim();
    const format = String(mtg.format ?? '').trim();
    const lines: string[] = [];
    if (name) lines.push(`Investor name: ${name}`);
    if (company) lines.push(`Firm / company: ${company}`);
    const geo = [city, country].filter(Boolean).join(', ');
    if (geo) lines.push(`Meeting geography (authoritative): ${geo}`);
    else if (locationLine) lines.push(`Location line: ${locationLine}`);
    if (format) lines.push(`Meeting format: ${format}`);
    if (lines.length === 0) {
      return [
        'MEETING CONTEXT: City/country not fully specified in the payload.',
        'Use neutral, globally portable business etiquette.',
        'Do NOT assume Italy, Milan, Rome, or Italian business culture.',
        'Note gaps in meta.assumptions.',
      ].join('\n');
    }
    return [
      'MEETING CONTEXT (follow strictly; overrides unstated priors):',
      ...lines.map((l) => `- ${l}`),
      '- Tailor culture, dress, venue style, and communication norms to THIS geography and format.',
      '- Do NOT reference Italy or Italian business practice unless the geography above clearly indicates Italy.',
      '- Example: Paris, France → French business-meeting norms; not Italian.',
    ].join('\n');
  }

  private getSystemPromptForTab(
    tab: 'culture' | 'profile' | 'offer' | 'executiveImage' | 'location',
    ctx: unknown,
  ): string {
    const common = `
You are AVA, an Investor Meeting Intelligence assistant.
You MUST output ONLY strict JSON. No markdown, no extra text.
Every claim must be either backed by documents (include in meta.sourcesUsed with {docId, snippet}) or included in meta.assumptions.
Never invent numbers. If missing, set fields to null/empty and add a question in meta.assumptions.
Keep content skimmable for a mobile UI (short bullets).
`.trim();

    const geoBlock = this.formatGeoContextForPrompt(ctx);
    const tabHints: Record<typeof tab, string> = {
      culture:
        'CULTURE TAB: dos, avoids, openingTopics, and first10MinPlan must reflect MEETING CONTEXT geography — not a generic Southern European default.',
      profile:
        'PROFILE TAB: Describe decision style from context and documents; avoid nationality caricatures unless documents support them.',
      offer:
        'OFFER TAB: Focus on deal terms; tie market norms to the sector/stage in context, not to Italy unless context says Italy.',
      executiveImage:
        'EXECUTIVE IMAGE TAB: Dress and presence must match meeting format and local norms for the city/country in MEETING CONTEXT.',
      location:
        'LOCATION TAB: Recommendations should plausibly fit the investor city in MEETING CONTEXT; never use Italian placeholders unless Italy is specified.',
    };

    const schemas: Record<string, string> = {
      culture: `
Return JSON with:
{
  "cultureSummary": string,
  "dos": string[],
  "avoids": string[],
  "openingTopics": string[],
  "first10MinPlan": string[],
  "sensitiveTopics": string[],
  "meta": { "generatedAt": string(ISO), "assumptions": string[], "sourcesUsed": { "docId": string, "snippet": string }[] }
}
`.trim(),
      profile: `
Return JSON with:
{
  "archetypeTags": string[],
  "decisionStyle": string,
  "whatTheyCareAbout": string[],
  "likelyObjections": { "objection": string, "why": string, "bestResponseOutline": string }[],
  "questionsToAsk": string[],
  "redFlagsTheyWillProbe": string[],
  "meta": { "generatedAt": string(ISO), "assumptions": string[], "sourcesUsed": { "docId": string, "snippet": string }[] }
}
`.trim(),
      offer: `
Return JSON with:
{
  "fairScore": number(0-100),
  "marketRange": { "valuationMin": number|null, "valuationMax": number|null, "equityMin": number|null, "equityMax": number|null },
  "yourOfferPositioning": string,
  "negotiateRange": { "equityMin": number|null, "equityMax": number|null },
  "walkAway": { "equityMax": number|null, "valuationMin": number|null },
  "supportingArguments": string[],
  "meta": { "generatedAt": string(ISO), "assumptions": string[], "sourcesUsed": { "docId": string, "snippet": string }[] }
}
`.trim(),
      executiveImage: `
Return JSON with:
{
  "dressCode": string[],
  "bodyLanguage": string[],
  "speechTips": string[],
  "avoidSignals": string[],
  "meta": { "generatedAt": string(ISO), "assumptions": string[], "sourcesUsed": { "docId": string, "snippet": string }[] }
}
`.trim(),
      location: `
Return JSON with:
{
  "recommendations": { "name": string, "type": string, "why": string, "bestFor": string, "caution": string|null }[],
  "avoidAreas": string[],
  "bookingNotes": string[],
  "meta": { "generatedAt": string(ISO), "assumptions": string[], "sourcesUsed": { "docId": string, "snippet": string }[] }
}
`.trim(),
    };

    return `${common}\n\n${geoBlock}\n\n${tabHints[tab]}\n\n${schemas[tab]}`;
  }

  private titleCaseFirstName(personaName: string): string {
    const first =
      personaName.trim().split(/\s+/)[0] || personaName.trim() || 'Investor';
    if (!first) return 'Investor';
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }

  /** Last investor utterance before the founder message we just appended. */
  private getLastInvestorMessageBeforeTurn(turns: unknown[]): string {
    if (!Array.isArray(turns) || turns.length < 2) return '';
    for (let i = turns.length - 2; i >= 0; i--) {
      const t = turns[i] as { speaker?: string; text?: string };
      if (t?.speaker === 'investor') return String(t.text ?? '').trim();
    }
    return '';
  }

  private normalizeInvestorReplyCompare(s: string): string {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /** True if the new line is the same (or nearly) as the previous investor line — bad UX. */
  private isDuplicateOrStaleInvestorReply(
    candidate: string,
    previous: string,
  ): boolean {
    const a = this.normalizeInvestorReplyCompare(candidate);
    const b = this.normalizeInvestorReplyCompare(previous);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length > 35 && b.length > 35) {
      if (a.includes(b) || b.includes(a)) return true;
    }
    return false;
  }

  /**
   * Rule-based investor reply when OpenAI is off or returns empty/duplicate.
   * Reacts to emotional/meta messages, ultra-vague text, and evidence.
   */
  private buildHeuristicInvestorReply(
    userText: string,
    exchangeIndex: number,
    lastInvestorLine: string,
  ): string {
    const lower = userText.toLowerCase();
    const emotional =
      /\b(stress|stressed|nervous|nerves|scared|worried|worry|anxious|afraid|panic|help me|how can i|perfectly|not sure|feel pressure|under pressure)\b/.test(
        lower,
      ) || /\b(get|close|win)\b.*\b(deal|round)\b/.test(lower);
    const ultraVague =
      userText.trim().length < 14 ||
      /^(tell me|ok\.?|okay\.?|yes\.?|no\.?|what\??|why\??|how\??|hi\.?|hello)\s*$/i.test(
        userText.trim(),
      );
    const hasNumber = /\d/.test(userText);

    const pick = (msg: string): string | null =>
      this.isDuplicateOrStaleInvestorReply(msg, lastInvestorLine) ? null : msg;

    if (emotional) {
      const msg = pick(
        `I hear you — this process is stressful. I'm still underwriting the business though: in one sentence, name one traction metric and where I can verify it (deck, data room, or customer reference).`,
      );
      if (msg) return msg;
    }
    if (ultraVague) {
      const pool = [
        `That's not an answer I can diligence. Give me one concrete outcome — revenue, contracted pipeline, retention, or paying logos — with a timeframe.`,
        `You'll need to be sharper. What did you actually ship, sell, or sign in the last 90 days?`,
        `Skip the filler — what's the hardest proof point in your materials that would change a skeptic's mind?`,
      ];
      for (let k = 0; k < pool.length; k++) {
        const msg = pick(pool[(exchangeIndex + k) % pool.length]);
        if (msg) return msg;
      }
    }
    if (hasNumber) {
      const msg = pick(
        `Numbers help — now stress-test it: what's the weakest assumption behind that figure, and what would prove you wrong in the next quarter?`,
      );
      if (msg) return msg;
    }
    const rotation = [
      `Who pays you today, why now, and what happens if a funded competitor copies your wedge in six months?`,
      `What is the one chart in your deck that made you believe this works — and what would make you delete that slide?`,
      `If I wired half the round today, what milestone do you hit in 120 days — and how do we measure success?`,
      `Walk me through unit economics at steady state. Where does it break first — CAC, churn, or margin?`,
    ];
    for (let k = 0; k < rotation.length; k++) {
      const msg = pick(rotation[(exchangeIndex + k) % rotation.length]);
      if (msg) return msg;
    }
    return pick(
      `Stay on substance: what's the riskiest part of the plan, and what have you done in the last 60 days to de-risk it?`,
    ) ?? `Pick one claim you just made and defend it with a named proof point — otherwise we're stuck.`;
  }

  private heuristicCoachFeedback(userText: string): {
    good: string[];
    risky: string[];
    nextSuggestion: string;
  } {
    const lower = userText.toLowerCase();
    if (
      /\b(stress|stressed|nervous|worried|anxious|scared|afraid|panic)\b/.test(
        lower,
      )
    ) {
      return {
        good: [],
        risky: [
          'You went meta (stress) instead of answering the diligence question — in-room, that reads as evasion.',
        ],
        nextSuggestion:
          'Acknowledge briefly, then answer: one metric + timeframe + where it is verified.',
      };
    }
    if (userText.trim().length < 14) {
      return {
        good: [],
        risky: [
          'Too vague — an analytical investor will press the same point harder.',
        ],
        nextSuggestion:
          'Name one specific proof: a number, a customer, a shipped milestone, or a comparable.',
      };
    }
    return {
      good: ['You stayed in the conversation.'],
      risky: ['Tighten with a named proof point or falsifiable claim.'],
      nextSuggestion:
        'Lead with evidence, then interpretation — not the reverse.',
    };
  }

  private buildFallbackOpeningChallenge(
    personaName: string,
    personaArchetype: string,
    ctx: Record<string, unknown>,
  ): string {
    const deal = (ctx?.deal ?? {}) as Record<string, unknown>;
    const valRaw =
      deal.valuationLabel != null && String(deal.valuationLabel).trim()
        ? String(deal.valuationLabel).trim()
        : deal.valuation != null
          ? String(deal.valuation)
          : '';
    const stage = (deal.stage ?? 'this stage').toString();
    const sector = (deal.sector ?? 'this market').toString();
    const firstName = this.titleCaseFirstName(personaName);

    if (valRaw) {
      return `${firstName}: Let's cut to it. You're asking me to believe ${valRaw} at ${stage} in ${sector}. Walk me through the logic with specifics — what metric breaks first if you're wrong?`;
    }
    return `${firstName}: I'm ${personaArchetype} on these — I start with the hard question. What is the single number that proves traction, and what would convince you your thesis is false in the next 90 days?`;
  }

  private simulationFallbackScores(exchangeIndex: number): {
    confidence: number;
    logic: number;
    emotionalControl: number;
  } {
    if (exchangeIndex <= 2) {
      return { confidence: 70, logic: 64, emotionalControl: 78 };
    }
    if (exchangeIndex <= 4) {
      return { confidence: 64, logic: 58, emotionalControl: 74 };
    }
    return { confidence: 58, logic: 52, emotionalControl: 70 };
  }

  private deriveSimulationFeedbackColor(
    scores: { confidence: number; logic: number; emotionalControl: number },
    exchangeIndex: number,
  ): 'green' | 'amber' | 'red' {
    const c = Number(scores.confidence) || 0;
    const l = Number(scores.logic) || 0;
    const e = Number(scores.emotionalControl) || 0;
    const minS = Math.min(c, l, e);
    const avg = (c + l + e) / 3;
    const strict = exchangeIndex >= 5;
    const greenMin = strict ? 74 : 66;
    const greenAvg = strict ? 76 : 68;
    const redMin = strict ? 50 : 44;
    const redAvg = strict ? 54 : 48;
    if (minS >= greenMin && avg >= greenAvg) return 'green';
    if (minS <= redMin || avg <= redAvg) return 'red';
    return 'amber';
  }

  private getSystemPromptForSimulationTurn(exchangeIndex: number): string {
    return `
You are AVA running a realistic investor negotiation simulator for a mobile app.

The "investor" in investorReply must stay in character (often analytical, data-first, risk-aware). They do not make small talk.
Behavior rules:
- If the founder's answer is strong and evidence-backed, the investor probes a NEW dimension (deeper risk, unit economics, competition, conversion).
- If the answer is weak or vague, the investor presses HARDER on the SAME point — like a real meeting.

exchangeIndex counts only the founder's messages in this session; the current turn is number ${exchangeIndex}.
If the payload includes lastInvestorMessage, investorReply MUST advance the thread — never repeat that text verbatim or reply with essentially the same sentence.

PROGRESSIVE DIFFICULTY (coach scoring):
- Exchanges 1–2: warmup — competent answers can score well.
- Exchanges 3–4: standard bar.
- Exchanges 5+: STRICT — the same answer quality should score noticeably lower unless it is exceptional (specific numbers, comps, falsifiable claims, composed tone). Mirror rising pressure in a real negotiation.

Score three dimensions 0–100:
- confidence: assertive, clear position vs hedging and qualifiers.
- logic: evidence, numbers, comps vs assertions.
- emotionalControl: calm, strategic vs defensive or evasive.

Return ONLY strict JSON:
{
  "investorReply": string,
  "scores": { "confidence": number, "logic": number, "emotionalControl": number },
  "color": "green" | "amber" | "red",
  "feedback": string,
  "suggestedImprovement": string,
  "coachFeedback": { "good": string[], "risky": string[], "nextSuggestion": string },
  "nextInvestorGoal": string
}

- "feedback": 1–2 sentences; specific to THIS answer (which dimension slipped, what was missing). Not generic cheerleading.
- "color": green only if all three scores are strong for this exchangeIndex; red for serious strategic mistakes or evasion; amber in between.
- "suggestedImprovement": for green use "" or one short reinforcement; for amber/red give a concise example of a STRONGER response (principle + example line), not a script to memorize.
- Do not invent financial facts; ask for clarification in investorReply if needed.
`.trim();
  }

  private getSystemPromptForFinalReport(language: string): string {
    return `
You are AVA generating the final executive briefing report.
Output ONLY strict JSON:
{
  "readinessScore": number(0-100),
  "top3Risks": string[],
  "talkTrack": { "opening": string, "pitchArc": string, "proofPoints": string[] },
  "objectionPlaybook": { "objection": string, "bestResponse": string }[],
  "negotiationPlan": { "anchors": string[], "concessions": string[], "walkAway": string },
  "finalChecklist": string[],
  "avaQuote": string,
  "intelligenceCards": { "id": string, "title": string, "body": string, "status": string, "iconKey": string|null, "order": number }[],
  "exportPayload": object,
  "extensions": object
}
Language: ${language}.
Keep it concise and mobile-friendly.
If something is unknown, add it as a risk or checklist item.
intelligenceCards: optional UI sections (culture, profile, offer, image, location, negotiation) with short body text and status like Ready|Review|Confirmed.

SIMULATION: The payload includes "simulation" with turns and scores arrays (confidence, logic, emotionalControl per exchange).
- Compute average of per-turn (confidence+logic+emotionalControl)/3 if scores exist.
- If logic was consistently weaker than confidence/emotionalControl, reflect that in avaQuote and in the negotiation intelligenceCard body — supportive tone, one clear prep action for the real meeting.
- If simulation scores were strong, acknowledge rehearsal readiness briefly.
`.trim();
  }

  private fallbackBriefing(
    tab: 'culture' | 'profile' | 'offer' | 'executiveImage' | 'location',
    meta: { generatedAt: string; assumptions: string[]; sourcesUsed: any[] },
    ctx: any,
  ): any {
    const inv = ctx?.investor ?? {};
    const mtg = ctx?.meeting ?? {};
    const city = String(inv.city ?? '').trim();
    const country = String(inv.country ?? '').trim();
    const geo =
      [city, country].filter(Boolean).join(', ') ||
      String(inv.location ?? '').trim() ||
      '';
    const fmt = String(mtg.format ?? '').trim();

    if (tab === 'culture') {
      const geoBit = geo ? ` in ${geo}` : '';
      return {
        cultureSummary: `Preparation for your meeting${geoBit}. Follow local business etiquette for this geography — not a default country.`,
        dos: ['Start with brief rapport before pitching.'],
        avoids: ['Rushing into valuation immediately.'],
        openingTopics: ['Ask about their recent investments.'],
        first10MinPlan: [
          'Rapport',
          'Agenda alignment',
          'One traction proof point',
        ],
        sensitiveTopics: ['Politics'],
        meta,
      };
    }
    if (tab === 'profile') {
      return {
        archetypeTags: ['Analytical'],
        decisionStyle: 'Data-first, wants evidence and clear milestones.',
        whatTheyCareAbout: ['Traction', 'Unit economics', 'Team'],
        likelyObjections: [
          {
            objection: 'Valuation seems high.',
            why: 'Needs comps and traction support.',
            bestResponseOutline: 'Anchor on traction + comps + milestones.',
          },
        ],
        questionsToAsk: ['What does success look like in the first 90 days?'],
        redFlagsTheyWillProbe: ['Weak retention', 'Undefined ICP'],
        meta,
      };
    }
    if (tab === 'offer') {
      return {
        fairScore: 70,
        marketRange: {
          valuationMin: null,
          valuationMax: null,
          equityMin: null,
          equityMax: null,
        },
        yourOfferPositioning:
          'Position your offer as within market norms for your traction.',
        negotiateRange: { equityMin: null, equityMax: null },
        walkAway: { equityMax: null, valuationMin: null },
        supportingArguments: ['Tie valuation to traction milestones.'],
        meta,
      };
    }
    if (tab === 'executiveImage') {
      const fmtBit = fmt ? `${fmt} meeting` : 'this meeting';
      const geoBit = geo ? ` in ${geo}` : 'for this geography';
      return {
        dressCode: [
          `Match ${fmtBit} and local business dress norms ${geoBit}.`,
        ],
        bodyLanguage: ['Firm handshake, steady eye contact.'],
        speechTips: ['Speak clearly, pause after numbers.'],
        avoidSignals: ['Over-talking, defensive tone.'],
        meta,
      };
    }
    const primaryCity = city || (geo.includes(',') ? geo.split(',')[0].trim() : geo);
    return {
      recommendations: [
        {
          name: primaryCity
            ? `Quiet private venue near ${primaryCity}`
            : 'Quiet hotel lounge or private dining room',
          type: 'hotel',
          why: primaryCity
            ? `Low noise and privacy suit investor diligence in ${primaryCity}.`
            : 'Private, low noise, professional setting.',
          bestFor: fmt ? `${fmt} investor meetings` : 'Formal investor meetings',
          caution: 'Book ahead at peak hours',
        },
      ],
      avoidAreas: ['Very noisy restaurants', 'Tourist-trap spots that signal poor judgment'],
      bookingNotes: ['Arrive 10 minutes early.'],
      meta,
    };
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MeetingDocument = Meeting & Document;

@Schema({ _id: false })
export class TranscriptChunk {
  @Prop({ required: true })
  speaker: string;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  timestamp: string;
}

const TranscriptChunkSchema = SchemaFactory.createForClass(TranscriptChunk);

@Schema({ _id: false })
export class MeetingInvestorContext {
  /** Display name (can be filled step-by-step from the app). */
  @Prop({ required: false })
  name?: string;

  /** Firm / company (synonym: company). */
  @Prop({ required: false })
  firm?: string;

  @Prop({ required: false })
  company?: string;

  @Prop({ required: false })
  city?: string;

  /** Free-form location line, e.g. "Milan, Italy" — use if you do not split city/country yet. */
  @Prop({ required: false })
  location?: string;

  @Prop({ required: false })
  country?: string;

  @Prop({ required: false })
  linkedInUrl?: string;

  @Prop({ required: false })
  notes?: string;
}

const MeetingInvestorContextSchema = SchemaFactory.createForClass(
  MeetingInvestorContext,
);

@Schema({ _id: false })
export class MeetingLogisticsContext {
  @Prop({ required: false })
  datetime?: string; // ISO string from client

  @Prop({ required: false })
  timezone?: string;

  /** e.g. formal | lunch | dinner | remote */
  @Prop({ required: false })
  format?: string;

  @Prop({ required: false })
  venueHint?: string;
}

const MeetingLogisticsContextSchema = SchemaFactory.createForClass(
  MeetingLogisticsContext,
);

@Schema({ _id: false })
export class MeetingDealContext {
  @Prop({ required: false })
  stage?: string;

  @Prop({ required: false })
  sector?: string;

  @Prop({ required: false })
  targetAmount?: number;

  /** UI copy e.g. "€1,000,000" when you do not normalize to a number yet. */
  @Prop({ required: false })
  targetAmountLabel?: string;

  @Prop({ required: false })
  valuation?: number;

  @Prop({ required: false })
  valuationLabel?: string;

  @Prop({ required: false })
  currency?: string;

  @Prop({ required: false })
  equity?: number;

  @Prop({ required: false })
  meetingType?: string; // formal / lunch / dinner

  @Prop({ type: [String], default: [] })
  goals?: string[];

  @Prop({ type: [String], default: [] })
  agendaGoals?: string[];
}

const MeetingDealContextSchema =
  SchemaFactory.createForClass(MeetingDealContext);

@Schema({ _id: false })
export class MeetingContext {
  @Prop({ type: MeetingInvestorContextSchema, default: null })
  investor?: MeetingInvestorContext | null;

  @Prop({ type: MeetingLogisticsContextSchema, default: null })
  meeting?: MeetingLogisticsContext | null;

  @Prop({ type: MeetingDealContextSchema, default: null })
  deal?: MeetingDealContext | null;

  /**
   * Extra fields the mobile app may add later without a backend migration.
   * Prefer typed fields above when you know the shape.
   */
  @Prop({ type: Object, default: {} })
  extensions?: Record<string, unknown>;
}

const MeetingContextSchema = SchemaFactory.createForClass(MeetingContext);

@Schema({ _id: false })
export class MeetingDocumentSource {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: false })
  mimeType?: string;

  @Prop({ required: false })
  source?: string; // upload / pasted / email / linkedin / other

  /** deck | email | investor_profile | other */
  @Prop({ required: false })
  docType?: string;

  @Prop({ required: false })
  storageUrl?: string;

  @Prop({ required: false })
  sizeBytes?: number;

  @Prop({ required: false })
  extractedText?: string;

  @Prop({ required: false })
  extractedSummary?: string;

  /** Per-document structured facts (LLM or client). */
  @Prop({ type: Object, default: null })
  keyFacts?: Record<string, unknown> | null;

  @Prop({ required: true })
  createdAt: string; // ISO

  @Prop({ required: false })
  updatedAt?: string;
}

const MeetingDocumentSourceSchema = SchemaFactory.createForClass(
  MeetingDocumentSource,
);

@Schema({ _id: false })
export class MeetingBriefingTabMeta {
  @Prop({ required: true })
  generatedAt: string; // ISO

  @Prop({ required: true, default: [] })
  assumptions: string[];

  @Prop({ required: true, default: [] })
  sourcesUsed: { docId: string; snippet: string }[];
}

const MeetingBriefingTabMetaSchema = SchemaFactory.createForClass(
  MeetingBriefingTabMeta,
);

@Schema({ _id: false })
export class MeetingBriefingCulture {
  @Prop({ required: true })
  cultureSummary: string;

  @Prop({ type: [String], default: [] })
  dos: string[];

  @Prop({ type: [String], default: [] })
  avoids: string[];

  @Prop({ type: [String], default: [] })
  openingTopics: string[];

  @Prop({ type: [String], default: [] })
  first10MinPlan: string[];

  @Prop({ type: [String], default: [] })
  sensitiveTopics: string[];

  @Prop({ type: MeetingBriefingTabMetaSchema, required: true })
  meta: MeetingBriefingTabMeta;
}

const MeetingBriefingCultureSchema = SchemaFactory.createForClass(
  MeetingBriefingCulture,
);

@Schema({ _id: false })
export class MeetingBriefingProfile {
  @Prop({ type: [String], default: [] })
  archetypeTags: string[];

  @Prop({ required: true })
  decisionStyle: string;

  @Prop({ type: [String], default: [] })
  whatTheyCareAbout: string[];

  @Prop({ type: [Object], default: [] })
  likelyObjections: {
    objection: string;
    why: string;
    bestResponseOutline: string;
  }[];

  @Prop({ type: [String], default: [] })
  questionsToAsk: string[];

  @Prop({ type: [String], default: [] })
  redFlagsTheyWillProbe: string[];

  @Prop({ type: MeetingBriefingTabMetaSchema, required: true })
  meta: MeetingBriefingTabMeta;
}

const MeetingBriefingProfileSchema = SchemaFactory.createForClass(
  MeetingBriefingProfile,
);

@Schema({ _id: false })
export class MeetingBriefingOffer {
  @Prop({ required: true })
  fairScore: number;

  @Prop({ type: Object, required: true })
  marketRange: {
    valuationMin?: number;
    valuationMax?: number;
    equityMin?: number;
    equityMax?: number;
  };

  @Prop({ required: true })
  yourOfferPositioning: string;

  @Prop({ type: Object, required: true })
  negotiateRange: { equityMin?: number; equityMax?: number };

  @Prop({ type: Object, required: true })
  walkAway: { equityMax?: number; valuationMin?: number };

  @Prop({ type: [String], default: [] })
  supportingArguments: string[];

  @Prop({ type: MeetingBriefingTabMetaSchema, required: true })
  meta: MeetingBriefingTabMeta;
}

const MeetingBriefingOfferSchema =
  SchemaFactory.createForClass(MeetingBriefingOffer);

@Schema({ _id: false })
export class MeetingBriefingExecutiveImage {
  @Prop({ type: [String], default: [] })
  dressCode: string[];

  @Prop({ type: [String], default: [] })
  bodyLanguage: string[];

  @Prop({ type: [String], default: [] })
  speechTips: string[];

  @Prop({ type: [String], default: [] })
  avoidSignals: string[];

  @Prop({ type: MeetingBriefingTabMetaSchema, required: true })
  meta: MeetingBriefingTabMeta;
}

const MeetingBriefingExecutiveImageSchema = SchemaFactory.createForClass(
  MeetingBriefingExecutiveImage,
);

@Schema({ _id: false })
export class MeetingBriefingLocation {
  @Prop({ type: [Object], default: [] })
  recommendations: {
    name: string;
    type: string;
    why: string;
    bestFor: string;
    caution?: string;
  }[];

  @Prop({ type: [String], default: [] })
  avoidAreas: string[];

  @Prop({ type: [String], default: [] })
  bookingNotes: string[];

  @Prop({ type: MeetingBriefingTabMetaSchema, required: true })
  meta: MeetingBriefingTabMeta;
}

const MeetingBriefingLocationSchema = SchemaFactory.createForClass(
  MeetingBriefingLocation,
);

@Schema({ _id: false })
export class MeetingBriefingConfirmation {
  @Prop({ required: true })
  confirmationSummary: string;

  @Prop({ type: [String], default: [] })
  assumptions: string[];

  @Prop({ type: [String], default: [] })
  missingInfoQuestions: string[];

  @Prop({ type: [String], default: [] })
  riskFlags: string[];

  @Prop({ required: false })
  generatedAt?: string;
}

const MeetingBriefingConfirmationSchema = SchemaFactory.createForClass(
  MeetingBriefingConfirmation,
);

@Schema({ _id: false })
export class MeetingBriefing {
  @Prop({ required: false })
  briefingVersion?: string;

  @Prop({ required: false })
  confirmedAt?: string;

  @Prop({ type: MeetingBriefingConfirmationSchema, default: null })
  confirmation?: MeetingBriefingConfirmation | null;

  @Prop({ type: MeetingBriefingCultureSchema, default: null })
  culture?: MeetingBriefingCulture | null;

  @Prop({ type: MeetingBriefingProfileSchema, default: null })
  profile?: MeetingBriefingProfile | null;

  @Prop({ type: MeetingBriefingOfferSchema, default: null })
  offer?: MeetingBriefingOffer | null;

  @Prop({ type: MeetingBriefingExecutiveImageSchema, default: null })
  executiveImage?: MeetingBriefingExecutiveImage | null;

  @Prop({ type: MeetingBriefingLocationSchema, default: null })
  location?: MeetingBriefingLocation | null;
}

const MeetingBriefingSchema = SchemaFactory.createForClass(MeetingBriefing);

@Schema({ _id: false })
export class MeetingSimulationTurn {
  @Prop({ required: true })
  speaker: 'investor' | 'founder' | 'coach';

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  ts: string; // ISO

  @Prop({ type: Object, default: {} })
  annotations?: Record<string, unknown>;
}

const MeetingSimulationTurnSchema = SchemaFactory.createForClass(
  MeetingSimulationTurn,
);

@Schema({ _id: false })
export class MeetingSimulation {
  @Prop({ required: false })
  status?: 'idle' | 'running' | 'ended';

  @Prop({ required: false })
  startedAt?: string;

  @Prop({ required: false })
  endedAt?: string;

  @Prop({ required: false })
  mode?: string;

  @Prop({ required: false })
  personaName?: string;

  @Prop({ required: false })
  personaArchetype?: string;

  @Prop({ type: [MeetingSimulationTurnSchema], default: [] })
  turns: MeetingSimulationTurn[];

  @Prop({ type: [Object], default: [] })
  scores: {
    ts: string;
    confidence: number;
    logic: number;
    emotionalControl: number;
  }[];

  @Prop({ type: [String], default: [] })
  mistakes: string[];

  @Prop({ type: [String], default: [] })
  bestMoments: string[];
}

const MeetingSimulationSchema = SchemaFactory.createForClass(MeetingSimulation);

@Schema({ _id: false })
export class MeetingFinalReport {
  @Prop({ required: false })
  generatedAt?: string;

  @Prop({ required: false })
  readinessScore?: number;

  @Prop({ type: [String], default: [] })
  top3Risks?: string[];

  @Prop({ type: Object, default: {} })
  talkTrack?: Record<string, unknown>;

  @Prop({ type: [Object], default: [] })
  objectionPlaybook?: { objection: string; bestResponse: string }[];

  @Prop({ type: Object, default: {} })
  negotiationPlan?: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  finalChecklist?: string[];

  /** Short closing line for UI (e.g. AVA quote card). */
  @Prop({ required: false })
  avaQuote?: string;

  /**
   * Optional card list for Flutter: { id, title, body, status, iconKey, order }[]
   */
  @Prop({ type: [Object], default: [] })
  intelligenceCards?: Record<string, unknown>[];

  /** Payload for PDF/export service — shape is up to the client. */
  @Prop({ type: Object, default: {} })
  exportPayload?: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  extensions?: Record<string, unknown>;
}

const MeetingFinalReportSchema =
  SchemaFactory.createForClass(MeetingFinalReport);

@Schema({ timestamps: true, collection: 'meetings' })
export class Meeting {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, index: true })
  roomId: string;

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: false })
  endTime?: Date;

  @Prop({ default: 0 })
  duration: number;

  @Prop({ type: [String], default: [] })
  participants: string[];

  @Prop({ type: [TranscriptChunkSchema], default: [] })
  transcript: TranscriptChunk[];

  @Prop({ type: [String], default: [] })
  keyPoints: string[];

  @Prop({ type: [String], default: [] })
  actionItems: string[];

  @Prop({ type: [String], default: [] })
  decisions: string[];

  @Prop({ default: '' })
  summary: string;

  // Investor Meeting Intelligence single source of truth
  @Prop({ type: MeetingContextSchema, default: null })
  meetingContext?: MeetingContext | null;

  @Prop({ type: [MeetingDocumentSourceSchema], default: [] })
  documents?: MeetingDocumentSource[];

  /**
   * Aggregated facts from documents (LLM "Document Extract + Key Facts").
   * companyFacts, tractionMetrics, team, product, market, risks, claimsNeedingProof, etc.
   */
  @Prop({ type: Object, default: null })
  documentFacts?: Record<string, unknown> | null;

  @Prop({ type: MeetingBriefingSchema, default: null })
  briefing?: MeetingBriefing | null;

  @Prop({ type: MeetingSimulationSchema, default: null })
  simulation?: MeetingSimulation | null;

  @Prop({ type: MeetingFinalReportSchema, default: null })
  finalReport?: MeetingFinalReport | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);

MeetingSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MeetingDocument = Meeting & Document;

const AttachmentSchema = {
  name: String,
  url: String,
  type: String,
};

const NegotiationEntrySchema = {
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  timestamp: { type: Date, default: Date.now },
};

const NegotiationScoresSchema = {
  confidence: { type: Number, default: null },
  logic: { type: Number, default: null },
  emotional: { type: Number, default: null },
  average: { type: Number, default: null },
};

const SectionStatusesSchema = {
  cultural: {
    type: String,
    enum: ['ready', 'strong', 'review'],
    default: null,
  },
  psych: { type: String, enum: ['ready', 'strong', 'review'], default: null },
  offer: { type: String, enum: ['ready', 'strong', 'review'], default: null },
  image: { type: String, enum: ['ready', 'strong', 'review'], default: null },
  location: {
    type: String,
    enum: ['ready', 'strong', 'review'],
    default: null,
  },
  negotiation: {
    type: String,
    enum: ['ready', 'strong', 'review'],
    default: null,
  },
};

@Schema({ timestamps: true, collection: 'meetings' })
export class Meeting {
  @Prop({ required: true, index: true })
  userId: string;

  // --- Form data (Page 2) ---
  @Prop({ required: true, trim: true })
  investorName: string;

  @Prop({ type: String, default: null, trim: true })
  investorCompany: string | null;

  @Prop({ required: true, trim: true })
  country: string;

  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ required: true })
  meetingAt: string; // ISO 8601 e.g. "2025-03-06T18:00:00"

  @Prop({ type: String, default: null, trim: true })
  dealType: string | null;

  @Prop({ type: String, default: null, trim: true })
  meetingType: string | null; // Formal | Lunch | Dinner | Video Call

  @Prop({ type: String, default: null, trim: true })
  sector: string | null;

  @Prop({ type: Number, default: null })
  valuation: number | null;

  @Prop({ type: Number, default: null })
  equity: number | null;

  @Prop({ type: Number, default: null })
  investmentAsked: number | null;

  @Prop({ type: Number, default: null })
  revenue: number | null;

  @Prop({ type: Number, default: null })
  teamSize: number | null;

  @Prop({ type: String, default: null, trim: true })
  investorBio: string | null;

  @Prop({ type: String, default: null, trim: true })
  investorPosts: string | null;

  @Prop({ type: [AttachmentSchema], default: [] })
  attachments: Array<{ name: string; url: string; type: string }>;

  /** Extracted text from uploaded PDFs; used by Psych agent only. */
  @Prop({ type: String, default: null })
  attachmentTexts: string | null;

  // --- Session state ---
  @Prop({
    type: String,
    enum: ['pending', 'ready', 'complete'],
    default: 'pending',
  })
  status: 'pending' | 'ready' | 'complete';

  @Prop({ type: Number, default: null })
  readinessScore: number | null;

  @Prop({ type: SectionStatusesSchema, default: () => ({}) })
  sectionStatuses: {
    cultural?: string | null;
    psych?: string | null;
    offer?: string | null;
    image?: string | null;
    location?: string | null;
    negotiation?: string | null;
  };

  // --- Agent results ---
  @Prop({ type: String, default: null })
  confirmationText: string | null;

  @Prop({ type: Object, default: null })
  culturalResult: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  psychResult: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  offerResult: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  imageResult: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  locationResult: Record<string, unknown> | null;

  @Prop({ type: [NegotiationEntrySchema], default: [] })
  negotiationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
  }>;

  @Prop({ type: NegotiationScoresSchema, default: () => ({}) })
  negotiationScores: {
    confidence?: number | null;
    logic?: number | null;
    emotional?: number | null;
    average?: number | null;
  };

  @Prop({ type: Object, default: null })
  reportResult: Record<string, unknown> | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);

MeetingSchema.index({ userId: 1, createdAt: -1 });

MeetingSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

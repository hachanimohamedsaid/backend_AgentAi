import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MobilityProposalDocument = MobilityProposal & Document;

@Schema({ _id: false })
class ProposalOption {
  @Prop({ required: true })
  provider: string;

  @Prop({ required: true })
  minPrice: number;

  @Prop({ required: true })
  maxPrice: number;

  @Prop({ required: true })
  etaMinutes: number;

  @Prop({ required: true })
  confidence: number;

  @Prop({ type: [String], default: [] })
  reasons: string[];

  @Prop({ type: Number, default: 0 })
  globalScore: number;
}

@Schema({ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })
export class MobilityProposal {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ type: String, default: null })
  ruleId: string | null;

  @Prop({ required: true })
  quoteRunId: string;

  @Prop({ required: true, enum: ['PENDING_USER_APPROVAL', 'CONFIRMED', 'REJECTED', 'FAILED', 'EXPIRED'], default: 'PENDING_USER_APPROVAL', index: true })
  status: 'PENDING_USER_APPROVAL' | 'CONFIRMED' | 'REJECTED' | 'FAILED' | 'EXPIRED';

  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  to: string;

  @Prop({ required: true })
  pickupAt: Date;

  @Prop({ type: ProposalOption, required: true })
  best: ProposalOption;

  @Prop({ type: [ProposalOption], default: [] })
  options: ProposalOption[];

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  confirmedAt: Date | null;

  @Prop({ type: Date, default: null })
  rejectedAt: Date | null;

  @Prop({ type: String, default: null })
  bookingId: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MobilityProposalSchema = SchemaFactory.createForClass(MobilityProposal);

MobilityProposalSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

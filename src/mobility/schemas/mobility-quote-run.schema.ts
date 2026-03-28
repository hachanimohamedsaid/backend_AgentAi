import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MobilityQuoteRunDocument = MobilityQuoteRun & Document;

@Schema({ _id: false })
class QuoteOption {
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
export class MobilityQuoteRun {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ type: String, default: null })
  ruleId: string | null;

  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  to: string;

  @Prop({ required: true })
  pickupAt: Date;

  @Prop({ type: QuoteOption, required: true })
  best: QuoteOption;

  @Prop({ type: [QuoteOption], default: [] })
  options: QuoteOption[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const MobilityQuoteRunSchema = SchemaFactory.createForClass(MobilityQuoteRun);

MobilityQuoteRunSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

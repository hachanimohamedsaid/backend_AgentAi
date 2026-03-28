import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CampaignDocument = Campaign & Document;

export enum ToneOfVoice {
  Professional = 'professional',
  Friendly = 'friendly',
  Bold = 'bold',
  Luxurious = 'luxurious',
}

export enum CampaignStatus {
  Generating = 'generating',
  Completed = 'completed',
  Failed = 'failed',
}

@Schema({ timestamps: true, collection: 'social_campaigns' })
export class Campaign {
  @Prop({ required: true })
  productName: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  targetAudience: string;

  @Prop({ required: true, enum: ToneOfVoice })
  toneOfVoice: string;

  @Prop({ type: [String], required: true })
  platforms: string[];

  @Prop({ type: Object, default: {} })
  campaignResult: Record<string, unknown>;

  @Prop({ required: true, enum: CampaignStatus, default: CampaignStatus.Generating })
  status: string;

  @Prop({ type: [String], default: [] })
  sentTo: string[];

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

CampaignSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

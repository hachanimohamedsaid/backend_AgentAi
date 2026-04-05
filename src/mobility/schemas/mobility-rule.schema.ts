import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MobilityRuleDocument = MobilityRule & Document;

@Schema({ _id: false })
class RulePreferences {
  @Prop({ type: Boolean, default: true })
  cheapestFirst: boolean;

  @Prop({ type: Number, default: 20 })
  maxEtaMinutes: number;
}

@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class MobilityRule {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  to: string;

  @Prop({ required: true, default: 'Africa/Tunis' })
  timezone: string;

  @Prop({ required: true })
  cron: string;

  @Prop({ required: true, default: true })
  enabled: boolean;

  @Prop({ required: true, default: true })
  requireUserApproval: boolean;

  @Prop({ type: RulePreferences, default: {} })
  preferences: RulePreferences;

  @Prop({ type: Date, default: null })
  lastTriggeredAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MobilityRuleSchema = SchemaFactory.createForClass(MobilityRule);

MobilityRuleSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

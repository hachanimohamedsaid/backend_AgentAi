import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChallengeDocument = Challenge & Document;

@Schema({ timestamps: true })
export class Challenge {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: String, default: '' })
  longDescription: string;

  @Prop({ type: String, default: 'flag' })
  icon: string;

  @Prop({ type: Number, required: true, min: 0 })
  points: number;

  @Prop({ required: true })
  type: string;

  @Prop({ type: String, default: '#6366F1' })
  color: string;

  @Prop({ type: [String], default: [] })
  steps: string[];

  @Prop({ type: Boolean, default: false })
  requiresVoice: boolean;

  @Prop({ type: Boolean, default: false })
  requiresPayment: boolean;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0, index: true })
  order: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ChallengeSchema = SchemaFactory.createForClass(Challenge);

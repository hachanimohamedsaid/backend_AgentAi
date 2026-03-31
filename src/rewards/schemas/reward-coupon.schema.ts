import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RewardCouponDocument = RewardCoupon & Document;

@Schema({ timestamps: true })
export class RewardCoupon {
  @Prop({ required: true, unique: true, index: true })
  code: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, min: 1, max: 100 })
  discountPercent: number;

  @Prop({ required: true, default: 'monthly_champion' })
  reason: string;

  @Prop({ required: true, index: true })
  month: string;

  @Prop({ type: Boolean, default: false, index: true })
  used: boolean;

  @Prop({ type: Date, default: null })
  usedAt: Date | null;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RewardCouponSchema = SchemaFactory.createForClass(RewardCoupon);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MonthlyWinnerDocument = MonthlyWinner & Document;

@Schema({ timestamps: true })
export class MonthlyWinner {
  @Prop({ required: true, unique: true, index: true })
  month: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  challengePoints: number;

  @Prop({ required: true, unique: true })
  couponCode: string;

  @Prop({ required: true, default: 'monthly_champion' })
  reason: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MonthlyWinnerSchema = SchemaFactory.createForClass(MonthlyWinner);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SpendingPredictionDocument = SpendingPrediction & Document;

@Schema({ collection: 'spending_predictions' })
export class SpendingPrediction {
  @Prop({ required: true })
  nextMonth: string; // e.g. "2026-03"

  @Prop({ required: true })
  nextMonthLabel: string; // e.g. "March 2026"

  @Prop({ type: Array, required: true })
  predictions: {
    category: string;
    predicted: number;
    budget: number;
    overBudget: boolean;
    trend: 'up' | 'down' | 'stable';
    history: number[];
  }[];

  @Prop({ required: true })
  overBudgetCount: number;

  @Prop({ required: true })
  generatedAt: Date;

  // TTL index: auto-delete after 24 hours so next request refreshes
  @Prop({ default: () => new Date(), expires: 86400 })
  createdAt: Date;
}

export const SpendingPredictionSchema =
  SchemaFactory.createForClass(SpendingPrediction);

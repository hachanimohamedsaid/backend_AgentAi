import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { SuggestionType } from './suggestion.schema';

export type HabitDocument = Habit & Document;

@Schema({ collection: 'assistant_habits', timestamps: true })
export class Habit {
  @Prop({ required: true, index: true })
  userId: string;

  // Track success rate per suggestion type (free-form string)
  @Prop({ required: true })
  suggestionType: SuggestionType;

  /** Success rate between 0 and 1 */
  @Prop({ required: true, min: 0, max: 1, default: 0.5 })
  successRate: number;

  @Prop({ required: true, default: 0 })
  occurrences: number;

  @Prop({ type: Date, default: null })
  lastUsedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const HabitSchema = SchemaFactory.createForClass(Habit);

HabitSchema.index({ userId: 1, suggestionType: 1 }, { unique: true });

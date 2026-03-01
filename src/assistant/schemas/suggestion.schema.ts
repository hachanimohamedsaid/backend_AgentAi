import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Free-form suggestion type so we can support:
// - legacy types: "coffee", "leave_home", "umbrella", "break"
// - AVA types: "finance", "email", "project", "focus", "wellness", "other", ...
export type SuggestionType = string;
export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed';

export type SuggestionDocument = Suggestion & Document;

@Schema({ collection: 'assistant_suggestions', timestamps: true })
export class Suggestion {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  type: SuggestionType;

  @Prop({ required: true })
  message: string;

  /** Confidence between 0 and 1 */
  @Prop({ required: true, min: 0, max: 1 })
  confidence: number;

  /** Optional context identifier linking multiple suggestions to same context */
  @Prop({ type: String, default: null })
  ctxId?: string | null;

  /** Provenance of the suggestion: "ml" (rule-based/ML) or "openai" (AVA) */
  @Prop({ type: String, enum: ['openai', 'ml'], default: 'ml' })
  source: 'openai' | 'ml';

  @Prop({
    required: true,
    enum: ['pending', 'accepted', 'dismissed'],
    default: 'pending',
    index: true,
  })
  status: SuggestionStatus;

  /** Context snapshot for training (set when suggestion is created) */
  @Prop({ type: String, default: null })
  time: string | null;

  @Prop({ type: String, default: null })
  location: string | null;

  @Prop({ type: String, default: null })
  weather: string | null;

  @Prop({ type: Number, default: null })
  focusHours: number | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SuggestionSchema = SchemaFactory.createForClass(Suggestion);

SuggestionSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});


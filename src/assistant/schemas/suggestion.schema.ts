import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SuggestionType = 'coffee' | 'leave_home' | 'umbrella' | 'break';
export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed';

export type SuggestionDocument = Suggestion & Document;

@Schema({ collection: 'assistant_suggestions', timestamps: true })
export class Suggestion {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({
    required: true,
    enum: ['coffee', 'leave_home', 'umbrella', 'break'],
  })
  type: SuggestionType;

  @Prop({ required: true })
  message: string;

  /** Confidence between 0 and 1 */
  @Prop({ required: true, min: 0, max: 1 })
  confidence: number;

  @Prop({
    required: true,
    enum: ['pending', 'accepted', 'dismissed'],
    default: 'pending',
    index: true,
  })
  status: SuggestionStatus;

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


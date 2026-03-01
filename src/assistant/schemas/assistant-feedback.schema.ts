import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AssistantFeedbackDocument = AssistantFeedback & Document;

@Schema({ collection: 'assistant_feedback', timestamps: true })
export class AssistantFeedback {
  /** Id de la suggestion (ObjectId backend ou id client ex. openai_*) */
  @Prop({ required: true, index: true })
  suggestionId: string;

  @Prop({ required: true, enum: ['accepted', 'dismissed'] })
  action: string;

  @Prop({ type: String, default: null })
  userId?: string | null;

  @Prop({ type: String, default: null })
  message?: string | null;

  @Prop({ type: String, default: null })
  type?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AssistantFeedbackSchema =
  SchemaFactory.createForClass(AssistantFeedback);


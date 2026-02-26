import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AssistantFeedbackDocument = AssistantFeedback & Document;

@Schema({ collection: 'assistant_feedback', timestamps: true })
export class AssistantFeedback {
  @Prop({ required: true, index: true })
  userId: string;

  // Can be a Mongo ObjectId (as string) or a contextual id
  @Prop({ required: true })
  suggestionId: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  accepted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AssistantFeedbackSchema =
  SchemaFactory.createForClass(AssistantFeedback);


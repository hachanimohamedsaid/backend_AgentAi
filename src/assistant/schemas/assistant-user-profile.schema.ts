import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AssistantUserProfileDocument = AssistantUserProfile & Document;

@Schema({ collection: 'assistant_user_profile', timestamps: true })
export class AssistantUserProfile {
  @Prop({ required: true, index: true, unique: true })
  userId: string;

  @Prop({ type: [String], default: [] })
  acceptedTypes: string[];

  @Prop({ type: [String], default: [] })
  dismissedTypes: string[];

  @Prop({ type: [String], default: [] })
  acceptedExamples: string[];

  @Prop({ type: [String], default: [] })
  dismissedExamples: string[];

  @Prop({ type: Date, default: null })
  lastUpdatedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AssistantUserProfileSchema =
  SchemaFactory.createForClass(AssistantUserProfile);

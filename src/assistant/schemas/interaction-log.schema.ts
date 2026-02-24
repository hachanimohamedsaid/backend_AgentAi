import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InteractionLogDocument = InteractionLog & Document;

@Schema({ collection: 'interaction_logs', timestamps: true })
export class InteractionLog {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({
    required: true,
    enum: ['coffee', 'leave_home', 'umbrella', 'break'],
  })
  suggestionType: string;

  @Prop({ required: true, enum: ['accepted', 'dismissed'] })
  action: 'accepted' | 'dismissed';

  @Prop({ required: true, min: 0, max: 23 })
  timeOfDay: number;

  @Prop({ required: true, min: 0, max: 6 })
  dayOfWeek: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const InteractionLogSchema =
  SchemaFactory.createForClass(InteractionLog);

InteractionLogSchema.index({ userId: 1, suggestionType: 1, createdAt: -1 });


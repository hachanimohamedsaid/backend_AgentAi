import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TrainingSampleDocument = TrainingSample & Document;

@Schema({ collection: 'training_samples', timestamps: true })
export class TrainingSample {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  time: string;

  @Prop({ required: true })
  location: string;

  @Prop({ required: true })
  weather: string;

  @Prop({ required: true })
  focusHours: number;

  @Prop({ required: true })
  suggestionType: string;

  @Prop({ required: true })
  accepted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TrainingSampleSchema =
  SchemaFactory.createForClass(TrainingSample);

TrainingSampleSchema.index({ userId: 1, accepted: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnalysisDocument = Analysis & Document;

@Schema({ collection: 'analyses', timestamps: true })
export class Analysis {
  @Prop({ required: false, index: true })
  userId?: string;

  @Prop({ required: true })
  project_text: string;

  @Prop({ required: true })
  report: string;

  createdAt?: Date;
}

export const AnalysisSchema = SchemaFactory.createForClass(Analysis);

AnalysisSchema.index({ userId: 1, createdAt: -1 });

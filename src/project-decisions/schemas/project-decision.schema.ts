import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProjectDecisionDocument = ProjectDecision & Document;

@Schema({ timestamps: true, collection: 'project_decisions' })
export class ProjectDecision {
  @Prop({ required: true, enum: ['accept', 'reject'] })
  action: string;

  @Prop({ required: true })
  row_number: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  type_projet: string;

  @Prop({ default: null })
  budget_estime?: number;

  @Prop({ default: null })
  periode?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProjectDecisionSchema = SchemaFactory.createForClass(ProjectDecision);

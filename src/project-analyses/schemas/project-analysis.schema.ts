import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProjectAnalysisDocument = ProjectAnalysis & Document;

@Schema({ timestamps: true, collection: 'project_analyses' })
export class ProjectAnalysis {
  @Prop({ required: true, unique: true })
  row_number: number;

  @Prop({ type: Object, required: true })
  analysis: {
    tools: string[];
    technicalProposal: {
      architecture: string;
      stack: string;
      security: string;
      performance: string;
      tests: string;
      deployment: string;
      monitoring: string;
    };
    howToWork: string;
    developmentSteps: Array<{
      title: string;
      description: string;
    }>;
    recommendations: string;
  };

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProjectAnalysisSchema = SchemaFactory.createForClass(ProjectAnalysis);

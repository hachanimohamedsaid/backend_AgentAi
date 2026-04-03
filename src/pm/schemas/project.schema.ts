import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProjectDocument = Project & Document;

@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], default: [] })
  techStack: string[];

  @Prop({ default: 'draft', trim: true })
  status: string;

  /** Ligne feuille / proposition (alignement avec project-decisions.row_number). */
  @Prop({ type: Number, default: null, index: true, sparse: true })
  row_number: number | null;

  /** Données alignées sur la proposition acceptée (work proposals). */
  @Prop({ type: String, default: null, trim: true })
  type_projet: string | null;

  @Prop({ type: Number, default: null })
  budget_estime: number | null;

  @Prop({ type: String, default: null, trim: true })
  periode: string | null;

  @Prop({ type: [String], default: [] })
  tags: string[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

ProjectSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

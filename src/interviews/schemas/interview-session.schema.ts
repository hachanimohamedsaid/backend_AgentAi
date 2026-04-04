import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type InterviewSessionDocument = InterviewSession & Document;

export type InterviewMessageRole = 'user' | 'model';

@Schema({ timestamps: true, collection: 'interview_sessions' })
export class InterviewSession {
  @Prop({ required: true, unique: true })
  sessionId: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String })
  evaluationId?: string;

  @Prop({ type: String })
  candidateName?: string;

  @Prop({ type: String })
  jobTitle?: string;

  @Prop({ type: String })
  jobId?: string;

  @Prop({
    type: [
      {
        role: { type: String, enum: ['user', 'model'], required: true },
        content: { type: String, required: true },
        at: { type: Date, required: true },
      },
    ],
    default: [],
  })
  messages: Array<{ role: InterviewMessageRole; content: string; at: Date }>;

  @Prop({ type: String, default: null })
  summary: string | null;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  /** TTL : suppression automatique du document par MongoDB (index défini ci-dessous) */
  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const InterviewSessionSchema = SchemaFactory.createForClass(InterviewSession);

InterviewSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

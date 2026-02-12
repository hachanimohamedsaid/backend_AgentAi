import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MeetingDecisionDocument = MeetingDecision & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class MeetingDecision {
  @Prop({ required: true })
  meetingDate: string;

  @Prop({ required: true })
  meetingTime: string;

  @Prop({ required: true })
  decision: string;

  @Prop({ required: true })
  durationMinutes: number;

  @Prop({ required: true, unique: true })
  requestId: string;

  @Prop()
  googleCalendarLink?: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const MeetingDecisionSchema =
  SchemaFactory.createForClass(MeetingDecision);


import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class MeetingDecision extends Document {
  @Prop({ required: true })
  meetingDate: string;

  @Prop({ required: true })
  meetingTime: string;

  @Prop({ required: true })
  decision: string;

  @Prop({ required: true })
  durationMinutes: number;

  @Prop({ required: true, unique: true, index: true })
  requestId: string;

  @Prop()
  googleCalendarLink?: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const MeetingDecisionSchema = SchemaFactory.createForClass(MeetingDecision);
MeetingDecisionSchema.index({ requestId: 1 }, { unique: true });

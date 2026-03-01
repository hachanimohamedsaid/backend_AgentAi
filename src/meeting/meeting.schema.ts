import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MeetingDocument = Meeting & Document;

@Schema({ _id: false })
export class TranscriptChunk {
  @Prop({ required: true })
  speaker: string;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  timestamp: string;
}

const TranscriptChunkSchema = SchemaFactory.createForClass(TranscriptChunk);

@Schema({ timestamps: true, collection: 'meetings' })
export class Meeting {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, index: true })
  roomId: string;

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: false })
  endTime?: Date;

  @Prop({ default: 0 })
  duration: number;

  @Prop({ type: [String], default: [] })
  participants: string[];

  @Prop({ type: [TranscriptChunkSchema], default: [] })
  transcript: TranscriptChunk[];

  @Prop({ type: [String], default: [] })
  keyPoints: string[];

  @Prop({ type: [String], default: [] })
  actionItems: string[];

  @Prop({ type: [String], default: [] })
  decisions: string[];

  @Prop({ default: '' })
  summary: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);

MeetingSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

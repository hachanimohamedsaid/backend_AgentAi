import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

export type ConversationType = 'direct' | 'group';

@Schema({ _id: false })
export class LastMessage {
  @Prop({ type: String, required: true })
  content: string;

  @Prop({ type: Types.ObjectId, required: true })
  senderId: Types.ObjectId;

  @Prop({ type: String, required: true })
  senderName: string;

  @Prop({ type: Date, required: true })
  createdAt: Date;
}

const LastMessageSchema = SchemaFactory.createForClass(LastMessage);

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ type: String, enum: ['direct', 'group'], required: true })
  type: ConversationType;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
  participants: Types.ObjectId[];

  // null for DMs
  @Prop({ type: String, default: null })
  name: string | null;

  @Prop({ type: String, default: null })
  avatarUrl: string | null;

  @Prop({ type: LastMessageSchema, default: null })
  lastMessage: LastMessage | null;

  // userId -> count
  @Prop({ type: Map, of: Number, default: {} })
  unreadCounts: Map<string, number>;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);


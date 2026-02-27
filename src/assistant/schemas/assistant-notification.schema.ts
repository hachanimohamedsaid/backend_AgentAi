import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AssistantNotificationStatus = 'unread' | 'read' | 'deleted';

export type AssistantNotificationDocument = AssistantNotification & Document;

@Schema({ _id: false })
export class AssistantNotificationAction {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  action: string;

  @Prop({ type: Object, default: null })
  data?: Record<string, any> | null;
}

export const AssistantNotificationActionSchema = SchemaFactory.createForClass(
  AssistantNotificationAction,
);

@Schema({ collection: 'assistant_notifications', timestamps: true })
export class AssistantNotification {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true, enum: ['Work', 'Personal', 'Travel', 'General'] })
  category: 'Work' | 'Personal' | 'Travel' | 'General';

  @Prop({
    required: true,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  })
  priority: 'low' | 'medium' | 'high' | 'urgent';

  @Prop({
    type: [AssistantNotificationActionSchema],
    default: [],
  })
  actions: AssistantNotificationAction[];

  @Prop({ required: true })
  dedupeKey: string;

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  @Prop({
    required: true,
    enum: ['unread', 'read', 'deleted'],
    default: 'unread',
    index: true,
  })
  status: AssistantNotificationStatus;

  @Prop({ type: String, enum: ['openai', 'fallback'], default: 'fallback' })
  source: 'openai' | 'fallback';

  createdAt?: Date;
  updatedAt?: Date;
}

export const AssistantNotificationSchema = SchemaFactory.createForClass(
  AssistantNotification,
);

AssistantNotificationSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});


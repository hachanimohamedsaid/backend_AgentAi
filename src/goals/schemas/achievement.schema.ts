import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AchievementDocument = Achievement & Document;

@Schema({ timestamps: true, collection: 'achievements' })
export class Achievement {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  icon: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  date: string;

  createdAt?: Date;
}

export const AchievementSchema = SchemaFactory.createForClass(Achievement);

AchievementSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.userId;
    return ret;
  },
});

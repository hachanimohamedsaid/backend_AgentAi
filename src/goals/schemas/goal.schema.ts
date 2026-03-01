import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { DailyAction, DailyActionSchema } from './daily-action.schema';

export type GoalDocument = Goal & Document;

@Schema({ timestamps: true, collection: 'goals' })
export class Goal {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true, default: 'Personal' })
  category: string;

  @Prop({ default: 0, min: 0, max: 100 })
  progress: number;

  @Prop({ default: 'Ongoing' })
  deadline: string;

  @Prop({ default: 0 })
  streak: number;

  @Prop({ type: [DailyActionSchema], default: [] })
  dailyActions: DailyAction[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const GoalSchema = SchemaFactory.createForClass(Goal);

GoalSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.userId;
    return ret;
  },
});

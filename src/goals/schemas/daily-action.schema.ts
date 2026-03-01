import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class DailyAction {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  label: string;

  @Prop({ default: false })
  completed: boolean;
}

export const DailyActionSchema = SchemaFactory.createForClass(DailyAction);

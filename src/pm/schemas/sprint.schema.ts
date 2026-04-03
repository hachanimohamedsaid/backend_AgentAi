import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SprintDocument = Sprint & Document;

@Schema({ timestamps: true })
export class Sprint {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  goal: string;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({ required: true, trim: true })
  status: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    ref: 'Project',
    index: true,
  })
  projectId: string;
}

export const SprintSchema = SchemaFactory.createForClass(Sprint);

SprintSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

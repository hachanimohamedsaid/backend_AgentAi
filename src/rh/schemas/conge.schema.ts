import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type CongeDocument = Conge & Document;

@Schema({ timestamps: true })
export class Conge {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  employeeId: Types.ObjectId;

  @Prop({ type: String, required: true })
  employeeName: string;

  @Prop({ type: String, required: true })
  type: string;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({ type: Number, required: true })
  days: number;

  @Prop({ type: String, required: true })
  reason: string;

  @Prop({ type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status: string;
}

export const CongeSchema = SchemaFactory.createForClass(Conge);


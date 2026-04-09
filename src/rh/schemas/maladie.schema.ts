import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type MaladieDocument = Maladie & Document;

@Schema({ timestamps: true })
export class Maladie {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  employeeId: Types.ObjectId;

  @Prop({ type: String, required: true })
  employeeName: string;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({ type: Number, required: true })
  days: number;

  @Prop({ type: String, required: true })
  doctor: string;

  @Prop({ type: String, required: true })
  description: string;

  @Prop({ type: Boolean, default: false })
  certificate: boolean;

  @Prop({ type: String, enum: ['active', 'resolved'], default: 'active' })
  status: string;
}

export const MaladieSchema = SchemaFactory.createForClass(Maladie);


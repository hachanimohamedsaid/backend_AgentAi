import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ReclamationDocument = Reclamation & Document;

@Schema({ timestamps: true })
export class Reclamation {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  employeeId: Types.ObjectId;

  @Prop({ type: String, required: true })
  employeeName: string;

  @Prop({ type: String, required: true })
  subject: string;

  @Prop({ type: String, required: true })
  category: string;

  @Prop({ type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: string;

  @Prop({ type: String, required: true })
  description: string;

  @Prop({ type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' })
  status: string;
}

export const ReclamationSchema = SchemaFactory.createForClass(Reclamation);


import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, trim: true })
  requiredProfile: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', default: null })
  assignedEmployeeId: string | null;

  @Prop({ required: true, enum: ['LOW', 'MEDIUM', 'HIGH'] })
  priority: TaskPriority;

  @Prop({ required: true, type: Number })
  estimatedHours: number;

  @Prop({ required: true, trim: true })
  status: string;

  @Prop({ required: true, trim: true })
  deliverable: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'Sprint', index: true })
  sprintId: string;

  @Prop({ default: null })
  trelloCardId: string;

  @Prop({ default: null })
  trelloBoardId: string;

  @Prop({ default: null })
  trelloListTodoId: string;

  @Prop({ default: null })
  trelloListInProgressId: string;

  @Prop({ default: null })
  trelloListDoneId: string;

  @Prop({ type: [String], default: [] })
  rejectedBy: string[];
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    ret.assigned_employee_id = ret.assignedEmployeeId
      ? String(ret.assignedEmployeeId)
      : null;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

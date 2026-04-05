import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WellbeingUserDocument = HydratedDocument<WellbeingUser>;

@Schema({ collection: 'wellbeing_users', timestamps: true })
export class WellbeingUser {
  /** Public id returned to clients (UUID). */
  @Prop({ required: true, unique: true, index: true })
  uuid: string;

  /** Day of month (1–31) when monthly cycle resets; clamped at registration. */
  @Prop({ required: true, min: 1, max: 31 })
  diagnosticAnchorDay: number;
}

export const WellbeingUserSchema = SchemaFactory.createForClass(WellbeingUser);

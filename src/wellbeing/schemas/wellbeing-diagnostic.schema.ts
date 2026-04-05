import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WellbeingDiagnosticDocument = HydratedDocument<WellbeingDiagnostic>;

@Schema({ collection: 'wellbeing_diagnostics', timestamps: true })
export class WellbeingDiagnostic {
  @Prop({ required: true, index: true })
  userUuid: string;

  /** UTC cycle identifier YYYY-MM of period start. */
  @Prop({ required: true, index: true })
  cycleKey: string;

  @Prop({ type: [Number], required: true })
  answers: number[];

  @Prop({ type: Object, required: true })
  scores: Record<string, unknown>;

  @Prop({ type: String })
  aiResponse?: string;
}

export const WellbeingDiagnosticSchema =
  SchemaFactory.createForClass(WellbeingDiagnostic);

WellbeingDiagnosticSchema.index({ userUuid: 1, cycleKey: 1 }, { unique: true });

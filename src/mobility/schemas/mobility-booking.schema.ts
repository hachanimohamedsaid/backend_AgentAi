import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MobilityBookingDocument = MobilityBooking & Document;

@Schema({ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })
export class MobilityBooking {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  proposalId: string;

  @Prop({ required: true })
  provider: string;

  @Prop({ required: true, enum: ['CONFIRMED', 'FAILED'], default: 'CONFIRMED' })
  status: 'CONFIRMED' | 'FAILED';

  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  to: string;

  @Prop({ required: true })
  pickupAt: Date;

  @Prop({ required: true })
  minPrice: number;

  @Prop({ required: true })
  maxPrice: number;

  @Prop({ required: true })
  etaMinutes: number;

  @Prop({ type: String, default: null })
  externalBookingId: string | null;

  @Prop({ type: String, default: null })
  errorMessage: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MobilityBookingSchema = SchemaFactory.createForClass(MobilityBooking);

MobilityBookingSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

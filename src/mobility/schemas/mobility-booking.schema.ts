import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MobilityBookingDocument = MobilityBooking & Document;

@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class MobilityBooking {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  proposalId: string;

  @Prop({ required: true })
  provider: string;

  @Prop({
    required: true,
    enum: [
      'PENDING_PROVIDER',
      'ACCEPTED',
      'REJECTED',
      'FAILED',
      'CANCELED',
      'EXPIRED',
      'COMPLETED',
    ],
    default: 'PENDING_PROVIDER',
  })
  status:
    | 'PENDING_PROVIDER'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'FAILED'
    | 'CANCELED'
    | 'EXPIRED'
    | 'COMPLETED';

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
  providerBookingRef: string | null;

  @Prop({ type: String, default: null })
  tripStatus: string | null;

  @Prop({ type: Boolean, default: false })
  userDecisionRequired: boolean;

  @Prop({ type: String, enum: ['ACCEPTED', 'REJECTED'], default: null })
  userDriverDecision: 'ACCEPTED' | 'REJECTED' | null;

  @Prop({ type: String, default: null })
  driverName: string | null;

  @Prop({ type: String, default: null })
  driverPhone: string | null;

  @Prop({ type: String, default: null })
  vehiclePlate: string | null;

  @Prop({ type: String, default: null })
  vehicleModel: string | null;

  @Prop({ type: Object, default: null })
  providerPayloadLast: Record<string, unknown> | null;

  @Prop({ type: Number, default: null })
  driverLatitude: number | null;

  @Prop({ type: Number, default: null })
  driverLongitude: number | null;

  @Prop({ type: String, default: null })
  errorMessage: string | null;

  @Prop({ type: String, default: null })
  failureCode: string | null;

  @Prop({ type: String, default: null })
  failureMessage: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MobilityBookingSchema =
  SchemaFactory.createForClass(MobilityBooking);
MobilityBookingSchema.index({ proposalId: 1 }, { unique: true });

MobilityBookingSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

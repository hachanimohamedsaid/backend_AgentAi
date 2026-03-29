import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MobilityProviderTokenDocument = MobilityProviderToken & Document;

@Schema({ timestamps: true })
export class MobilityProviderToken {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  provider: string;

  @Prop({ required: true })
  encryptedAccessToken: string;

  @Prop({ type: String, default: null })
  encryptedRefreshToken: string | null;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

export const MobilityProviderTokenSchema = SchemaFactory.createForClass(MobilityProviderToken);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ type: String, default: null })
  password: string | null;

  @Prop({ type: String, default: null, sparse: true })
  googleId: string | null;

  @Prop({ type: String, default: null, sparse: true })
  appleId: string | null;

  @Prop({ type: String, default: null })
  resetPasswordToken: string | null;

  @Prop({ type: Date, default: null })
  resetPasswordExpires: Date | null;

  @Prop({ type: String, default: null })
  role: string | null;

  @Prop({ type: String, default: null })
  location: string | null;

  @Prop({ type: String, default: null })
  phone: string | null;

  @Prop({ type: Date, default: null })
  birthDate: Date | null;

  @Prop({ type: String, default: null })
  bio: string | null;

  @Prop({ type: Number, default: 0 })
  conversationsCount: number;

  @Prop({ type: Number, default: 0 })
  hoursSaved: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Ne pas exposer password, googleId, appleId dans les réponses JSON
UserSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    delete ret.password;
    delete ret.googleId;
    delete ret.appleId;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    delete ret.__v;
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

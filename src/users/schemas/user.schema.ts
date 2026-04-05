import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
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

  @Prop({ type: String, default: null })
  avatarUrl: string | null;

  @Prop({ type: Number, default: 0 })
  conversationsCount: number;

  @Prop({ type: Number, default: 0 })
  hoursSaved: number;

  @Prop({ type: Boolean, default: false })
  emailVerified: boolean;

  @Prop({ type: String, default: null })
  emailVerificationToken: string | null;

  @Prop({ type: Date, default: null })
  emailVerificationExpires: Date | null;

  @Prop({ type: Boolean, default: false })
  mlTrained: boolean;

  @Prop({ type: Date, default: null })
  lastTrainingAt: Date | null;

  @Prop({ type: Number, default: 0 })
  challengePoints: number;

  @Prop({ type: [String], default: [] })
  completedChallenges: string[];

  @Prop({ type: Boolean, default: false })
  isPremium: boolean;

  @Prop({ type: [String], default: [] })
  badges: string[];

  @Prop({ type: [String], default: [] })
  championMonths: string[];

  // Google OAuth Connect (Gmail + Sheets access — separate from Sign-In)
  @Prop({ type: String, default: null })
  googleAccessToken: string | null;

  @Prop({ type: String, default: null })
  googleRefreshToken: string | null;

  @Prop({ type: Date, default: null })
  googleTokenExpiry: Date | null;

  @Prop({ type: String, default: null })
  googleSheetId: string | null;

  @Prop({ type: String, default: null })
  googleConnectedEmail: string | null;

  @Prop({ type: Boolean, default: false })
  googleScopeGranted: boolean;

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
    delete ret.emailVerificationToken;
    delete ret.emailVerificationExpires;
    delete ret.googleAccessToken;
    delete ret.googleRefreshToken;
    delete ret.__v;
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

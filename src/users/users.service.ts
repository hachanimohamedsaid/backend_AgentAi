import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const user = new this.userModel(createUserDto);
    return user.save();
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId }).exec();
  }

  async findByAppleId(appleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ appleId }).exec();
  }

  async findByResetToken(token: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: new Date() },
      })
      .exec();
  }

  async findByEmailVerificationToken(token: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        emailVerificationToken: token,
        emailVerificationExpires: { $gt: new Date() },
      })
      .exec();
  }

  async createUser(data: {
    name: string;
    email: string;
    password?: string | null;
    googleId?: string | null;
    appleId?: string | null;
    avatarUrl?: string | null;
    emailVerified?: boolean;
  }): Promise<UserDocument> {
    const user = new this.userModel(data);
    return user.save();
  }

  async linkGoogleId(userId: string, googleId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { googleId, emailVerified: true })
      .exec();
  }

  /** Créer un utilisateur à partir des infos Google (sans mot de passe). */
  async createFromGoogle(data: {
    email: string;
    name: string;
    googleId: string;
    picture?: string;
  }): Promise<UserDocument> {
    return this.createUser({
      email: data.email.toLowerCase(),
      name: data.name,
      password: null,
      googleId: data.googleId,
      avatarUrl: data.picture ?? null,
      emailVerified: true,
    });
  }

  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<UserDocument | null> {
    const user = await this.userModel.findById(id).exec();
    if (!user) return null;
    if (dto.name !== undefined) (user as any).name = dto.name.trim();
    if (dto.role !== undefined) (user as any).role = dto.role;
    if (dto.location !== undefined) (user as any).location = dto.location;
    if (dto.phone !== undefined) (user as any).phone = dto.phone;
    if (dto.birthDate !== undefined) {
      (user as any).birthDate = dto.birthDate
        ? new Date(dto.birthDate)
        : null;
    }
    if (dto.bio !== undefined) (user as any).bio = dto.bio;
    if (dto.avatarUrl !== undefined) (user as any).avatarUrl = dto.avatarUrl;
    if (dto.conversationsCount !== undefined)
      (user as any).conversationsCount = dto.conversationsCount;
    if (dto.hoursSaved !== undefined)
      (user as any).hoursSaved = dto.hoursSaved;
    return user.save();
  }

  // ✨ NEW: Get leaderboard (top 100 users by challenge points)
  async findLeaderboard(): Promise<UserDocument[]> {
    return this.userModel
      .find()
      .select('id name email avatarUrl challengePoints completedChallenges isPremium _id')
      .sort({ challengePoints: -1 })
      .limit(100)
      .lean()
      .exec();
  }

  // ✨ NEW: Complete a challenge and add points
  async completeChallenge(
    userId: string,
    challengeId: string,
    points: number,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $inc: { challengePoints: points },
          $addToSet: { completedChallenges: challengeId },
        },
        { new: true },
      )
      .exec();
  }

  // ✨ NEW: Get user's challenge data
  async getUserChallengeData(userId: string) {
    return this.userModel
      .findById(userId)
      .select('challengePoints completedChallenges isPremium')
      .exec();
  }

  // ── Google OAuth Connect ──────────────────────────────────────────────────

  async saveGoogleTokens(
    userId: string,
    data: {
      accessToken: string;
      refreshToken: string;
      expiryDate: Date;
      googleEmail: string;
    },
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          googleAccessToken: data.accessToken,
          googleRefreshToken: data.refreshToken,
          googleTokenExpiry: data.expiryDate,
          googleConnectedEmail: data.googleEmail,
          googleScopeGranted: true,
        },
      )
      .exec();
  }

  async saveGoogleSheetId(userId: string, sheetId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { googleSheetId: sheetId })
      .exec();
  }

  async getValidGoogleAccessToken(userId: string): Promise<{
    accessToken: string;
    googleEmail: string;
    googleSheetId: string | null;
  }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user || !(user as any).googleRefreshToken) {
      throw new NotFoundException('Google account not connected');
    }

    const expiry: Date | null = (user as any).googleTokenExpiry;
    const isExpired = !expiry || expiry.getTime() < Date.now() + 60_000;

    if (!isExpired) {
      return {
        accessToken: (user as any).googleAccessToken as string,
        googleEmail: (user as any).googleConnectedEmail as string,
        googleSheetId: (user as any).googleSheetId ?? null,
      };
    }

    // Token expired — refresh via Google OAuth2
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    let refreshed: { access_token: string; expires_in: number };
    try {
      const response = await axios.post<{
        access_token: string;
        expires_in: number;
      }>(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          client_id: clientId ?? '',
          client_secret: clientSecret ?? '',
          refresh_token: (user as any).googleRefreshToken as string,
          grant_type: 'refresh_token',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      refreshed = response.data;
    } catch {
      throw new UnauthorizedException(
        'Google token refresh failed — user must reconnect',
      );
    }

    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          googleAccessToken: refreshed.access_token,
          googleTokenExpiry: newExpiry,
        },
      )
      .exec();

    return {
      accessToken: refreshed.access_token,
      googleEmail: (user as any).googleConnectedEmail as string,
      googleSheetId: (user as any).googleSheetId ?? null,
    };
  }

  async findAllGoogleConnected(): Promise<
    Array<{ userId: string; googleEmail: string }>
  > {
    const users = await this.userModel
      .find({ googleScopeGranted: true })
      .exec();
    return users.map((u) => ({
      userId: (u as any)._id.toString(),
      googleEmail: (u as any).googleConnectedEmail || u.email,
    }));
  }

  async findByTelegramChatId(chatId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ telegramChatId: chatId }).exec();
  }

  async saveTelegramChatId(userId: string, chatId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { telegramChatId: chatId })
      .exec();
  }
}

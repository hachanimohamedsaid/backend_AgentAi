import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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

  async createUser(data: {
    name: string;
    email: string;
    password?: string | null;
    googleId?: string | null;
    appleId?: string | null;
    avatarUrl?: string | null;
  }): Promise<UserDocument> {
    const user = new this.userModel(data);
    return user.save();
  }

  async linkGoogleId(userId: string, googleId: string): Promise<void> {
    await this.userModel.updateOne({ _id: userId }, { googleId }).exec();
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
}

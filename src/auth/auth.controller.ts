import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService, AuthResponse } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetNewPasswordDto } from './dto/set-new-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  /** Alias pour Flutter : même contrat que POST /auth/login */
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signin(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.authService.resetPassword(dto.email);
    return { message: 'If this email is registered, you will receive reset instructions.' };
  }

  /** Définir le nouveau mot de passe après clic sur le lien reçu par email (token dans le lien). */
  @Post('reset-password/confirm')
  @HttpCode(HttpStatus.OK)
  async setNewPassword(@Body() dto: SetNewPasswordDto): Promise<{ message: string }> {
    await this.authService.setNewPassword(dto.token, dto.newPassword);
    return { message: 'Password has been reset. You can now sign in.' };
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async loginWithGoogle(@Body() dto: GoogleAuthDto): Promise<AuthResponse> {
    return this.authService.loginWithGoogle(dto);
  }

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  async loginWithApple(@Body() dto: AppleAuthDto): Promise<AuthResponse> {
    return this.authService.loginWithApple(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(
    @CurrentUser() user: UserDocument,
  ): Promise<{
    id: string;
    name: string;
    email: string;
    role: string | null;
    location: string | null;
    phone: string | null;
    birthDate: string | null;
    bio: string | null;
    createdAt: string | null;
    conversationsCount: number;
    daysActive: number;
    hoursSaved: number;
  }> {
    const obj = user.toJSON ? user.toJSON() : (user as any);
    const id = obj.id ?? (user as any)._id?.toString();
    const name = obj.name ?? user.name;
    const email = obj.email ?? user.email;
    const role = obj.role ?? (user as any).role ?? null;
    const location = obj.location ?? (user as any).location ?? null;
    const phone = obj.phone ?? (user as any).phone ?? null;
    const birthDate = (user as any).birthDate ?? obj.birthDate ?? null;
    const bio = obj.bio ?? (user as any).bio ?? null;
    const createdAt = user.createdAt ?? (user as any).createdAt;
    const conversationsCount = obj.conversationsCount ?? (user as any).conversationsCount ?? 0;
    const hoursSaved = obj.hoursSaved ?? (user as any).hoursSaved ?? 0;
    const daysActive = createdAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000),
          ),
        )
      : 0;

    return {
      id,
      name,
      email,
      role,
      location,
      phone,
      birthDate: birthDate ? new Date(birthDate).toISOString().slice(0, 10) : null,
      bio,
      createdAt: createdAt ? new Date(createdAt).toISOString() : null,
      conversationsCount: Number(conversationsCount),
      daysActive,
      hoursSaved: Number(hoursSaved),
    };
  }

  /** Mise à jour du profil (nom, rôle, localisation, stats). */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @CurrentUser() user: UserDocument,
    @Body() dto: UpdateProfileDto,
  ): Promise<{ message: string }> {
    const userId = (user as any)._id?.toString();
    await this.authService.updateProfile(userId, dto);
    return { message: 'Profile updated' };
  }
}

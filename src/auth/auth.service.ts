import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { Resend } from 'resend';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { AppleAuthDto } from './dto/apple-auth.dto';

const SALT_ROUNDS = 10;
const RESET_TOKEN_EXPIRY_HOURS = 1;

export interface AuthResponse {
  user: { id: string; name: string; email: string };
  accessToken: string;
}

@Injectable()
export class AuthService {
  private readonly appleJwks = jwksRsa({
    jwksUri: 'https://appleid.apple.com/auth/keys',
    cache: true,
  });

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private toUserPayload(doc: UserDocument): { id: string; name: string; email: string } {
    const id = (doc as any)._id?.toString?.() ?? '';
    return {
      id,
      name: doc.name ?? '',
      email: doc.email ?? '',
    };
  }

  private async signToken(payload: { sub: string; email: string }): Promise<string> {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '7d';
    return this.jwtService.signAsync(payload, {
      expiresIn: expiresIn as any,
    });
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersService.createUser({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      password: hashedPassword,
    });
    const accessToken = await this.signToken({
      sub: (user as any)._id.toString(),
      email: user.email,
    });
    return {
      user: this.toUserPayload(user),
      accessToken,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const match = await bcrypt.compare(dto.password, user.password);
    if (!match) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = await this.signToken({
      sub: (user as any)._id.toString(),
      email: user.email,
    });
    return {
      user: this.toUserPayload(user),
      accessToken,
    };
  }

  async resetPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    (user as any).resetPasswordToken = token;
    (user as any).resetPasswordExpires = expires;
    await user.save();

    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    const emailFrom = this.configService.get<string>('EMAIL_FROM') ?? 'onboarding@resend.dev';
    const frontendResetUrl =
      this.configService.get<string>('FRONTEND_RESET_PASSWORD_URL') ?? 'https://yourapp.com/reset-password/confirm';
    const resetLink = `${frontendResetUrl.replace(/\/$/, '')}?token=${token}`;

    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      try {
        await resend.emails.send({
          from: emailFrom,
          to: user.email,
          subject: 'Reset your password',
          text: `Use this link to reset your password (valid ${RESET_TOKEN_EXPIRY_HOURS}h): ${resetLink}`,
          html: `<p>Use this link to reset your password (valid ${RESET_TOKEN_EXPIRY_HOURS}h):</p><p><a href="${resetLink}">${resetLink}</a></p>`,
        });
      } catch (err: any) {
        const msg = err?.message ?? 'Unknown error';
        console.error('[Resend] Reset email failed:', msg);
      }
    }
  }

  async setNewPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.usersService.findByResetToken(token);
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    (user as any).password = hashedPassword;
    (user as any).resetPasswordToken = null;
    (user as any).resetPasswordExpires = null;
    await user.save();
  }

  /**
   * Connexion Google : vérifie l'idToken (audience = GOOGLE_CLIENT_ID), récupère ou crée l'utilisateur, renvoie user + JWT.
   * Contrat Flutter : { user: { id, name, email }, accessToken }
   */
  async loginWithGoogle(dto: GoogleAuthDto): Promise<AuthResponse> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new UnauthorizedException('GOOGLE_CLIENT_ID not configured');
    }
    const client = new OAuth2Client(clientId);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: dto.idToken,
        audience: clientId,
      });
    } catch {
      throw new UnauthorizedException('Invalid Google idToken');
    }
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthorizedException('Google token missing email');
    }
    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const name = payload.name ?? payload.email.split('@')[0] ?? 'User';
    const picture = payload.picture ?? undefined;

    let user = await this.usersService.findByGoogleId(googleId);
    if (!user) {
      user = await this.usersService.findByEmail(email);
      if (user) {
        await this.usersService.linkGoogleId((user as any)._id.toString(), googleId);
      } else {
        user = await this.usersService.createFromGoogle({
          email,
          name,
          googleId,
          picture,
        });
      }
    }

    const accessToken = await this.signToken({
      sub: (user as any)._id.toString(),
      email: user.email,
    });
    return {
      user: this.toUserPayload(user),
      accessToken,
    };
  }

  private getAppleSigningKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
    if (!header.kid) return callback(new Error('No kid in header'));
    this.appleJwks.getSigningKey(header.kid, (err, key) => {
      if (err) return callback(err);
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    });
  };

  async loginWithApple(dto: AppleAuthDto): Promise<AuthResponse> {
    try {
      const decoded = jwt.verify(dto.identityToken, this.getAppleSigningKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: this.configService.get<string>('APPLE_CLIENT_ID') ?? undefined,
      }) as unknown as { sub: string; email?: string };
      const appleId = decoded.sub;
      let email = decoded.email?.toLowerCase();
      let name = 'User';

      if (dto.user) {
        try {
          const appleUser = JSON.parse(dto.user) as { name?: { firstName?: string; lastName?: string }; email?: string };
          if (appleUser.name) {
            const first = appleUser.name.firstName ?? '';
            const last = appleUser.name.lastName ?? '';
            name = [first, last].filter(Boolean).join(' ') || 'User';
          }
          if (appleUser.email) email = appleUser.email.toLowerCase();
        } catch {
          // ignore parse error
        }
      }

      let user = await this.usersService.findByAppleId(appleId);
      if (!user) {
        if (email) {
          user = await this.usersService.findByEmail(email);
        }
        if (user) {
          (user as any).appleId = appleId;
          await user.save();
        } else {
          user = await this.usersService.createUser({
            name,
            email: email ?? `apple-${appleId}@placeholder.local`,
            password: null,
            appleId,
          });
        }
      }

      const accessToken = await this.signToken({
        sub: (user as any)._id.toString(),
        email: user.email,
      });
      return {
        user: this.toUserPayload(user),
        accessToken,
      };
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid Apple token');
    }
  }

  async validateUserById(userId: string): Promise<UserDocument | null> {
    return this.usersService.findById(userId);
  }

  async updateProfile(
    userId: string,
    dto: {
      name?: string;
      role?: string | null;
      location?: string | null;
      phone?: string | null;
      birthDate?: string | null;
      bio?: string | null;
      avatarUrl?: string | null;
      conversationsCount?: number;
      hoursSaved?: number;
    },
  ): Promise<UserDocument | null> {
    return this.usersService.updateProfile(userId, dto);
  }

  /** Changer le mot de passe (utilisateur connecté, mot de passe actuel requis). */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.password) {
      throw new BadRequestException(
        'This account has no password (signed in with Google/Apple). Use reset password instead.',
      );
    }
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    (user as any).password = hashedPassword;
    await user.save();
  }
}

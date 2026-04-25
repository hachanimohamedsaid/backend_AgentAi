import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
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
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

export interface AuthResponse {
  user: {
    id: string;
    _id: string;
    name: string;
    email: string;
    role: string | null;
    employeeType: string | null;
  };
  accessToken: string;
  token: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly appleJwks = jwksRsa({
    jwksUri: 'https://appleid.apple.com/auth/keys',
    cache: true,
  });

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private getGoogleAudiences(): string[] {
    const legacyClientId = this.configService.get<string>('GOOGLE_CLIENT_ID') ?? '';
    const multiClientIdsRaw = this.configService.get<string>('GOOGLE_CLIENT_IDS') ?? '';
    const values = [legacyClientId, ...multiClientIdsRaw.split(',')]
      .map((v) => v.trim())
      .filter(Boolean);
    return Array.from(new Set(values));
  }

  private getAppleAudiences(): string[] {
    const legacyAudience = this.configService.get<string>('APPLE_CLIENT_ID') ?? '';
    const iosAudience = this.configService.get<string>('APPLE_AUDIENCE_IOS') ?? '';
    const multiAudiencesRaw = this.configService.get<string>('APPLE_AUDIENCES') ?? '';
    const values = [legacyAudience, iosAudience, ...multiAudiencesRaw.split(',')]
      .map((v) => v.trim())
      .filter(Boolean);
    return Array.from(new Set(values));
  }

  private toUserPayload(doc: UserDocument): AuthResponse['user'] {
    const id = (doc as any)._id?.toString?.() ?? '';
    return {
      id,
      _id: id,
      name: doc.name ?? '',
      email: doc.email ?? '',
      role: (doc as any).role ?? null,
      employeeType: (doc as any).employeeType ?? null,
    };
  }

  private async signToken(payload: { sub: string; email: string }): Promise<string> {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '7d';
    return this.jwtService.signAsync(payload, { expiresIn: expiresIn as any });
  }

  private getAppleSigningKey = (
    header: jwt.JwtHeader,
    callback: jwt.SigningKeyCallback,
  ) => {
    if (!header.kid) return callback(new Error('No kid in header'));
    this.appleJwks.getSigningKey(header.kid, (err, key) => {
      if (err) return callback(err);
      callback(null, key?.getPublicKey());
    });
  };

  // ─── Registration & Email Verification ──────────────────────────────────────

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

    const token = crypto.randomBytes(32).toString('hex');
    (user as any).emailVerificationToken = token;
    (user as any).emailVerificationExpires = new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
    );
    await user.save();
    await this.sendVerificationEmailToUser(user, token);

    const accessToken = await this.signToken({
      sub: (user as any)._id.toString(),
      email: user.email,
    });

    return { user: this.toUserPayload(user), accessToken, token: accessToken };
  }

  private async sendVerificationEmailToUser(
    user: UserDocument,
    token: string,
  ): Promise<void> {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!resendApiKey) {
      this.logger.error('[Resend] RESEND_API_KEY is not set – verification email not sent');
      throw new ServiceUnavailableException(
        'Email service is not configured. Set RESEND_API_KEY on the server.',
      );
    }

    const emailFrom =
      this.configService.get<string>('EMAIL_FROM') ?? 'onboarding@resend.dev';
    const verifyUrl =
      this.configService.get<string>('FRONTEND_VERIFY_EMAIL_URL') ??
      'https://yourapp.com/verify-email';
    const link = `${verifyUrl.replace(/\/$/, '')}?token=${token}`;

    try {
      await new Resend(resendApiKey).emails.send({
        from: emailFrom,
        to: user.email,
        subject: 'Verify your email address',
        text: `Verify your email (link valid ${VERIFICATION_TOKEN_EXPIRY_HOURS}h): ${link}`,
        html: `<p>Verify your email (link valid ${VERIFICATION_TOKEN_EXPIRY_HOURS}h):</p><p><a href="${link}">${link}</a></p>`,
      });
    } catch (err: any) {
      this.logger.error('[Resend] Verification email failed:', err?.message, err?.response?.data);
      throw new ServiceUnavailableException(
        'Could not send verification email. Check your Resend domain and API key.',
      );
    }
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.usersService.findByEmailVerificationToken(token);
    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    (user as any).emailVerified = true;
    (user as any).emailVerificationToken = null;
    (user as any).emailVerificationExpires = null;
    await user.save();
  }

  /** POST /auth/verify-email — utilisateur connecté (JWT). */
  async sendVerificationEmailForCurrentUser(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user || (user as any).emailVerified) return;

    const token = crypto.randomBytes(32).toString('hex');
    (user as any).emailVerificationToken = token;
    (user as any).emailVerificationExpires = new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
    );
    await user.save();
    await this.sendVerificationEmailToUser(user, token);
  }

  /** POST /auth/send-verification-email — sans JWT. */
  async sendVerificationEmail(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || (user as any).emailVerified) return;

    const token = crypto.randomBytes(32).toString('hex');
    (user as any).emailVerificationToken = token;
    (user as any).emailVerificationExpires = new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
    );
    await user.save();
    await this.sendVerificationEmailToUser(user, token);
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.password) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const match = await bcrypt.compare(dto.password, user.password);
    if (!match) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const accessToken = await this.signToken({
      sub: (user as any)._id.toString(),
      email: user.email,
    });

    return { user: this.toUserPayload(user), accessToken, token: accessToken };
  }

  // ─── Password Reset ──────────────────────────────────────────────────────────

  async resetPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return; // silent — avoid leaking whether email exists

    const token = crypto.randomBytes(32).toString('hex');
    (user as any).resetPasswordToken = token;
    (user as any).resetPasswordExpires = new Date(
      Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
    );
    await user.save();

    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!resendApiKey) {
      this.logger.error('[Resend] RESEND_API_KEY is not set – reset email not sent');
      return;
    }

    const emailFrom =
      this.configService.get<string>('EMAIL_FROM') ?? 'onboarding@resend.dev';
    const frontendResetUrl =
      this.configService.get<string>('FRONTEND_RESET_PASSWORD_URL') ??
      'https://yourapp.com/reset-password/confirm';
    const resetLink = `${frontendResetUrl.replace(/\/$/, '')}?token=${token}`;

    try {
      await new Resend(resendApiKey).emails.send({
        from: emailFrom,
        to: user.email,
        subject: 'Reset your password',
        text: `Reset your password (valid ${RESET_TOKEN_EXPIRY_HOURS}h): ${resetLink}`,
        html: `<p>Reset your password (valid ${RESET_TOKEN_EXPIRY_HOURS}h):</p><p><a href="${resetLink}">${resetLink}</a></p>`,
      });
    } catch (err: any) {
      this.logger.error('[Resend] Reset email failed:', err?.message, err?.response?.data);
      // Don't throw — avoid leaking email existence
    }
  }

  async setNewPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.usersService.findByResetToken(token);
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    (user as any).password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    (user as any).resetPasswordToken = null;
    (user as any).resetPasswordExpires = null;
    await user.save();
  }

  // ─── Google OAuth ────────────────────────────────────────────────────────────

  async loginWithGoogle(dto: GoogleAuthDto): Promise<AuthResponse> {
    if (!dto.idToken && !dto.accessToken) {
      throw new BadRequestException('idToken or accessToken is required');
    }

    let googleId = '';
    let email = '';
    let name = 'User';
    let picture: string | undefined;

    if (dto.idToken) {
      const audiences = this.getGoogleAudiences();
      if (audiences.length === 0) {
        throw new UnauthorizedException(
          'Google auth is not configured (set GOOGLE_CLIENT_ID or GOOGLE_CLIENT_IDS)',
        );
      }

      const client = new OAuth2Client();
      let ticket;
      try {
        ticket = await client.verifyIdToken({ idToken: dto.idToken, audience: audiences });
      } catch {
        throw new UnauthorizedException('Invalid Google idToken');
      }

      // FIX: this block was truncated/missing in the original
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('Google token missing email');
      }

      googleId = payload.sub;
      email = payload.email.toLowerCase();
      name = payload.name ?? payload.email.split('@')[0] ?? 'User';
      picture = payload.picture ?? undefined;

    } else if (dto.accessToken) {
      try {
        const { data } = await axios.get<{
          sub?: string;
          email?: string;
          name?: string;
          picture?: string;
        }>('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${dto.accessToken}` },
          timeout: 7000,
        });

        if (!data?.sub || !data?.email) {
          throw new UnauthorizedException('Google token missing profile/email');
        }

        googleId = data.sub;
        email = data.email.toLowerCase();
        name = data.name ?? data.email.split('@')[0] ?? 'User';
        picture = data.picture ?? undefined;
      } catch {
        throw new UnauthorizedException('Invalid Google accessToken');
      }
    }

    let user = await this.usersService.findByGoogleId(googleId);
    if (!user) {
      user = await this.usersService.findByEmail(email);
      if (user) {
        await this.usersService.linkGoogleId((user as any)._id.toString(), googleId);
      } else {
        user = await this.usersService.createFromGoogle({ email, name, googleId, picture });
      }
    }

    const accessToken = await this.signToken({
      sub: (user as any)._id.toString(),
      email: user.email,
    });

    return { user: this.toUserPayload(user), accessToken, token: accessToken };
  }

  // ─── Apple OAuth ─────────────────────────────────────────────────────────────

  async loginWithApple(dto: AppleAuthDto): Promise<AuthResponse> {
    const audiences = this.getAppleAudiences();
    if (audiences.length === 0) {
      throw new UnauthorizedException(
        'Apple auth backend not configured (set APPLE_AUDIENCE_IOS or APPLE_AUDIENCES)',
      );
    }

    this.logger.log(`Apple auth audiences loaded: ${audiences.length}`);
    const audienceOption: string | [string, ...string[]] =
      audiences.length === 1 ? audiences[0] : (audiences as [string, ...string[]]);

    try {
      const decoded = jwt.verify(dto.identityToken, this.getAppleSigningKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: audienceOption,
      }) as unknown as { sub?: string; email?: string; aud?: string | string[] };

      if (!decoded.sub) {
        throw new UnauthorizedException('Apple token missing sub');
      }

      const appleId = decoded.sub;
      let email = decoded.email?.toLowerCase();
      let name = 'User';

      if (dto.user) {
        try {
          const appleUser = JSON.parse(dto.user) as {
            name?: { firstName?: string; lastName?: string };
            email?: string;
          };
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
        if (email) user = await this.usersService.findByEmail(email);
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

      const audLog = Array.isArray(decoded.aud)
        ? decoded.aud.join(',')
        : (decoded.aud ?? 'n/a');
      this.logger.log(`Apple auth verify success: aud=${audLog} sub=${appleId}`);

      return { user: this.toUserPayload(user), accessToken, token: accessToken };
    } catch (e) {
      this.logger.warn('Apple auth verify failed');
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid Apple token');
    }
  }

  // ─── Profile & Password ──────────────────────────────────────────────────────

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

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.password) {
      throw new BadRequestException(
        'This account has no password (signed in with Google/Apple). Use reset password instead.',
      );
    }
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) throw new UnauthorizedException('Current password is incorrect');

    (user as any).password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();
  }

  // ─── Admin: Impersonation ────────────────────────────────────────────────────

  /**
   * Permet à un admin de générer un token JWT pour un autre utilisateur (impersonation).
   * FIX: méthode déplacée à l'intérieur de la classe (était orpheline dans l'original).
   */
  async impersonateUser(
    admin: UserDocument,
    targetUserId: string,
    context?: { ip?: string; userAgent?: string | null },
  ): Promise<{
    token: string;
    user: {
      _id: string;
      name: string;
      email: string;
      role: string | null;
      status: string;
    };
  }> {
    if (!admin || (admin as any).role !== 'admin') {
      throw new ForbiddenException('Only admin can impersonate');
    }

    const user = await this.usersService.findById(targetUserId);
    if (!user) {
      throw new NotFoundException('Target user not found');
    }

    if ((user as any).role === 'admin') {
      throw new ConflictException('Impersonation forbidden for this target user');
    }

    if ((user as any).status !== 'active') {
      throw new ConflictException('Impersonation allowed only for active users');
    }

    const payload = {
      sub: (user as any)._id.toString(),
      email: user.email,
      role: (user as any).role,
      isImpersonation: true,
      impersonatedBy:
        (admin as any)._id?.toString?.() ?? (admin as any).id ?? null,
    };

    const expiresIn =
      this.configService.get<string>('IMPERSONATION_JWT_EXPIRES_IN') ?? '30m';
    const token = await this.jwtService.signAsync(payload, { expiresIn: expiresIn as any });

    this.logger.log(
      `[AUDIT][IMPERSONATE] sourceAdmin=${admin.email}(${(admin as any)._id}) ` +
      `targetUser=${user.email}(${(user as any)._id}) ip=${context?.ip ?? 'n/a'} ` +
      `userAgent=${context?.userAgent ?? 'n/a'} at=${new Date().toISOString()}`,
    );

    return {
      token,
      user: {
        _id: (user as any)._id.toString(),
        name: user.name,
        email: user.email,
        role: (user as any).role ?? null,
        status: (user as any).status ?? 'active',
      },
    };
  }
}
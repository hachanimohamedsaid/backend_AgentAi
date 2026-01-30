import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { AppleAuthDto } from './dto/apple-auth.dto';

const SALT_ROUNDS = 10;

export interface AuthResponse {
  user: { id: string; name: string; email: string };
  accessToken: string;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client | null = null;
  private readonly appleJwks = jwksRsa({
    jwksUri: 'https://appleid.apple.com/auth/keys',
    cache: true,
  });

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (googleClientId) {
      this.googleClient = new OAuth2Client(googleClientId);
    }
  }

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
    // Stub: accept email, always return success (do not reveal if email exists)
    await Promise.resolve(email);
  }

  async loginWithGoogle(dto: GoogleAuthDto): Promise<AuthResponse> {
    if (!this.googleClient) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
      });
      const payload = ticket.getPayload();
      if (!payload?.email) {
        throw new UnauthorizedException('Invalid Google token');
      }
      const googleId = payload.sub;
      const email = payload.email.toLowerCase();
      const name = payload.name ?? payload.email?.split('@')[0] ?? 'User';

      let user = await this.usersService.findByGoogleId(googleId);
      if (!user) {
        user = await this.usersService.findByEmail(email);
        if (user) {
          (user as any).googleId = googleId;
          await user.save();
        } else {
          user = await this.usersService.createUser({
            name,
            email,
            password: null,
            googleId,
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
      throw new UnauthorizedException('Invalid Google token');
    }
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
}

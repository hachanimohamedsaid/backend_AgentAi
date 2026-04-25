import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { UserDocument } from '../../users/schemas/user.schema';

export interface JwtPayload {
  sub: string;
  email: string;
}

const extractTokenFromCookies = (req: any): string | null => {
  if (!req) return null;

  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    const key = rawKey?.trim();
    if (!key) continue;

    if (key === 'token' || key === 'accessToken' || key === 'access_token') {
      return decodeURIComponent(rawValue.join('=') ?? '');
    }
  }

  return null;
};

const extractTokenFromXAccessToken = (req: any): string | null => {
  const headerValue = req?.headers?.['x-access-token'];
  if (!headerValue) return null;
  if (Array.isArray(headerValue)) return headerValue[0] ?? null;
  return typeof headerValue === 'string' ? headerValue : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractTokenFromXAccessToken,
        extractTokenFromCookies,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || '7e6c26f44782b2b49cbf9e37fe77d013d41b43bcc9a47993e2024905ee04aad6',
    });
  }

  async validate(payload: JwtPayload): Promise<UserDocument> {
    const user = await this.authService.validateUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}

import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Model } from 'mongoose';
import axios from 'axios';
import {
  MobilityProviderToken,
  MobilityProviderTokenDocument,
} from './schemas/mobility-provider-token.schema';

@Injectable()
export class MobilityUberAuthService {
  constructor(
    @InjectModel(MobilityProviderToken.name)
    private readonly providerTokenModel: Model<MobilityProviderTokenDocument>,
    private readonly configService: ConfigService,
  ) {}

  buildConnectUrl(userId: string) {
    const clientId = this.configService.get<string>('UBER_CLIENT_ID');
    const redirectUri = this.configService.get<string>('UBER_REDIRECT_URI');
    const authorizeUrl =
      this.configService.get<string>('UBER_OAUTH_AUTHORIZE_URL') ??
      'https://auth.uber.com/oauth/v2/authorize';

    if (!clientId || !redirectUri) {
      throw new BadRequestException({
        code: 'UBER_CONFIG_MISSING',
        message: 'UBER_CLIENT_ID and UBER_REDIRECT_URI are required',
      });
    }

    const state = this.buildState(userId);
    const url = new URL(authorizeUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'request profile');
    url.searchParams.set('state', state);

    return url.toString();
  }

  async exchangeCodeAndStore(code: string, state: string) {
    const userId = this.verifyStateAndExtractUserId(state);
    const clientId = this.configService.get<string>('UBER_CLIENT_ID');
    const clientSecret = this.configService.get<string>('UBER_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('UBER_REDIRECT_URI');
    const tokenUrl =
      this.configService.get<string>('UBER_OAUTH_TOKEN_URL') ??
      'https://login.uber.com/oauth/v2/token';

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException({
        code: 'UBER_CONFIG_MISSING',
        message: 'UBER_CLIENT_ID, UBER_CLIENT_SECRET and UBER_REDIRECT_URI are required',
      });
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const response = await axios.post(tokenUrl, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });

    const accessToken = response.data?.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new BadRequestException({
        code: 'UBER_TOKEN_EXCHANGE_FAILED',
        message: 'Uber did not return access_token',
      });
    }

    const refreshToken =
      typeof response.data?.refresh_token === 'string' ? response.data.refresh_token : null;
    const expiresIn = Number(response.data?.expires_in ?? 0);
    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    await this.providerTokenModel
      .findOneAndUpdate(
        { userId, provider: 'uber' },
        {
          $set: {
            encryptedAccessToken: accessToken,
            encryptedRefreshToken: refreshToken,
            expiresAt,
          },
          $setOnInsert: {
            userId,
            provider: 'uber',
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    return { userId, connected: true, expiresAt };
  }

  async getUberStatus(userId: string) {
    const tokenDoc = await this.providerTokenModel
      .findOne({ userId, provider: 'uber' })
      .exec();

    const connected = Boolean(tokenDoc?.encryptedAccessToken);
    const expired = tokenDoc?.expiresAt ? tokenDoc.expiresAt.getTime() <= Date.now() : false;

    return {
      connected,
      expired,
      expiresAt: tokenDoc?.expiresAt ?? null,
    };
  }

  private buildState(userId: string) {
    const ts = Date.now().toString();
    const payload = `${userId}.${ts}`;
    const sig = this.sign(payload);
    return Buffer.from(`${payload}.${sig}`, 'utf8').toString('base64url');
  }

  private verifyStateAndExtractUserId(state: string) {
    let decoded: string;
    try {
      decoded = Buffer.from(state, 'base64url').toString('utf8');
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_STATE',
        message: 'Invalid OAuth state',
      });
    }

    const parts = decoded.split('.');
    if (parts.length < 3) {
      throw new UnauthorizedException({
        code: 'INVALID_STATE',
        message: 'Invalid OAuth state payload',
      });
    }

    const sig = parts.pop() as string;
    const payload = parts.join('.');
    const expected = this.sign(payload);
    if (!this.safeEqual(sig, expected)) {
      throw new UnauthorizedException({
        code: 'INVALID_STATE_SIGNATURE',
        message: 'Invalid OAuth state signature',
      });
    }

    const [userId, tsRaw] = payload.split('.', 2);
    const ts = Number(tsRaw);
    if (!userId || !Number.isFinite(ts)) {
      throw new UnauthorizedException({
        code: 'INVALID_STATE',
        message: 'Invalid OAuth state values',
      });
    }

    if (Date.now() - ts > 15 * 60 * 1000) {
      throw new UnauthorizedException({
        code: 'STATE_EXPIRED',
        message: 'OAuth state expired',
      });
    }

    return userId;
  }

  private sign(payload: string) {
    const secret =
      this.configService.get<string>('UBER_OAUTH_STATE_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'mobility-default-state-secret';

    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  private safeEqual(a: string, b: string) {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) {
      return false;
    }
    return timingSafeEqual(ab, bb);
  }
}

import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { UsersService } from '../users/users.service';

@Injectable()
export class GoogleConnectService {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  generateAuthUrl(userId: string): string {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') ?? '';
    const redirectUri = this.getRedirectUri();
    const state = Buffer.from(userId).toString('base64');

    const scopes = [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/spreadsheets',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ success: true; googleEmail: string }> {
    const userId = Buffer.from(state, 'base64').toString('utf-8');
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') ?? '';
    const clientSecret =
      this.configService.get<string>('GOOGLE_CLIENT_SECRET') ?? '';
    const redirectUri = this.getRedirectUri();

    // Exchange code for tokens
    let tokenData: {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    try {
      const response = await firstValueFrom(
        this.httpService.post<{
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        }>(
          'https://oauth2.googleapis.com/token',
          new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );
      tokenData = response.data;
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Google token exchange failed: ${err?.response?.data?.error ?? err?.message}`,
      );
    }

    if (!tokenData.refresh_token) {
      throw new InternalServerErrorException(
        'No refresh_token returned — user may have already granted access. Revoke at myaccount.google.com/permissions and retry.',
      );
    }

    // Fetch Google email via userinfo endpoint
    let googleEmail: string;
    try {
      const infoResponse = await firstValueFrom(
        this.httpService.get<{ email: string }>(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
        ),
      );
      googleEmail = infoResponse.data.email;
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Failed to fetch Google user info: ${err?.message}`,
      );
    }

    const expiryDate = new Date(Date.now() + tokenData.expires_in * 1000);

    await this.usersService.saveGoogleTokens(userId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiryDate,
      googleEmail,
    });

    const userAfterSave = await this.usersService.findById(userId);
    const existingSheetId = userAfterSave
      ? String((userAfterSave as any).googleSheetId ?? '').trim()
      : '';
    if (existingSheetId !== '') {
      console.log(
        `[GoogleConnect] Sheet already exists for user ${userId} — skipping setup webhook`,
      );
      return { success: true, googleEmail };
    }

    // Trigger N8N setup-sheet webhook (fire-and-forget — don't fail if N8N is slow)
    const n8nBase =
      this.configService.get<string>('N8N_BASE_URL') ?? '';
    if (n8nBase) {
      firstValueFrom(
        this.httpService.post(
          `${n8nBase}/webhook/google-connect-setup`,
          { userId, accessToken: tokenData.access_token, googleEmail },
        ),
      ).catch((err: any) => {
        console.error(
          '[GoogleConnect] N8N setup-sheet webhook failed:',
          err?.message,
        );
      });
    }

    return { success: true, googleEmail };
  }

  async getStatus(userId: string): Promise<{
    connected: boolean;
    googleEmail: string | null;
    sheetReady: boolean;
  }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const connected = (user as any).googleScopeGranted === true;
    return {
      connected,
      googleEmail: connected ? ((user as any).googleConnectedEmail ?? null) : null,
      sheetReady: connected && (user as any).googleSheetId != null,
    };
  }

  private getRedirectUri(): string {
    const base =
      this.configService.get<string>('BACKEND_BASE_URL') ?? 'http://localhost:3000';
    return `${base}/google-connect/callback`;
  }
}

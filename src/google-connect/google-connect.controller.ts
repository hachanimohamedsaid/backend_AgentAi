import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { GoogleConnectService } from './google-connect.service';

@Controller(['google-connect', 'api/google-connect'])
export class GoogleConnectController {
  constructor(private readonly googleConnectService: GoogleConnectService) {}

  /** Returns the Google OAuth consent URL for the authenticated user. */
  @Get('url')
  @UseGuards(JwtAuthGuard)
  getAuthUrl(@CurrentUser() user: UserDocument): { authUrl: string } {
    const userId = (user as any)._id?.toString() ?? (user as any).id;
    const authUrl = this.googleConnectService.generateAuthUrl(userId);
    return { authUrl };
  }

  /** Returns the current Google connect status for the authenticated user. */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus(
    @CurrentUser() user: UserDocument,
  ): Promise<{ connected: boolean; googleEmail: string | null; sheetReady: boolean }> {
    const userId = (user as any)._id?.toString() ?? (user as any).id;
    return this.googleConnectService.getStatus(userId);
  }

  /**
   * OAuth callback — NOT protected with JWT.
   * Google redirects here after the user grants permission.
   * Returns an HTML success page that Flutter's WebView can detect.
   */
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ): Promise<void> {
    if (error || !code || !state) {
      res.status(400).send(this.buildHtmlPage('error', error ?? 'Missing code or state'));
      return;
    }

    try {
      await this.googleConnectService.handleCallback(code, state);
      res.redirect('piagent://google-connect/success');
    } catch {
      res.redirect('piagent://google-connect/error');
    }
  }

  private buildHtmlPage(status: 'success' | 'error', detail: string): string {
    const isSuccess = status === 'success';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AVA – Google Connect</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0;
           background: ${isSuccess ? '#0f2027' : '#1a0a0a'}; color: #fff; }
    .card { text-align: center; padding: 40px 32px; border-radius: 16px;
            background: rgba(255,255,255,0.07); max-width: 360px; }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0; color: rgba(255,255,255,0.6); font-size: 14px; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? '✅' : '❌'}</div>
    <h1>${isSuccess ? 'Google Account Connected' : 'Connection Failed'}</h1>
    <p>${isSuccess ? `Connected as ${detail}` : detail}</p>
    ${isSuccess ? '<p style="margin-top:12px;color:rgba(255,255,255,0.4)">You can close this window and return to AVA.</p>' : ''}
  </div>
  <script>
    // Signal Flutter WebView that the flow completed
    if (window.flutter_inappwebview) {
      window.flutter_inappwebview.callHandler('googleConnectResult', { status: '${status}', detail: ${JSON.stringify(detail)} });
    }
  </script>
</body>
</html>`;
  }
}

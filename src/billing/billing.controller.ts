import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import Stripe from 'stripe';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);
  private readonly stripe: Stripe;
  private readonly successRedirectScheme: string;

  constructor(
    private readonly billing: BillingService,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined');
    }
    this.stripe = new Stripe(secretKey);
    this.successRedirectScheme =
      this.configService.get<string>('STRIPE_SUCCESS_REDIRECT_SCHEME') || 'piagent://';
  }

  @UseGuards(JwtAuthGuard)
  @Post('create-checkout-session')
  @HttpCode(HttpStatus.CREATED)
  async createCheckout(
    @Body() dto: CreateCheckoutDto,
    @CurrentUser() user: UserDocument,
  ) {
    const userId = (user as any)._id?.toString();
    const url = await this.billing.createSubscriptionCheckoutSession(dto.plan, {
      customerEmail: user.email,
      userId,
    });
    return { url };
  }

  @Get('success')
  async handleStripeSuccess(
    @Res() res: Response,
    @Query('session_id') sessionId?: string,
    @Query('plan') plan?: string,
  ) {
    if (!plan) {
      throw new BadRequestException('Missing plan parameter');
    }

    if (sessionId) {
      try {
        const session = await this.stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') {
          throw new Error('Payment not completed');
        }
      } catch (error) {
        this.logger.warn(`Failed to verify Stripe session: ${String(error)}`);
      }
    }

    const deepLinkUrl = this.buildDeepLink('billing/success', plan);
    return res.status(200).type('html').send(this.buildBridgeHtml(deepLinkUrl, 'Paiement confirme'));
  }

  @Get('cancel')
  async handleStripeCancel(@Res() res: Response, @Query('plan') plan?: string) {
    const deepLinkUrl = this.buildDeepLink('billing/cancel', plan || 'unknown');
    return res.status(200).type('html').send(this.buildBridgeHtml(deepLinkUrl, 'Paiement annule'));
  }

  private buildDeepLink(path: string, plan: string): string {
    const base = this.successRedirectScheme.endsWith('://')
      ? this.successRedirectScheme
      : `${this.successRedirectScheme.replace(/\/+$/, '')}://`;
    return `${base}${path}?plan=${encodeURIComponent(plan)}`;
  }

  private buildBridgeHtml(deepLinkUrl: string, title: string): string {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; background: #0f172a; color: #e2e8f0; }
      .card { max-width: 520px; margin: 8vh auto 0; background: #111827; border: 1px solid #334155; border-radius: 14px; padding: 20px; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { color: #cbd5e1; line-height: 1.5; }
      a.btn { display: inline-block; margin-top: 14px; padding: 12px 16px; border-radius: 10px; text-decoration: none; background: #06b6d4; color: #06202b; font-weight: 700; }
      .sub { margin-top: 12px; font-size: 13px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>Appuie sur le bouton ci-dessous pour revenir dans l'application.</p>
      <a class="btn" href="${deepLinkUrl}">Ouvrir l'application</a>
      <p class="sub">Si rien ne se passe automatiquement, utilise le bouton.</p>
    </div>
    <script>
      const deepLinkUrl = ${JSON.stringify(deepLinkUrl)};
      setTimeout(function () { window.location.href = deepLinkUrl; }, 250);
    </script>
  </body>
</html>`;
  }
}

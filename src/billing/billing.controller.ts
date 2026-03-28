import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';

@Controller('billing')
export class BillingController {
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
  @Redirect()
  async handleStripeSuccess(
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
        console.error('Failed to verify Stripe session:', error);
      }
    }

    const deepLinkUrl = `${this.successRedirectScheme}billing/success?plan=${encodeURIComponent(
      plan,
    )}`;
    return { url: deepLinkUrl };
  }

  @Get('cancel')
  @Redirect()
  async handleStripeCancel(@Query('plan') plan?: string) {
    const deepLinkUrl = `${this.successRedirectScheme}billing/cancel?plan=${encodeURIComponent(
      plan || 'unknown',
    )}`;
    return { url: deepLinkUrl };
  }
}

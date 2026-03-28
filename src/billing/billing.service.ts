import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripeClient: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  private getStripe(): Stripe {
    if (this.stripeClient) {
      return this.stripeClient;
    }
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key) {
      this.logger.error('STRIPE_SECRET_KEY is not set');
      throw new InternalServerErrorException('Billing is not configured');
    }
    this.stripeClient = new Stripe(key);
    return this.stripeClient;
  }

  async createSubscriptionCheckoutSession(
    plan: 'monthly' | 'yearly',
    opts?: { customerEmail?: string; userId?: string },
  ): Promise<string> {
    const priceId =
      plan === 'yearly'
        ? this.config.get<string>('STRIPE_PRICE_YEARLY')
        : this.config.get<string>('STRIPE_PRICE_MONTHLY');

    if (!priceId) {
      throw new BadRequestException('Stripe price not configured for this plan');
    }

    const successUrl = this.config.get<string>('STRIPE_SUCCESS_URL');
    const cancelUrl = this.config.get<string>('STRIPE_CANCEL_URL');
    if (!successUrl || !cancelUrl) {
      throw new BadRequestException('STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL required');
    }

    try {
      const stripe = this.getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        ...(opts?.customerEmail ? { customer_email: opts.customerEmail } : {}),
        ...(opts?.userId ? { client_reference_id: opts.userId } : {}),
      });

      if (!session.url) {
        throw new BadRequestException('Stripe did not return a checkout URL');
      }
      return session.url;
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof InternalServerErrorException) {
        throw err;
      }
      if (err instanceof Stripe.errors.StripeError) {
        this.logger.error(`Stripe error: ${err.type} ${err.message}`);
        throw new InternalServerErrorException('Unable to create checkout session');
      }
      this.logger.error('Unexpected error creating checkout session', err);
      throw new InternalServerErrorException('Unable to create checkout session');
    }
  }
}

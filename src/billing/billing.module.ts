import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeRedirectController } from './stripe-redirect.controller';

@Module({
  imports: [ConfigModule],
  controllers: [BillingController, StripeRedirectController],
  providers: [BillingService],
})
export class BillingModule {}

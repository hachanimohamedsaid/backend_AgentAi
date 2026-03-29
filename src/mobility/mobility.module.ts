import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MobilityController } from './mobility.controller';
import { MobilityProviderSimulatorController } from './mobility-provider-simulator.controller';
import { MobilityQuotesService } from './mobility-quotes.service';
import { MobilityPricingEngine } from './mobility-pricing.engine';
import { MobilityAutomationService } from './mobility-automation.service';
import { MobilityApprovalService } from './mobility-approval.service';
import { MobilityBookingService } from './mobility-booking.service';
import { MobilityRule, MobilityRuleSchema } from './schemas/mobility-rule.schema';
import {
  MobilityQuoteRun,
  MobilityQuoteRunSchema,
} from './schemas/mobility-quote-run.schema';
import {
  MobilityProposal,
  MobilityProposalSchema,
} from './schemas/mobility-proposal.schema';
import {
  MobilityBooking,
  MobilityBookingSchema,
} from './schemas/mobility-booking.schema';
import {
  MobilityProviderToken,
  MobilityProviderTokenSchema,
} from './schemas/mobility-provider-token.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MobilityRule.name, schema: MobilityRuleSchema },
      { name: MobilityQuoteRun.name, schema: MobilityQuoteRunSchema },
      { name: MobilityProposal.name, schema: MobilityProposalSchema },
      { name: MobilityBooking.name, schema: MobilityBookingSchema },
      { name: MobilityProviderToken.name, schema: MobilityProviderTokenSchema },
    ]),
  ],
  controllers: [MobilityController, MobilityProviderSimulatorController],
  providers: [
    MobilityQuotesService,
    MobilityPricingEngine,
    MobilityAutomationService,
    MobilityApprovalService,
    MobilityBookingService,
  ],
})
export class MobilityModule {}

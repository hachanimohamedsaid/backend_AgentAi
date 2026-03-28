import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  MobilityRule,
  MobilityRuleDocument,
} from './schemas/mobility-rule.schema';
import {
  MobilityProposal,
  MobilityProposalDocument,
} from './schemas/mobility-proposal.schema';
import {
  MobilityQuoteRun,
  MobilityQuoteRunDocument,
} from './schemas/mobility-quote-run.schema';
import { MobilityQuotesService } from './mobility-quotes.service';
import { MobilityPricingEngine } from './mobility-pricing.engine';
import { MobilityBookingDocument } from './schemas/mobility-booking.schema';

@Injectable()
export class MobilityAutomationService {
  private readonly logger = new Logger(MobilityAutomationService.name);

  constructor(
    @InjectModel(MobilityRule.name)
    private readonly ruleModel: Model<MobilityRuleDocument>,
    @InjectModel(MobilityQuoteRun.name)
    private readonly quoteRunModel: Model<MobilityQuoteRunDocument>,
    @InjectModel(MobilityProposal.name)
    private readonly proposalModel: Model<MobilityProposalDocument>,
    private readonly quotesService: MobilityQuotesService,
    private readonly pricingEngine: MobilityPricingEngine,
    private readonly configService: ConfigService,
    @InjectModel('MobilityBooking')
    private readonly bookingModel: Model<MobilityBookingDocument>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runDueRules() {
    const rules = await this.ruleModel.find({ enabled: true }).exec();
    for (const rule of rules) {
      if (!this.isRuleDueNow(rule, new Date())) {
        continue;
      }
      try {
        await this.triggerRule(rule);
      } catch (error) {
        this.logger.warn(
          `Rule trigger failed for rule=${String((rule as any)._id)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async triggerRule(rule: MobilityRuleDocument) {
    const pickupAt = new Date();
    const quotes = await this.quotesService.estimate({
      from: rule.from,
      to: rule.to,
      pickupAt,
    });

    const ranked = this.pricingEngine.rank(quotes, rule.preferences ?? {});
    if (!ranked.best) {
      this.logger.warn(`No quote options for rule ${String((rule as any)._id)}`);
      return;
    }

    const quoteRun = await this.quoteRunModel.create({
      userId: rule.userId,
      ruleId: (rule as any)._id.toString(),
      from: rule.from,
      to: rule.to,
      pickupAt,
      best: ranked.best,
      options: ranked.options,
    });

    const ttlMinutes = Number(
      this.configService.get<string>('MOBILITY_PROPOSAL_TTL_MINUTES') ?? '5',
    );
    const expiresAt = new Date(Date.now() + Math.max(1, ttlMinutes) * 60_000);

    const status = rule.requireUserApproval ? 'PENDING_USER_APPROVAL' : 'PENDING_PROVIDER';

    await this.proposalModel.create({
      userId: rule.userId,
      ruleId: (rule as any)._id.toString(),
      quoteRunId: (quoteRun as any)._id.toString(),
      status,
      from: rule.from,
      to: rule.to,
      pickupAt,
      best: ranked.best,
      options: ranked.options,
      expiresAt,
    });

    rule.lastTriggeredAt = new Date();
    await rule.save();

    this.logger.log(
      `Created mobility proposal for rule=${String((rule as any)._id)} user=${rule.userId}`,
    );
  }

  private isRuleDueNow(rule: MobilityRuleDocument, now: Date): boolean {
    const cron = this.parseDailyCron(rule.cron);
    if (!cron) {
      return false;
    }

    const tz = rule.timezone || this.configService.get<string>('MOBILITY_DEFAULT_TIMEZONE') || 'UTC';
    const localParts = this.getLocalParts(now, tz);

    if (localParts.hour !== cron.hour || localParts.minute !== cron.minute) {
      return false;
    }

    if (!rule.lastTriggeredAt) {
      return true;
    }

    const lastParts = this.getLocalParts(new Date(rule.lastTriggeredAt), tz);
    return !(
      lastParts.year === localParts.year &&
      lastParts.month === localParts.month &&
      lastParts.day === localParts.day &&
      lastParts.hour === localParts.hour &&
      lastParts.minute === localParts.minute
    );
  }

  private parseDailyCron(cron: string): { minute: number; hour: number } | null {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      return null;
    }
    const [minuteRaw, hourRaw, dayMonth, month, dayWeek] = parts;
    if (dayMonth !== '*' || month !== '*' || dayWeek !== '*') {
      return null;
    }
    if (minuteRaw === '*' || hourRaw === '*') {
      return null;
    }

    const minute = Number(minuteRaw);
    const hour = Number(hourRaw);
    if (
      Number.isNaN(minute) ||
      Number.isNaN(hour) ||
      minute < 0 ||
      minute > 59 ||
      hour < 0 ||
      hour > 23
    ) {
      return null;
    }
    return { minute, hour };
  }

  private getLocalParts(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date);

    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        map[part.type] = part.value;
      }
    }

    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
    };
  }

  @Cron('*/2 * * * *')
  async expireStalePendingProvider() {
    try {
      const now = new Date();
      const ttlMinutes = 5;
      const staleBefore = new Date(now.getTime() - ttlMinutes * 60 * 1000);

      const staleProposals = await this.proposalModel
        .find({
          status: 'PENDING_PROVIDER',
          confirmedAt: { $lt: staleBefore },
        })
        .exec();

      for (const proposal of staleProposals) {
        const proposalId = (proposal as any)._id.toString();
        const oldProposalStatus = proposal.status;
        proposal.status = 'EXPIRED';
        await proposal.save();

        const booking = await this.bookingModel.findOne({ proposalId }).exec();
        let oldBookingStatus: string | null = null;
        if (booking && booking.status === 'PENDING_PROVIDER') {
          oldBookingStatus = booking.status;
          booking.status = 'EXPIRED';
          await booking.save();
        }

        this.logger.log(
          JSON.stringify({
            event: 'mobility.watchdog.expired',
            proposalId,
            bookingId: booking ? (booking as any)._id.toString() : null,
            userId: proposal.userId,
            provider: proposal.selectedProvider ?? proposal.best.provider,
            oldStatus: oldProposalStatus,
            newStatus: proposal.status,
            oldBookingStatus,
            newBookingStatus: booking?.status ?? null,
            ageMinutes: ttlMinutes,
          }),
        );
      }
    } catch (error) {
      this.logger.error('Failed to expire stale pending provider bookings', error instanceof Error ? error.stack : undefined);
    }
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Resend } from 'resend';
import { RewardCoupon, RewardCouponDocument } from './schemas/reward-coupon.schema';
import { MonthlyWinner, MonthlyWinnerDocument } from './schemas/monthly-winner.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    @InjectModel(RewardCoupon.name)
    private readonly rewardCouponModel: Model<RewardCouponDocument>,
    @InjectModel(MonthlyWinner.name)
    private readonly monthlyWinnerModel: Model<MonthlyWinnerDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT, {
    timeZone: 'UTC',
  })
  async runMonthlyChampionCron(): Promise<void> {
    try {
      await this.runMonthlyWinnerJob();
    } catch (error) {
      this.logger.error(`Monthly champion cron failed: ${String(error)}`);
    }
  }

  async runMonthlyWinnerJob(now: Date = new Date()) {
    const previousMonth = this.toMonthKey(this.startOfPreviousMonth(now));
    const existing = await this.monthlyWinnerModel.findOne({ month: previousMonth }).lean().exec();
    if (existing) {
      return { status: 'already_ran', month: previousMonth, winnerUserId: existing.userId, couponCode: existing.couponCode };
    }

    const winner = await this.findMonthlyWinner(now);
    if (!winner) {
      return { status: 'no_winner', month: previousMonth };
    }

    const couponCode = this.generateCouponCode(previousMonth);
    const discountPercent = Number(this.configService.get<string>('MONTHLY_CHAMPION_DISCOUNT_PERCENT') ?? 30);

    const expiresAt = this.endOfMonth(now);

    await this.rewardCouponModel.create({
      code: couponCode,
      userId: String((winner as any)._id),
      discountPercent,
      reason: 'monthly_champion',
      month: previousMonth,
      used: false,
      expiresAt,
    });

    await this.monthlyWinnerModel.create({
      month: previousMonth,
      userId: String((winner as any)._id),
      challengePoints: winner.challengePoints ?? 0,
      couponCode,
      reason: 'monthly_champion',
    });

    await this.userModel
      .updateOne(
        { _id: (winner as any)._id },
        {
          $addToSet: {
            badges: 'Monthly Champion',
            championMonths: previousMonth,
          },
        },
      )
      .exec();

    await this.sendWinnerCouponEmail({
      email: winner.email,
      name: winner.name,
      couponCode,
      month: previousMonth,
      discountPercent,
      expiresAt,
    });

    return {
      status: 'created',
      month: previousMonth,
      winnerUserId: String((winner as any)._id),
      couponCode,
      discountPercent,
      expiresAt,
    };
  }

  async validateCouponForUser(code: string, userId: string) {
    const coupon = await this.rewardCouponModel.findOne({ code }).lean().exec();
    if (!coupon || coupon.used) {
      throw new BadRequestException('invalid_coupon');
    }
    if (coupon.userId !== userId) {
      throw new ForbiddenException('coupon_owner_mismatch');
    }
    if (new Date() > new Date(coupon.expiresAt)) {
      throw new BadRequestException('coupon_expired');
    }

    return {
      valid: true,
      code: coupon.code,
      discountPercent: coupon.discountPercent,
      month: coupon.month,
      reason: coupon.reason,
      expiresAt: coupon.expiresAt,
      used: coupon.used,
    };
  }

  async consumeCoupon(code: string, userId: string) {
    const result = await this.rewardCouponModel
      .findOneAndUpdate(
        {
          code,
          userId,
          used: false,
          expiresAt: { $gt: new Date() },
        },
        {
          $set: {
            used: true,
            usedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    return { consumed: Boolean(result), coupon: result ?? null };
  }

  async resendMonthlyCouponEmail(email: string, month?: string) {
    const targetMonth = month ?? (await this.getLatestWinnerMonth());
    if (!targetMonth) {
      throw new BadRequestException('no_monthly_winner_found');
    }

    const winner = await this.monthlyWinnerModel
      .findOne({ month: targetMonth })
      .lean()
      .exec();

    if (!winner) {
      throw new BadRequestException('monthly_winner_not_found');
    }

    const coupon = await this.rewardCouponModel
      .findOne({ code: winner.couponCode })
      .lean()
      .exec();

    if (!coupon) {
      throw new BadRequestException('monthly_coupon_not_found');
    }

    const winnerUser = await this.userModel.findById(winner.userId).lean().exec();
    const winnerName = winnerUser?.name ?? 'Champion';

    await this.sendWinnerCouponEmail({
      email,
      name: winnerName,
      couponCode: coupon.code,
      month: coupon.month,
      discountPercent: coupon.discountPercent,
      expiresAt: coupon.expiresAt,
    });

    return {
      status: 'resent',
      month: coupon.month,
      email,
      couponCode: coupon.code,
      expiresAt: coupon.expiresAt,
      used: coupon.used,
    };
  }

  private async findMonthlyWinner(now: Date): Promise<UserDocument | null> {
    const start = this.startOfPreviousMonth(now);
    const end = this.startOfMonth(now);

    const monthlyUsers = await this.userModel
      .find({
        updatedAt: { $gte: start, $lt: end },
        challengePoints: { $gt: 0 },
      })
      .sort({ challengePoints: -1, updatedAt: 1 })
      .limit(1)
      .exec();

    if (monthlyUsers.length > 0) {
      return monthlyUsers[0];
    }

    const fallback = await this.userModel
      .find({ challengePoints: { $gt: 0 } })
      .sort({ challengePoints: -1, updatedAt: 1 })
      .limit(1)
      .exec();

    return fallback[0] ?? null;
  }

  private async getLatestWinnerMonth(): Promise<string | null> {
    const latest = await this.monthlyWinnerModel
      .findOne()
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return latest?.month ?? null;
  }

  private async sendWinnerCouponEmail(data: {
    email: string;
    name: string;
    couponCode: string;
    month: string;
    discountPercent: number;
    expiresAt: Date;
  }): Promise<void> {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!resendApiKey) {
      this.logger.warn('RESEND_API_KEY not set. Monthly winner email was not sent.');
      return;
    }

    const emailFrom = this.configService.get<string>('EMAIL_FROM') ?? 'onboarding@resend.dev';
    const resend = new Resend(resendApiKey);

    const subject = `Monthly Champion Reward - ${data.month}`;
    const text = [
      `Hello ${data.name},`,
      '',
      `Congratulations! You are the Monthly Champion for ${data.month}.`,
      `Your one-time ${data.discountPercent}% coupon: ${data.couponCode}`,
      `Expires at: ${new Date(data.expiresAt).toISOString()}`,
      '',
      'Use this coupon at checkout in the app.',
    ].join('\n');

    const html = `
      <h2>Monthly Champion</h2>
      <p>Hello ${data.name},</p>
      <p>Congratulations! You are the Monthly Champion for <strong>${data.month}</strong>.</p>
      <p>Your one-time <strong>${data.discountPercent}%</strong> coupon:</p>
      <p style="font-size:20px;font-weight:700">${data.couponCode}</p>
      <p>Expires at: <strong>${new Date(data.expiresAt).toISOString()}</strong></p>
      <p>Use this coupon at checkout in the app.</p>
    `;

    try {
      await resend.emails.send({
        from: emailFrom,
        to: data.email,
        subject,
        text,
        html,
      });
    } catch (error) {
      this.logger.error(`Failed to send monthly winner email: ${String(error)}`);
      throw new ServiceUnavailableException('monthly_winner_email_failed');
    }
  }

  private toMonthKey(date: Date): string {
    const y = date.getUTCFullYear();
    const m = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    return `${y}-${m}`;
  }

  private startOfMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  }

  private startOfPreviousMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1, 0, 0, 0, 0));
  }

  private endOfMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  }

  private generateCouponCode(month: string): string {
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CHAMP-${month}-${rand}`;
  }
}

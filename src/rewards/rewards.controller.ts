import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { RewardsService } from './rewards.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { ResendMonthlyCouponDto } from './dto/resend-monthly-coupon.dto';

@Controller()
export class RewardsController {
  constructor(
    private readonly rewardsService: RewardsService,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post(['coupons/validate', 'api/coupons/validate'])
  @HttpCode(HttpStatus.OK)
  async validateCoupon(
    @Body() dto: ValidateCouponDto,
    @CurrentUser() user: UserDocument,
  ) {
    const userId = (user as any)._id?.toString();
    return this.rewardsService.validateCouponForUser(dto.couponCode, userId);
  }

  @Post(['rewards/monthly/run', 'api/rewards/monthly/run'])
  @HttpCode(HttpStatus.OK)
  async runMonthlyRewards(@Headers('x-internal-key') internalKey?: string) {
    const expected = this.configService.get<string>('REWARDS_RUN_SECRET');
    if (!expected || internalKey !== expected) {
      throw new ForbiddenException('forbidden');
    }
    return this.rewardsService.runMonthlyWinnerJob();
  }

  @Post(['rewards/monthly/resend-email', 'api/rewards/monthly/resend-email'])
  @HttpCode(HttpStatus.OK)
  async resendMonthlyRewardEmail(
    @Headers('x-internal-key') internalKey: string | undefined,
    @Body() dto: ResendMonthlyCouponDto,
  ) {
    const expected = this.configService.get<string>('REWARDS_RUN_SECRET');
    if (!expected || internalKey !== expected) {
      throw new ForbiddenException('forbidden');
    }

    return this.rewardsService.resendMonthlyCouponEmail(dto.email, dto.month);
  }

  @Post(['rewards/test-coupon', 'api/rewards/test-coupon'])
  @HttpCode(HttpStatus.CREATED)
  async generateTestCoupon(
    @Headers('x-internal-key') internalKey: string | undefined,
  ) {
    const expected = this.configService.get<string>('REWARDS_RUN_SECRET');
    if (!expected || internalKey !== expected) {
      throw new ForbiddenException('forbidden');
    }
    return this.rewardsService.generateTestCoupon();
  }
}

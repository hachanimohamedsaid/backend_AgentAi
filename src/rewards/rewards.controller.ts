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
  async runMonthlyRewards(
    @Headers('x-internal-key') internalKey?: string,
  ) {
    const expected = this.configService.get<string>('REWARDS_RUN_SECRET');
    if (!expected || internalKey !== expected) {
      throw new ForbiddenException('forbidden');
    }
    return this.rewardsService.runMonthlyWinnerJob();
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';
import { RewardCoupon, RewardCouponSchema } from './schemas/reward-coupon.schema';
import { MonthlyWinner, MonthlyWinnerSchema } from './schemas/monthly-winner.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: RewardCoupon.name, schema: RewardCouponSchema },
      { name: MonthlyWinner.name, schema: MonthlyWinnerSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}

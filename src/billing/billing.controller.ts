import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

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
}

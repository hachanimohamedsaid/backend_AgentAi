import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { EstimateRideDto } from './dto/estimate-ride.dto';
import { CreateMobilityRuleDto } from './dto/create-mobility-rule.dto';
import { UpdateMobilityRuleDto } from './dto/update-mobility-rule.dto';
import { MobilityQuotesService } from './mobility-quotes.service';
import { MobilityPricingEngine } from './mobility-pricing.engine';
import { MobilityApprovalService } from './mobility-approval.service';
import { MobilityBookingService } from './mobility-booking.service';
import {
  MobilityRule,
  MobilityRuleDocument,
} from './schemas/mobility-rule.schema';

@Controller('mobility')
@UseGuards(JwtAuthGuard)
export class MobilityController {
  constructor(
    private readonly quotesService: MobilityQuotesService,
    private readonly pricingEngine: MobilityPricingEngine,
    private readonly approvalService: MobilityApprovalService,
    private readonly bookingService: MobilityBookingService,
    @InjectModel(MobilityRule.name)
    private readonly ruleModel: Model<MobilityRuleDocument>,
  ) {}

  @Post('quotes/estimate')
  @HttpCode(HttpStatus.OK)
  async estimate(@CurrentUser() user: UserDocument, @Body() dto: EstimateRideDto) {
    const userId = (user as any)._id?.toString();
    const options = await this.quotesService.estimate({
      from: dto.from,
      to: dto.to,
      pickupAt: new Date(dto.pickupAt),
    });
    const ranked = this.pricingEngine.rank(options, dto.preferences);
    return {
      userId,
      best: ranked.best,
      options: ranked.options,
    };
  }

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  async createRule(@CurrentUser() user: UserDocument, @Body() dto: CreateMobilityRuleDto) {
    const userId = (user as any)._id?.toString();
    const rule = await this.ruleModel.create({
      userId,
      ...dto,
      preferences: {
        cheapestFirst: dto.preferences?.cheapestFirst ?? true,
        maxEtaMinutes: dto.preferences?.maxEtaMinutes ?? 20,
      },
    });
    return rule;
  }

  @Get('rules')
  async listRules(@CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.ruleModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  @Patch('rules/:id')
  async updateRule(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: UpdateMobilityRuleDto,
  ) {
    const userId = (user as any)._id?.toString();
    const updated = await this.ruleModel
      .findOneAndUpdate({ _id: id, userId }, { $set: dto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException('Mobility rule not found');
    }
    return updated;
  }

  @Get('proposals/pending')
  async pending(@CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.approvalService.getPending(userId);
  }

  @Post('proposals/:proposalId/confirm')
  async confirm(@CurrentUser() user: UserDocument, @Param('proposalId') proposalId: string) {
    const userId = (user as any)._id?.toString();
    return this.approvalService.confirm(userId, proposalId);
  }

  @Post('proposals/:proposalId/reject')
  async reject(@CurrentUser() user: UserDocument, @Param('proposalId') proposalId: string) {
    const userId = (user as any)._id?.toString();
    return this.approvalService.reject(userId, proposalId);
  }

  @Get('bookings')
  async bookings(@CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.bookingService.listForUser(userId);
  }
}

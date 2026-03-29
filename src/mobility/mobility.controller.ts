import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { EstimateRideDto } from './dto/estimate-ride.dto';
import { CreateMobilityRuleDto } from './dto/create-mobility-rule.dto';
import { UpdateMobilityRuleDto } from './dto/update-mobility-rule.dto';
import { CreateProposalDto } from './dto/create-proposal.dto';
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
    private readonly configService: ConfigService,
    @InjectModel(MobilityRule.name)
    private readonly ruleModel: Model<MobilityRuleDocument>,
  ) {}

  @Post('quotes/estimate')
  @HttpCode(HttpStatus.OK)
  async estimate(@CurrentUser() user: UserDocument, @Body() dto: EstimateRideDto) {
    const options = await this.quotesService.estimate({
      from: dto.from,
      to: dto.to,
      pickupAt: new Date(dto.pickupAt),
      fromCoordinates: dto.fromCoordinates,
      toCoordinates: dto.toCoordinates,
    });
    const ranked = this.pricingEngine.rank(options, dto.preferences);
    return {
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
      throw new NotFoundException({
        code: 'RULE_NOT_FOUND',
        message: 'Mobility rule not found',
      });
    }
    return updated;
  }

  @Get('proposals/pending')
  async pending(@CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.approvalService.getPending(userId);
  }

  @Post('proposals')
  @HttpCode(HttpStatus.CREATED)
  async createProposal(@CurrentUser() user: UserDocument, @Body() dto: CreateProposalDto) {
    const userId = (user as any)._id?.toString();
    return this.approvalService.createProposal(userId, dto);
  }

  @Post('proposals/:id/confirm')
  @Post('proposals/:proposalId/confirm')
  async confirm(
    @CurrentUser() user: UserDocument,
    @Param() params: { id?: string; proposalId?: string },
  ) {
    const userId = (user as any)._id?.toString();
    const proposalId = params.id ?? params.proposalId ?? '';
    if (!proposalId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'proposalId is required',
      });
    }
    return this.approvalService.confirm(userId, proposalId);
  }

  @Post('proposals/:id/reject')
  @Post('proposals/:proposalId/reject')
  async reject(
    @CurrentUser() user: UserDocument,
    @Param() params: { id?: string; proposalId?: string },
  ) {
    const userId = (user as any)._id?.toString();
    const proposalId = params.id ?? params.proposalId ?? '';
    if (!proposalId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'proposalId is required',
      });
    }
    return this.approvalService.reject(userId, proposalId);
  }

  @Post('proposals/:id/cancel')
  @Post('proposals/:proposalId/cancel')
  async cancel(
    @CurrentUser() user: UserDocument,
    @Param() params: { id?: string; proposalId?: string },
  ) {
    const userId = (user as any)._id?.toString();
    const proposalId = params.id ?? params.proposalId ?? '';
    if (!proposalId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'proposalId is required',
      });
    }
    return this.approvalService.cancel(userId, proposalId);
  }

  @Get('bookings')
  async bookings(@CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    const items = await this.bookingService.listForUser(userId);
    return items.map((booking: any) => ({
      id: booking.id ?? booking._id?.toString(),
      proposalId: booking.proposalId,
      provider: booking.provider,
      status: booking.status,
      providerBookingRef: booking.providerBookingRef ?? null,
      failureCode: booking.failureCode ?? null,
      failureMessage: booking.failureMessage ?? booking.errorMessage ?? null,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    }));
  }

  @Post('providers/uber/webhook')
  @HttpCode(HttpStatus.OK)
  async handleUberWebhook(
    @Headers('x-uber-webhook-secret') secretHeader: string | undefined,
    @Body()
    body: {
      proposalId?: string;
      eventType?: string;
      providerBookingRef?: string;
      [key: string]: unknown;
    },
  ) {
    const expected = this.configService.get<string>('UBER_WEBHOOK_SECRET');
    if (expected && secretHeader !== expected) {
      throw new UnauthorizedException({
        code: 'FORBIDDEN',
        message: 'Invalid webhook secret',
      });
    }

    if (!body.proposalId || !body.eventType) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'proposalId and eventType are required',
      });
    }

    return this.approvalService.handleProviderEvent(body.proposalId, body.eventType, body);
  }
}

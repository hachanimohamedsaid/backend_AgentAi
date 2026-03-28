import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  MobilityProposal,
  MobilityProposalDocument,
} from './schemas/mobility-proposal.schema';
import { MobilityBookingService } from './mobility-booking.service';
import { CreateProposalDto } from './dto/create-proposal.dto';

@Injectable()
export class MobilityApprovalService {
  constructor(
    @InjectModel(MobilityProposal.name)
    private readonly proposalModel: Model<MobilityProposalDocument>,
    private readonly bookingService: MobilityBookingService,
    private readonly configService: ConfigService,
  ) {}

  async createProposal(userId: string, dto: CreateProposalDto) {
    const ttlMinutes = Number(
      this.configService.get<string>('MOBILITY_PROPOSAL_TTL_MINUTES') ?? '5',
    );
    const expiresAt = new Date(Date.now() + Math.max(1, ttlMinutes) * 60_000);

    const minPrice = Number(dto.selectedPrice.toFixed(2));
    const maxPrice = Number((dto.selectedPrice * 1.15).toFixed(2));

    const proposal = await this.proposalModel.create({
      userId,
      ruleId: null,
      quoteRunId: null,
      status: 'PENDING_USER_APPROVAL',
      from: dto.from,
      to: dto.to,
      pickupAt: new Date(dto.pickupAt),
      best: {
        provider: dto.selectedProvider,
        minPrice,
        maxPrice,
        etaMinutes: dto.selectedEtaMinutes,
        confidence: 0.85,
        reasons: ['selected by user from current estimate'],
        globalScore: 0,
      },
      options: [],
      selectedProvider: dto.selectedProvider,
      selectedPrice: dto.selectedPrice,
      selectedEtaMinutes: dto.selectedEtaMinutes,
      fromCoordinates: dto.fromCoordinates ?? null,
      toCoordinates: dto.toCoordinates ?? null,
      routeSnapshot: dto.routeSnapshot ?? null,
      expiresAt,
      confirmedAt: null,
      rejectedAt: null,
      bookingId: null,
    });

    return this.toFrontendProposal(proposal);
  }

  async getPending(userId: string) {
    await this.expireStaleProposals(userId);
    const proposals = await this.proposalModel
      .find({ userId, status: { $in: ['PENDING_USER_APPROVAL', 'PENDING_PROVIDER'] } })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
    return proposals.map((proposal) => this.toFrontendProposal(proposal));
  }

  async confirm(userId: string, proposalId: string) {
    const proposal = await this.proposalModel.findOne({ _id: proposalId, userId }).exec();

    if (!proposal) {
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Pending proposal not found',
      });
    }

    if (proposal.status !== 'PENDING_USER_APPROVAL') {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot confirm proposal from state ${proposal.status}`,
      });
    }

    if (proposal.expiresAt.getTime() <= Date.now()) {
      proposal.status = 'EXPIRED';
      await proposal.save();
      throw new ConflictException({
        code: 'PROPOSAL_EXPIRED',
        message: 'Proposal expired',
      });
    }

    const booking = await this.bookingService.createPendingFromProposal(userId, proposal);
    proposal.status = 'PENDING_PROVIDER';
    proposal.confirmedAt = new Date();
    proposal.bookingId = (booking as any)._id?.toString() ?? null;
    await proposal.save();

    return {
      ok: true,
      proposalId: (proposal as any)._id?.toString(),
      bookingId: proposal.bookingId,
      status: proposal.status,
      message: 'Driver search started',
    };
  }

  async reject(userId: string, proposalId: string) {
    const proposal = await this.proposalModel.findOne({ _id: proposalId, userId }).exec();

    if (!proposal) {
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Pending proposal not found',
      });
    }

    if (!['PENDING_USER_APPROVAL', 'PENDING_PROVIDER'].includes(proposal.status)) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot reject proposal from state ${proposal.status}`,
      });
    }

    proposal.status = proposal.status === 'PENDING_PROVIDER' ? 'CANCELED' : 'REJECTED';
    proposal.rejectedAt = new Date();
    await proposal.save();

    await this.bookingService.updateStatusByProposalId((proposal as any)._id.toString(), proposal.status, {
      errorMessage: proposal.status === 'CANCELED' ? 'Canceled by user' : null,
    });

    return {
      ok: true,
      proposalId: (proposal as any)._id?.toString(),
      status: proposal.status,
    };
  }

  async cancel(userId: string, proposalId: string) {
    const proposal = await this.proposalModel.findOne({ _id: proposalId, userId }).exec();

    if (!proposal) {
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Proposal not found',
      });
    }

    if (['ACCEPTED', 'COMPLETED', 'FAILED', 'EXPIRED'].includes(proposal.status)) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot cancel proposal from state ${proposal.status}`,
      });
    }

    if (proposal.status !== 'CANCELED') {
      proposal.status = 'CANCELED';
      proposal.rejectedAt = new Date();
      await proposal.save();
    }

    await this.bookingService.updateStatusByProposalId((proposal as any)._id.toString(), 'CANCELED', {
      errorMessage: 'Canceled by user',
    });

    return {
      ok: true,
      proposalId: (proposal as any)._id?.toString(),
      status: proposal.status,
    };
  }

  async handleProviderEvent(
    proposalId: string,
    eventType: string,
    payload?: Record<string, unknown>,
  ) {
    const proposal = await this.proposalModel.findById(proposalId).exec();
    if (!proposal) {
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Proposal not found',
      });
    }

    const normalized = eventType.toUpperCase();
    let targetStatus: 'ACCEPTED' | 'REJECTED' | 'FAILED' | 'EXPIRED' | 'COMPLETED';

    if (normalized === 'DRIVER_ACCEPTED') {
      targetStatus = 'ACCEPTED';
    } else if (normalized === 'DRIVER_NOT_FOUND' || normalized === 'TIMEOUT') {
      targetStatus = normalized === 'TIMEOUT' ? 'EXPIRED' : 'REJECTED';
    } else if (normalized === 'TRIP_FINISHED') {
      targetStatus = 'COMPLETED';
    } else {
      targetStatus = 'FAILED';
    }

    proposal.status = targetStatus;
    await proposal.save();

    const booking = await this.bookingService.updateStatusByProposalId((proposal as any)._id.toString(), targetStatus, {
      providerBookingRef:
        typeof payload?.providerBookingRef === 'string'
          ? payload.providerBookingRef
          : null,
      providerPayloadLast: payload ?? null,
      errorMessage:
        targetStatus === 'FAILED' || targetStatus === 'REJECTED' || targetStatus === 'EXPIRED'
          ? `Provider event: ${normalized}`
          : null,
    });

    return {
      ok: true,
      proposalId: (proposal as any)._id.toString(),
      bookingId: (booking as any)?._id?.toString() ?? null,
      status: targetStatus,
    };
  }

  private toFrontendProposal(proposal: MobilityProposalDocument) {
    const id = (proposal as any)._id?.toString();
    return {
      id,
      from: proposal.from,
      to: proposal.to,
      status: proposal.status,
      provider: proposal.selectedProvider ?? proposal.best?.provider ?? null,
      selectedProvider: proposal.selectedProvider ?? proposal.best?.provider ?? null,
      selectedPrice:
        proposal.selectedPrice ??
        (proposal.best ? Number(((proposal.best.minPrice + proposal.best.maxPrice) / 2).toFixed(2)) : null),
      selectedEtaMinutes: proposal.selectedEtaMinutes ?? proposal.best?.etaMinutes ?? null,
      pickupAt: proposal.pickupAt,
      expiresAt: proposal.expiresAt,
    };
  }

  private async expireStaleProposals(userId: string) {
    await this.proposalModel
      .updateMany(
        {
          userId,
          status: { $in: ['PENDING_USER_APPROVAL', 'PENDING_PROVIDER'] },
          expiresAt: { $lte: new Date() },
        },
        { $set: { status: 'EXPIRED' } },
      )
      .exec();
  }
}

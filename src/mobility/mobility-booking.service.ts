import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MobilityBooking,
  MobilityBookingDocument,
} from './schemas/mobility-booking.schema';
import { MobilityProposalDocument } from './schemas/mobility-proposal.schema';

@Injectable()
export class MobilityBookingService {
  constructor(
    @InjectModel(MobilityBooking.name)
    private readonly bookingModel: Model<MobilityBookingDocument>,
  ) {}

  async createPendingFromProposal(
    userId: string,
    proposal: MobilityProposalDocument,
  ): Promise<MobilityBookingDocument> {
    const proposalId = (proposal as any)._id.toString();
    const provider = proposal.selectedProvider ?? proposal.best.provider;

    return this.bookingModel
      .findOneAndUpdate(
        { proposalId, userId },
        {
          $set: {
            provider,
            status: 'PENDING_PROVIDER',
            from: proposal.from,
            to: proposal.to,
            pickupAt: proposal.pickupAt,
            minPrice: proposal.best.minPrice,
            maxPrice: proposal.best.maxPrice,
            etaMinutes: proposal.best.etaMinutes,
            providerBookingRef: null,
            providerPayloadLast: null,
            errorMessage: null,
          },
          $setOnInsert: {
            proposalId,
            userId,
          },
        },
        { new: true, upsert: true },
      )
      .exec();
  }

  async updateStatusByProposalId(
    proposalId: string,
    status: 'PENDING_PROVIDER' | 'ACCEPTED' | 'REJECTED' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'COMPLETED',
    options?: {
      providerBookingRef?: string | null;
      providerPayloadLast?: Record<string, unknown> | null;
      errorMessage?: string | null;
    },
  ) {
    return this.bookingModel
      .findOneAndUpdate(
        { proposalId },
        {
          $set: {
            status,
            providerBookingRef: options?.providerBookingRef ?? null,
            providerPayloadLast: options?.providerPayloadLast ?? null,
            errorMessage: options?.errorMessage ?? null,
          },
        },
        { new: true },
      )
      .exec();
  }

  async listForUser(userId: string) {
    return this.bookingModel.find({ userId }).sort({ createdAt: -1 }).limit(100).exec();
  }
}

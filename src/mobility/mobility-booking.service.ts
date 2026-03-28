import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MobilityBooking,
  MobilityBookingDocument,
} from './schemas/mobility-booking.schema';
import {
  MobilityProposal,
  MobilityProposalDocument,
} from './schemas/mobility-proposal.schema';

@Injectable()
export class MobilityBookingService {
  constructor(
    @InjectModel(MobilityBooking.name)
    private readonly bookingModel: Model<MobilityBookingDocument>,
  ) {}

  async bookFromProposal(
    userId: string,
    proposal: MobilityProposalDocument,
  ): Promise<MobilityBookingDocument> {
    const now = Date.now();
    const booking = new this.bookingModel({
      userId,
      proposalId: (proposal as any)._id.toString(),
      provider: proposal.best.provider,
      status: 'CONFIRMED',
      from: proposal.from,
      to: proposal.to,
      pickupAt: proposal.pickupAt,
      minPrice: proposal.best.minPrice,
      maxPrice: proposal.best.maxPrice,
      etaMinutes: proposal.best.etaMinutes,
      externalBookingId: `mock_${proposal.best.provider}_${now}`,
      errorMessage: null,
    });

    return booking.save();
  }

  async listForUser(userId: string) {
    return this.bookingModel.find({ userId }).sort({ createdAt: -1 }).limit(100).exec();
  }
}

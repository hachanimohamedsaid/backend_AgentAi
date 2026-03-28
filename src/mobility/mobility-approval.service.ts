import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MobilityProposal,
  MobilityProposalDocument,
} from './schemas/mobility-proposal.schema';
import { MobilityBookingService } from './mobility-booking.service';

@Injectable()
export class MobilityApprovalService {
  constructor(
    @InjectModel(MobilityProposal.name)
    private readonly proposalModel: Model<MobilityProposalDocument>,
    private readonly bookingService: MobilityBookingService,
  ) {}

  async getPending(userId: string) {
    await this.expireStaleProposals(userId);
    return this.proposalModel
      .find({ userId, status: 'PENDING_USER_APPROVAL' })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  async confirm(userId: string, proposalId: string) {
    const proposal = await this.proposalModel
      .findOne({ _id: proposalId, userId, status: 'PENDING_USER_APPROVAL' })
      .exec();

    if (!proposal) {
      throw new NotFoundException('Pending proposal not found');
    }

    if (proposal.expiresAt.getTime() <= Date.now()) {
      proposal.status = 'EXPIRED';
      await proposal.save();
      throw new NotFoundException('Proposal expired');
    }

    const booking = await this.bookingService.bookFromProposal(userId, proposal);
    proposal.status = 'CONFIRMED';
    proposal.confirmedAt = new Date();
    proposal.bookingId = (booking as any)._id?.toString() ?? null;
    await proposal.save();

    return { proposal, booking };
  }

  async reject(userId: string, proposalId: string) {
    const proposal = await this.proposalModel
      .findOne({ _id: proposalId, userId, status: 'PENDING_USER_APPROVAL' })
      .exec();

    if (!proposal) {
      throw new NotFoundException('Pending proposal not found');
    }

    proposal.status = 'REJECTED';
    proposal.rejectedAt = new Date();
    await proposal.save();

    return { ok: true, proposal };
  }

  private async expireStaleProposals(userId: string) {
    await this.proposalModel
      .updateMany(
        {
          userId,
          status: 'PENDING_USER_APPROVAL',
          expiresAt: { $lte: new Date() },
        },
        { $set: { status: 'EXPIRED' } },
      )
      .exec();
  }
}

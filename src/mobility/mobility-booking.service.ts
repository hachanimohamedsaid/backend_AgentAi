import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
            tripStatus: null,
            userDecisionRequired: false,
            userDriverDecision: null,
            driverName: null,
            driverPhone: null,
            vehiclePlate: null,
            vehicleModel: null,
            driverLatitude: null,
            driverLongitude: null,
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
      tripStatus?: string | null;
      userDecisionRequired?: boolean;
      userDriverDecision?: 'ACCEPTED' | 'REJECTED' | null;
      driverName?: string | null;
      driverPhone?: string | null;
      vehiclePlate?: string | null;
      vehicleModel?: string | null;
      etaMinutes?: number | null;
      driverLatitude?: number | null;
      driverLongitude?: number | null;
      errorMessage?: string | null;
      failureCode?: string | null;
      failureMessage?: string | null;
    },
  ) {
    const booking = await this.bookingModel.findOne({ proposalId }).exec();
    if (!booking) {
      return null;
    }

    const current = booking.status;
    const currentIsTerminal = ['ACCEPTED', 'REJECTED', 'FAILED', 'CANCELED', 'EXPIRED', 'COMPLETED'].includes(current);
    const canAdvanceTerminal = current === 'ACCEPTED' && status === 'COMPLETED';
    if (currentIsTerminal && !canAdvanceTerminal) {
      return booking;
    }

    booking.status = status;
    booking.providerBookingRef = options?.providerBookingRef ?? booking.providerBookingRef ?? null;
    booking.providerPayloadLast = options?.providerPayloadLast ?? booking.providerPayloadLast ?? null;
    booking.tripStatus = options?.tripStatus ?? booking.tripStatus ?? null;
    booking.userDecisionRequired = options?.userDecisionRequired ?? booking.userDecisionRequired ?? false;
    booking.userDriverDecision = options?.userDriverDecision ?? booking.userDriverDecision ?? null;
    booking.driverName = options?.driverName ?? booking.driverName ?? null;
    booking.driverPhone = options?.driverPhone ?? booking.driverPhone ?? null;
    booking.vehiclePlate = options?.vehiclePlate ?? booking.vehiclePlate ?? null;
    booking.vehicleModel = options?.vehicleModel ?? booking.vehicleModel ?? null;
    booking.etaMinutes = options?.etaMinutes ?? booking.etaMinutes;
    booking.driverLatitude = options?.driverLatitude ?? booking.driverLatitude ?? null;
    booking.driverLongitude = options?.driverLongitude ?? booking.driverLongitude ?? null;
    booking.errorMessage = options?.errorMessage ?? null;
    booking.failureCode = options?.failureCode ?? booking.failureCode ?? null;
    booking.failureMessage = options?.failureMessage ?? booking.failureMessage ?? null;
    await booking.save();
    return booking;
  }

  async findByIdForUser(bookingId: string, userId: string) {
    return this.bookingModel.findOne({ _id: bookingId, userId }).exec();
  }

  async acceptDriver(bookingId: string, userId: string) {
    const booking = await this.findByIdForUser(bookingId, userId);
    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: 'Booking not found',
      });
    }

    const pendingUserDecisionStates = [
      'DRIVER_PROPOSED',
      'AWAITING_USER_CONFIRMATION',
      'AWAITING_USER_DECISION',
    ];
    const tripStatus = booking.tripStatus ?? '';
    const decisionable =
      booking.status === 'ACCEPTED' &&
      ((booking.userDecisionRequired === true && pendingUserDecisionStates.includes(tripStatus)) ||
        (booking.userDecisionRequired !== true && pendingUserDecisionStates.includes(tripStatus)));
    if (!decisionable) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot accept driver from status=${booking.status} tripStatus=${booking.tripStatus}`,
      });
    }

    booking.tripStatus = 'DRIVER_ARRIVING';
    booking.userDecisionRequired = false;
    booking.userDriverDecision = 'ACCEPTED';
    booking.failureCode = null;
    booking.failureMessage = null;
    booking.errorMessage = null;
    await booking.save();
    return booking;
  }

  async rejectDriver(bookingId: string, userId: string) {
    const booking = await this.findByIdForUser(bookingId, userId);
    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: 'Booking not found',
      });
    }

    const pendingUserDecisionStates = [
      'DRIVER_PROPOSED',
      'AWAITING_USER_CONFIRMATION',
      'AWAITING_USER_DECISION',
    ];
    const tripStatus = booking.tripStatus ?? '';
    const decisionable =
      booking.status === 'ACCEPTED' &&
      ((booking.userDecisionRequired === true && pendingUserDecisionStates.includes(tripStatus)) ||
        (booking.userDecisionRequired !== true && pendingUserDecisionStates.includes(tripStatus)));
    if (!decisionable) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot reject driver from status=${booking.status} tripStatus=${booking.tripStatus}`,
      });
    }

    booking.status = 'REJECTED';
    booking.tripStatus = 'CANCELED_BY_USER';
    booking.userDecisionRequired = false;
    booking.userDriverDecision = 'REJECTED';
    booking.failureCode = 'USER_REJECTED_DRIVER';
    booking.failureMessage = 'Driver rejected by user';
    booking.errorMessage = 'Driver rejected by user';
    await booking.save();
    return booking;
  }

  async listForUser(userId: string) {
    return this.bookingModel.find({ userId }).sort({ createdAt: -1 }).limit(100).exec();
  }
}

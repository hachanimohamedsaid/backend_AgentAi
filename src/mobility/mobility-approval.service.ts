import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from '@nestjs/common';
import {
  MobilityProposal,
  MobilityProposalDocument,
} from './schemas/mobility-proposal.schema';
import { MobilityBookingService } from './mobility-booking.service';
import { CreateProposalDto } from './dto/create-proposal.dto';

@Injectable()
export class MobilityApprovalService {
  private readonly logger = new Logger(MobilityApprovalService.name);
  private readonly terminalStatuses = new Set([
    'ACCEPTED',
    'REJECTED',
    'FAILED',
    'CANCELED',
    'EXPIRED',
    'COMPLETED',
  ]);

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
    this.logEvent('mobility.confirm.received', {
      proposalId,
      userId,
    });

    const proposal = await this.proposalModel.findOne({ _id: proposalId, userId }).exec();

    if (!proposal) {
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Pending proposal not found',
      });
    }

    if (proposal.status === 'PENDING_PROVIDER') {
      return {
        ok: true,
        proposalId: (proposal as any)._id?.toString(),
        bookingId: proposal.bookingId,
        status: proposal.status,
        message: 'Driver search already started',
      };
    }

    if (['ACCEPTED', 'REJECTED', 'FAILED', 'EXPIRED', 'CANCELED', 'COMPLETED'].includes(proposal.status)) {
      return {
        ok: true,
        proposalId: (proposal as any)._id?.toString(),
        bookingId: proposal.bookingId,
        status: proposal.status,
        message: 'Proposal already finalized',
      };
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
    this.logEvent('mobility.confirm.saved_pending_provider', {
      proposalId: (proposal as any)._id?.toString(),
      bookingId: (booking as any)?._id?.toString(),
      userId,
      oldStatus: 'PENDING_USER_APPROVAL',
      newStatus: 'PENDING_PROVIDER',
      provider: proposal.selectedProvider ?? proposal.best.provider,
    });

    proposal.status = 'PENDING_PROVIDER';
    proposal.confirmedAt = new Date();
    proposal.bookingId = (booking as any)._id?.toString() ?? null;
    await proposal.save();

    this.enqueueProviderDispatch((proposal as any)._id?.toString(), proposal.bookingId ?? '', userId);

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
    const live = this.extractLiveProviderFields(payload);
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

    const oldStatus = proposal.status;
    if (this.isTerminalStatus(oldStatus)) {
      const canAdvance = oldStatus === 'ACCEPTED' && targetStatus === 'COMPLETED';
      if (!canAdvance) {
        return {
          ok: true,
          proposalId: (proposal as any)._id.toString(),
          bookingId: proposal.bookingId ?? null,
          status: oldStatus,
        };
      }
    }

    proposal.status = targetStatus;
    await proposal.save();

    this.logEvent('mobility.proposal.status.updated', {
      providerEvent: normalized,
      proposalId: (proposal as any)._id.toString(),
      oldStatus,
      newStatus: targetStatus,
      userId: proposal.userId,
      provider: proposal.selectedProvider ?? proposal.best.provider,
    });

    const booking = await this.bookingService.updateStatusByProposalId((proposal as any)._id.toString(), targetStatus, {
      providerBookingRef:
        typeof payload?.providerBookingRef === 'string'
          ? payload.providerBookingRef
          : null,
      tripStatus:
        targetStatus === 'ACCEPTED'
          ? live.tripStatus ?? 'DRIVER_ARRIVING'
          : targetStatus === 'COMPLETED'
            ? 'COMPLETED'
            : live.tripStatus,
      driverName: live.driverName,
      driverPhone: live.driverPhone,
      vehiclePlate: live.vehiclePlate,
      vehicleModel: live.vehicleModel,
      etaMinutes: live.etaMinutes,
      driverLatitude: live.driverLatitude,
      driverLongitude: live.driverLongitude,
      providerPayloadLast: payload ?? null,
      failureCode:
        targetStatus === 'FAILED' || targetStatus === 'REJECTED' || targetStatus === 'EXPIRED'
          ? String(payload?.errorCode ?? normalized)
          : null,
      failureMessage:
        targetStatus === 'FAILED' || targetStatus === 'REJECTED' || targetStatus === 'EXPIRED'
          ? String(payload?.errorMessage ?? `Provider event: ${normalized}`)
          : null,
      errorMessage:
        targetStatus === 'FAILED' || targetStatus === 'REJECTED' || targetStatus === 'EXPIRED'
          ? String(payload?.errorMessage ?? `Provider event: ${normalized}`)
          : null,
    });

    this.logEvent('mobility.booking.status.updated', {
      providerEvent: normalized,
      proposalId: (proposal as any)._id.toString(),
      bookingId: (booking as any)?._id?.toString() ?? null,
      oldStatus,
      newStatus: targetStatus,
      userId: proposal.userId,
      provider: proposal.selectedProvider ?? proposal.best.provider,
      providerBookingRef: (booking as any)?.providerBookingRef ?? null,
      errorCode: targetStatus === 'FAILED' || targetStatus === 'REJECTED' || targetStatus === 'EXPIRED'
        ? String(payload?.errorCode ?? normalized)
        : null,
    });

    return {
      ok: true,
      proposalId: (proposal as any)._id.toString(),
      bookingId: (booking as any)?._id?.toString() ?? null,
      status: targetStatus,
      tripStatus: (booking as any)?.tripStatus ?? null,
    };
  }

  async acceptDriver(userId: string, bookingId: string) {
    const booking = await this.bookingService.acceptDriver(bookingId, userId);

    const proposal = await this.proposalModel.findOne({ _id: booking.proposalId, userId }).exec();
    if (!proposal) {
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Proposal not found',
      });
    }

    if (proposal.status !== 'ACCEPTED') {
      proposal.status = 'ACCEPTED';
      await proposal.save();
    }

    return {
      ok: true,
      bookingId: (booking as any)._id.toString(),
      proposalId: booking.proposalId,
      status: booking.status,
      tripStatus: booking.tripStatus,
    };
  }

  async rejectDriver(userId: string, bookingId: string) {
    const booking = await this.bookingService.rejectDriver(bookingId, userId);

    const proposal = await this.proposalModel.findOne({ _id: booking.proposalId, userId }).exec();
    if (!proposal) {
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Proposal not found',
      });
    }

    if (proposal.status !== 'REJECTED') {
      proposal.status = 'REJECTED';
      await proposal.save();
    }

    return {
      ok: true,
      bookingId: (booking as any)._id.toString(),
      proposalId: booking.proposalId,
      status: booking.status,
      tripStatus: booking.tripStatus,
    };
  }

  private enqueueProviderDispatch(proposalId: string, bookingId: string, userId: string) {
    this.logEvent('mobility.dispatch.enqueued', {
      proposalId,
      bookingId,
      userId,
    });

    setImmediate(() => {
      void this.dispatchProviderRequest(proposalId, bookingId, userId);
    });
  }

  private async dispatchProviderRequest(proposalId: string, bookingId: string, userId: string) {
    this.logEvent('mobility.dispatch.started', {
      proposalId,
      bookingId,
      userId,
    });

    const proposal = await this.proposalModel.findById(proposalId).exec();
    if (!proposal || proposal.status !== 'PENDING_PROVIDER') {
      return;
    }

    const dispatchUrl =
      this.configService.get<string>('PROVIDER_BASE_URL') ??
      this.configService.get<string>('UBER_DISPATCH_API_URL');
    const dispatchToken =
      this.configService.get<string>('PROVIDER_API_KEY') ??
      this.configService.get<string>('UBER_SERVER_TOKEN');
    const timeoutMs = Number(this.configService.get<string>('PROVIDER_TIMEOUT_MS') ?? '10000');

    if (!dispatchUrl) {
      const localRef = `local-${proposalId}-${Date.now()}`;
      this.logEvent('mobility.provider.response', {
        proposalId,
        bookingId,
        userId,
        provider: proposal.selectedProvider ?? proposal.best.provider,
        providerStatus: 'ACCEPTED_LOCAL',
        providerBookingRef: localRef,
      });

      await this.handleProviderEvent(proposalId, 'DRIVER_ACCEPTED', {
        providerBookingRef: localRef,
        raw: {
          mode: 'local-fallback',
          reason: 'Provider dispatch URL not configured',
        },
      });
      return;
    }

    try {
      this.logEvent('mobility.provider.request.sent', {
        proposalId,
        bookingId,
        userId,
        provider: proposal.selectedProvider ?? proposal.best.provider,
      });

      const response = await axios.post(
        dispatchUrl,
        {
          proposalId,
          bookingId,
          userId,
          provider: proposal.selectedProvider ?? proposal.best.provider,
          from: proposal.from,
          to: proposal.to,
          pickupAt: proposal.pickupAt,
        },
        {
          timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000,
          headers: {
            ...(dispatchToken ? { Authorization: `Bearer ${dispatchToken}` } : {}),
            'Content-Type': 'application/json',
          },
        },
      );

      this.logEvent('mobility.provider.response', {
        proposalId,
        bookingId,
        userId,
        provider: proposal.selectedProvider ?? proposal.best.provider,
        httpStatus: response.status,
        providerStatus: response.data?.status ?? null,
      });

      const providerStatus = String(response.data?.status ?? '').toUpperCase();
      if (providerStatus === 'ACCEPTED' || providerStatus === 'DRIVER_ACCEPTED') {
        await this.handleProviderEvent(proposalId, 'DRIVER_ACCEPTED', {
          providerBookingRef: response.data?.providerBookingRef ?? null,
          raw: response.data,
        });
      } else if (providerStatus === 'REJECTED' || providerStatus === 'DRIVER_NOT_FOUND') {
        await this.handleProviderEvent(proposalId, 'DRIVER_NOT_FOUND', {
          raw: response.data,
        });
      } else if (providerStatus === 'TIMEOUT') {
        await this.handleProviderEvent(proposalId, 'TIMEOUT', {
          raw: response.data,
        });
      } else if (providerStatus && !['PENDING', 'PROCESSING', 'QUEUED'].includes(providerStatus)) {
        await this.handleProviderEvent(proposalId, 'DISPATCH_FAILED', {
          errorCode: 'PROVIDER_UNKNOWN_STATUS',
          errorMessage: `Unsupported provider status: ${providerStatus}`,
          raw: response.data,
        });
      }
      // If provider responds with async processing state, webhook will finalize status.
    } catch (error: any) {
      const mapped = this.mapDispatchErrorToProviderFailure(error);
      this.logEvent('mobility.dispatch.failed', {
        proposalId,
        bookingId,
        userId,
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      });

      await this.handleProviderEvent(proposalId, mapped.eventType, {
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      });
    }
  }

  private mapDispatchErrorToProviderFailure(error: unknown): {
    eventType: 'TIMEOUT' | 'DRIVER_NOT_FOUND' | 'DISPATCH_FAILED';
    errorCode: string;
    errorMessage: string;
  } {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (error.code === 'ECONNABORTED') {
        return {
          eventType: 'TIMEOUT',
          errorCode: 'PROVIDER_TIMEOUT',
          errorMessage: 'Provider timeout reached',
        };
      }

      if (status === 404 || status === 409 || status === 422) {
        return {
          eventType: 'DRIVER_NOT_FOUND',
          errorCode: `PROVIDER_${status}`,
          errorMessage: 'No driver available for this request',
        };
      }

      return {
        eventType: 'DISPATCH_FAILED',
        errorCode: status ? `PROVIDER_HTTP_${status}` : 'PROVIDER_UNAVAILABLE',
        errorMessage:
          typeof error.message === 'string' && error.message.length > 0
            ? error.message
            : 'Provider request failed',
      };
    }

    return {
      eventType: 'DISPATCH_FAILED',
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  private isTerminalStatus(status: string): boolean {
    return this.terminalStatuses.has(status);
  }

  private extractLiveProviderFields(payload?: Record<string, unknown>) {
    const tripStatus = this.stringOrNull(payload?.tripStatus) ?? this.stringOrNull(payload?.status);

    const driver = (payload?.driver ?? {}) as Record<string, unknown>;
    const vehicle = (payload?.vehicle ?? {}) as Record<string, unknown>;
    const location =
      ((payload?.driverLocation ?? payload?.location) as Record<string, unknown>) ??
      {};

    return {
      tripStatus,
      driverName: this.stringOrNull(payload?.driverName) ?? this.stringOrNull(driver.name),
      driverPhone: this.stringOrNull(payload?.driverPhone) ?? this.stringOrNull(driver.phone),
      vehiclePlate: this.stringOrNull(payload?.vehiclePlate) ?? this.stringOrNull(vehicle.plate),
      vehicleModel: this.stringOrNull(payload?.vehicleModel) ?? this.stringOrNull(vehicle.model),
      etaMinutes: this.numberOrNull(payload?.etaMinutes) ?? this.numberOrNull(driver.etaMinutes),
      driverLatitude: this.numberOrNull(payload?.driverLatitude) ?? this.numberOrNull(location.latitude),
      driverLongitude: this.numberOrNull(payload?.driverLongitude) ?? this.numberOrNull(location.longitude),
    };
  }

  private stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private numberOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private logEvent(event: string, payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ event, ...payload }));
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

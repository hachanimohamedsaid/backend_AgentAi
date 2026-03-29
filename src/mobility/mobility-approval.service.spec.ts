import { ConflictException } from '@nestjs/common';
import { MobilityApprovalService } from './mobility-approval.service';

describe('MobilityApprovalService', () => {
  let service: MobilityApprovalService;

  const proposalModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
  } as any;

  const bookingService = {
    createPendingFromProposal: jest.fn(),
    updateStatusByProposalId: jest.fn(),
  } as any;

  const configService = {
    get: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MobilityApprovalService(proposalModel, bookingService, configService);
    jest.spyOn<any, any>(service as any, 'enqueueProviderDispatch').mockImplementation(() => undefined);
  });

  it('dispatchProviderRequest fails when provider URL is missing in real-only mode', async () => {
    const proposal = {
      _id: { toString: () => 'prop-fallback' },
      status: 'PENDING_PROVIDER',
      selectedProvider: 'uberx',
      best: { provider: 'uberx' },
      from: 'A',
      to: 'B',
      pickupAt: new Date(),
    } as any;

    proposalModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(proposal) });
    configService.get.mockReturnValue(undefined);

    const handleSpy = jest
      .spyOn(service as any, 'handleProviderEvent')
      .mockResolvedValue({ ok: true, status: 'FAILED' });

    await (service as any).dispatchProviderRequest('prop-fallback', 'book-fallback', 'user-1');

    expect(handleSpy).toHaveBeenCalledWith(
      'prop-fallback',
      'DISPATCH_FAILED',
      expect.objectContaining({
        errorCode: 'PROVIDER_CONFIG_MISSING',
      }),
    );
  });

  it('confirm is idempotent when already pending provider', async () => {
    const proposal = {
      _id: { toString: () => 'prop-1' },
      status: 'PENDING_PROVIDER',
      bookingId: 'book-1',
    };
    proposalModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(proposal) });

    const res = await service.confirm('user-1', 'prop-1');

    expect(res).toMatchObject({
      ok: true,
      proposalId: 'prop-1',
      bookingId: 'book-1',
      status: 'PENDING_PROVIDER',
    });
    expect(bookingService.createPendingFromProposal).not.toHaveBeenCalled();
  });

  it('confirm marks pending approval proposal as pending provider and creates booking', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const proposal = {
      _id: { toString: () => 'prop-2' },
      status: 'PENDING_USER_APPROVAL',
      bookingId: null,
      best: { provider: 'uberx' },
      expiresAt: new Date(Date.now() + 60_000),
      save,
    } as any;

    proposalModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(proposal) });
    bookingService.createPendingFromProposal.mockResolvedValue({
      _id: { toString: () => 'book-2' },
    });

    const res = await service.confirm('user-1', 'prop-2');

    expect(res).toMatchObject({
      ok: true,
      proposalId: 'prop-2',
      bookingId: 'book-2',
      status: 'PENDING_PROVIDER',
    });
    expect(proposal.status).toBe('PENDING_PROVIDER');
    expect(save).toHaveBeenCalled();
    expect(bookingService.createPendingFromProposal).toHaveBeenCalledWith('user-1', proposal);
  });

  it('confirm throws when proposal is expired', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const proposal = {
      _id: { toString: () => 'prop-3' },
      status: 'PENDING_USER_APPROVAL',
      bookingId: null,
      best: { provider: 'uberx' },
      expiresAt: new Date(Date.now() - 60_000),
      save,
    } as any;
    proposalModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(proposal) });

    await expect(service.confirm('user-1', 'prop-3')).rejects.toBeInstanceOf(ConflictException);
    expect(proposal.status).toBe('EXPIRED');
    expect(save).toHaveBeenCalled();
  });

  it('handleProviderEvent maps DRIVER_ACCEPTED to ACCEPTED and updates booking', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const proposal = {
      _id: { toString: () => 'prop-4' },
      userId: 'user-1',
      status: 'PENDING_PROVIDER',
      selectedProvider: 'uberx',
      best: { provider: 'uberx' },
      save,
    } as any;

    proposalModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(proposal) });
    bookingService.updateStatusByProposalId.mockResolvedValue({ _id: { toString: () => 'book-4' } });

    const res = await service.handleProviderEvent('prop-4', 'DRIVER_ACCEPTED', {
      providerBookingRef: 'prov-123',
    });

    expect(proposal.status).toBe('ACCEPTED');
    expect(save).toHaveBeenCalled();
    expect(bookingService.updateStatusByProposalId).toHaveBeenCalledWith(
      'prop-4',
      'ACCEPTED',
      expect.objectContaining({ providerBookingRef: 'prov-123' }),
    );
    expect(res).toMatchObject({
      ok: true,
      proposalId: 'prop-4',
      bookingId: 'book-4',
      status: 'ACCEPTED',
    });
  });

  it('handleProviderEvent extracts driver fields from nested raw payload', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const proposal = {
      _id: { toString: () => 'prop-raw' },
      userId: 'user-1',
      status: 'PENDING_PROVIDER',
      selectedProvider: 'uberx',
      best: { provider: 'uberx' },
      save,
    } as any;

    proposalModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(proposal) });
    bookingService.updateStatusByProposalId.mockResolvedValue({ _id: { toString: () => 'book-raw' } });

    await service.handleProviderEvent('prop-raw', 'DRIVER_ACCEPTED', {
      providerBookingRef: 'prov-raw',
      raw: {
        trip_status: 'AWAITING_USER_DECISION',
        driver: {
          first_name: 'Ahmed',
          last_name: 'Ben Salah',
          phone_number: '+21690000000',
          eta_minutes: '4',
          location: { lat: '25.20123', lng: '55.27111' },
        },
        vehicle: {
          license_plate: '234 TUN 4567',
          car_model: 'Toyota Corolla',
        },
      },
    });

    expect(bookingService.updateStatusByProposalId).toHaveBeenCalledWith(
      'prop-raw',
      'ACCEPTED',
      expect.objectContaining({
        tripStatus: 'AWAITING_USER_DECISION',
        driverName: 'Ahmed Ben Salah',
        driverPhone: '+21690000000',
        vehiclePlate: '234 TUN 4567',
        vehicleModel: 'Toyota Corolla',
        etaMinutes: 4,
        driverLatitude: 25.20123,
        driverLongitude: 55.27111,
      }),
    );
  });

  it('handleProviderEvent does not regress terminal proposal', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const proposal = {
      _id: { toString: () => 'prop-5' },
      userId: 'user-1',
      status: 'REJECTED',
      bookingId: 'book-5',
      selectedProvider: 'uberx',
      best: { provider: 'uberx' },
      save,
    } as any;

    proposalModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(proposal) });

    const res = await service.handleProviderEvent('prop-5', 'DISPATCH_FAILED', {
      errorCode: 'PROVIDER_HTTP_500',
      errorMessage: 'late error',
    });

    expect(res).toMatchObject({
      ok: true,
      proposalId: 'prop-5',
      bookingId: 'book-5',
      status: 'REJECTED',
    });
    expect(save).not.toHaveBeenCalled();
    expect(bookingService.updateStatusByProposalId).not.toHaveBeenCalled();
  });
});

import { MobilityBookingService } from './mobility-booking.service';

describe('MobilityBookingService', () => {
  let service: MobilityBookingService;

  const bookingModel = {
    findOne: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MobilityBookingService(bookingModel);
  });

  it('does not regress ACCEPTED booking to REJECTED', async () => {
    const save = jest.fn();
    const booking = {
      status: 'ACCEPTED',
      providerBookingRef: 'prov-1',
      providerPayloadLast: { a: 1 },
      errorMessage: null,
      save,
    };
    bookingModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(booking) });

    const res = await service.updateStatusByProposalId('prop-1', 'REJECTED', {
      errorMessage: 'should be ignored',
    });

    expect(res).toBe(booking);
    expect(booking.status).toBe('ACCEPTED');
    expect(save).not.toHaveBeenCalled();
  });

  it('updates pending booking to accepted', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const booking = {
      status: 'PENDING_PROVIDER',
      providerBookingRef: null,
      providerPayloadLast: null,
      errorMessage: null,
      save,
    };
    bookingModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(booking) });

    const res = await service.updateStatusByProposalId('prop-2', 'ACCEPTED', {
      providerBookingRef: 'prov-2',
      providerPayloadLast: { status: 'accepted' },
      errorMessage: null,
    });

    expect(res).toBe(booking);
    expect(booking.status).toBe('ACCEPTED');
    expect(booking.providerBookingRef).toBe('prov-2');
    expect(save).toHaveBeenCalled();
  });

  it('does not regress REJECTED booking to pending', async () => {
    const save = jest.fn();
    const booking = {
      status: 'REJECTED',
      providerBookingRef: null,
      providerPayloadLast: null,
      errorMessage: 'No driver',
      failureCode: 'PROVIDER_404',
      failureMessage: 'No driver',
      save,
    };
    bookingModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(booking) });

    const res = await service.updateStatusByProposalId('prop-3', 'PENDING_PROVIDER');

    expect(res).toBe(booking);
    expect(booking.status).toBe('REJECTED');
    expect(save).not.toHaveBeenCalled();
  });

  it('stores failure code and message when moving to failed', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const booking = {
      status: 'PENDING_PROVIDER',
      providerBookingRef: null,
      providerPayloadLast: null,
      errorMessage: null,
      failureCode: null,
      failureMessage: null,
      save,
    };
    bookingModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(booking) });

    await service.updateStatusByProposalId('prop-4', 'FAILED', {
      failureCode: 'PROVIDER_HTTP_500',
      failureMessage: 'Provider internal error',
      errorMessage: 'Provider internal error',
    });

    expect(booking.status).toBe('FAILED');
    expect(booking.failureCode).toBe('PROVIDER_HTTP_500');
    expect(booking.failureMessage).toBe('Provider internal error');
    expect(booking.errorMessage).toBe('Provider internal error');
    expect(save).toHaveBeenCalled();
  });

  it('acceptDriver requires user decision and marks decision accepted', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const booking = {
      _id: { toString: () => 'book-1' },
      proposalId: 'prop-1',
      status: 'ACCEPTED',
      tripStatus: 'AWAITING_USER_CONFIRMATION',
      userDecisionRequired: true,
      userDriverDecision: null,
      failureCode: null,
      failureMessage: null,
      errorMessage: null,
      save,
    };
    bookingModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(booking) });

    const res = await service.acceptDriver('book-1', 'user-1');

    expect(res).toBe(booking);
    expect(booking.tripStatus).toBe('DRIVER_ARRIVING');
    expect(booking.userDecisionRequired).toBe(false);
    expect(booking.userDriverDecision).toBe('ACCEPTED');
    expect(save).toHaveBeenCalled();
  });

  it('rejectDriver marks booking rejected and decision rejected', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const booking = {
      _id: { toString: () => 'book-2' },
      proposalId: 'prop-2',
      status: 'ACCEPTED',
      tripStatus: 'DRIVER_PROPOSED',
      userDecisionRequired: true,
      userDriverDecision: null,
      failureCode: null,
      failureMessage: null,
      errorMessage: null,
      save,
    };
    bookingModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(booking) });

    const res = await service.rejectDriver('book-2', 'user-1');

    expect(res).toBe(booking);
    expect(booking.status).toBe('REJECTED');
    expect(booking.tripStatus).toBe('CANCELED_BY_USER');
    expect(booking.userDecisionRequired).toBe(false);
    expect(booking.userDriverDecision).toBe('REJECTED');
    expect(booking.failureCode).toBe('USER_REJECTED_DRIVER');
    expect(save).toHaveBeenCalled();
  });

  it('acceptDriver supports AWAITING_USER_DECISION state', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const booking = {
      _id: { toString: () => 'book-3' },
      proposalId: 'prop-3',
      status: 'ACCEPTED',
      tripStatus: 'AWAITING_USER_DECISION',
      userDecisionRequired: false,
      userDriverDecision: null,
      failureCode: null,
      failureMessage: null,
      errorMessage: null,
      save,
    };
    bookingModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(booking) });

    const res = await service.acceptDriver('book-3', 'user-1');

    expect(res).toBe(booking);
    expect(booking.tripStatus).toBe('DRIVER_ARRIVING');
    expect(booking.userDecisionRequired).toBe(false);
    expect(booking.userDriverDecision).toBe('ACCEPTED');
    expect(save).toHaveBeenCalled();
  });
});

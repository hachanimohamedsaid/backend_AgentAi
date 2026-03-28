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
});

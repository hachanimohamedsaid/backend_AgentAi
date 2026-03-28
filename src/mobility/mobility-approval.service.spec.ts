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
});

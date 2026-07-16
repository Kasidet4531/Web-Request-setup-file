import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

describe('RequestsController draft flow', () => {
  let controller: RequestsController;
  let service: {
    createDraft: jest.Mock;
    getAllowedStatusTransitions: jest.Mock;
    getRequest: jest.Mock;
    queryRequests: jest.Mock;
    submitRequest: jest.Mock;
    updateDraftRequesterData: jest.Mock;
    updateRequestStatus: jest.Mock;
  };
  let authService: { getProfile: jest.Mock };

  beforeEach(async () => {
    service = {
      createDraft: jest.fn(),
      getAllowedStatusTransitions: jest.fn(),
      getRequest: jest.fn(),
      queryRequests: jest.fn(),
      submitRequest: jest.fn(),
      updateDraftRequesterData: jest.fn(),
      updateRequestStatus: jest.fn(),
    };
    authService = { getProfile: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RequestsController],
      providers: [
        { provide: RequestsService, useValue: service },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    controller = module.get(RequestsController);
  });

  it('creates a draft request from requester data', async () => {
    service.createDraft.mockResolvedValue({ id: 'request-1', status: 'Draft' });

    await expect(
      controller.createDraft({
        requester: 'Fook',
        requesterData: { product_type: 'New Product' },
      }),
    ).resolves.toEqual({ id: 'request-1', status: 'Draft' });

    expect(service.createDraft).toHaveBeenCalledWith({
      requester: 'Fook',
      requesterData: { product_type: 'New Product' },
    });
  });

  it('queries request list filters and pagination', async () => {
    service.queryRequests.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });

    await expect(
      controller.queryRequests({ keyword: 'probe', status: 'Submitted' }),
    ).resolves.toEqual({ items: [], total: 0, limit: 50, offset: 0 });

    expect(service.queryRequests).toHaveBeenCalledWith({
      keyword: 'probe',
      status: 'Submitted',
    });
  });

  it('loads a request detail by id', async () => {
    service.getRequest.mockResolvedValue({ id: 'request-1', status: 'Draft' });

    await expect(controller.getRequest('request-1')).resolves.toEqual({
      id: 'request-1',
      status: 'Draft',
    });
  });

  it('returns backend-authoritative status options for the authenticated actor', async () => {
    const actor = {
      id: 'user-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    authService.getProfile.mockResolvedValue(actor);
    service.getAllowedStatusTransitions.mockResolvedValue({
      allowedNextStatuses: [
        'Setup In Progress',
        'Need More Information',
        'Rejected',
      ],
    });

    await expect(
      controller.getAllowedStatusTransitions('request-1', {
        session: { userId: 'user-1' },
      } as never),
    ).resolves.toEqual({
      allowedNextStatuses: [
        'Setup In Progress',
        'Need More Information',
        'Rejected',
      ],
    });
    expect(service.getAllowedStatusTransitions).toHaveBeenCalledWith(
      'request-1',
      actor,
    );
  });

  it('rejects status-option lookup without a session user', async () => {
    await expect(
      controller.getAllowedStatusTransitions('request-1', {
        session: {},
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(service.getAllowedStatusTransitions).not.toHaveBeenCalled();
  });

  it('updates requester-owned data for a draft request', async () => {
    service.updateDraftRequesterData.mockResolvedValue({
      id: 'request-1',
      status: 'Draft',
    });

    await expect(
      controller.updateDraftRequesterData('request-1', {
        requester: 'Fook',
        requesterData: { product_type: 'Transfer Product' },
      }),
    ).resolves.toEqual({ id: 'request-1', status: 'Draft' });

    expect(service.updateDraftRequesterData).toHaveBeenCalledWith('request-1', {
      requester: 'Fook',
      requesterData: { product_type: 'Transfer Product' },
    });
  });

  it('submits a draft request by id', async () => {
    service.submitRequest.mockResolvedValue({
      id: 'request-1',
      status: 'Submitted',
    });

    await expect(
      controller.submitRequest('request-1', { formVersion: 4 }),
    ).resolves.toEqual({
      id: 'request-1',
      status: 'Submitted',
    });

    expect(service.submitRequest).toHaveBeenCalledWith('request-1', {
      formVersion: 4,
    });
  });

  it('updates workflow status with the authenticated actor profile', async () => {
    const actor = {
      id: 'user-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    authService.getProfile.mockResolvedValue(actor);
    service.updateRequestStatus.mockResolvedValue({
      id: 'request-1',
      status: 'Setup In Progress',
    });

    await expect(
      controller.updateRequestStatus(
        'request-1',
        { status: 'Setup In Progress' },
        { session: { userId: 'user-1' } } as never,
      ),
    ).resolves.toEqual({ id: 'request-1', status: 'Setup In Progress' });

    expect(service.updateRequestStatus).toHaveBeenCalledWith('request-1', {
      status: 'Setup In Progress',
      actor,
    });
  });

  it('rejects workflow status updates without a session user', async () => {
    await expect(
      controller.updateRequestStatus(
        'request-1',
        { status: 'Setup In Progress' },
        { session: {} } as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

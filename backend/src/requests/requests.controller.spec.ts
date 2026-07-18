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
    getRequestHistory: jest.Mock;
    getRequest: jest.Mock;
    queryRequests: jest.Mock;
    submitRequest: jest.Mock;
    updateDraftRequesterData: jest.Mock;
    updatePsfCreatedData: jest.Mock;
    updateRequestStatus: jest.Mock;
  };
  let authService: { getProfile: jest.Mock };

  beforeEach(async () => {
    service = {
      createDraft: jest.fn(),
      getAllowedStatusTransitions: jest.fn(),
      getRequestHistory: jest.fn(),
      getRequest: jest.fn(),
      queryRequests: jest.fn(),
      submitRequest: jest.fn(),
      updateDraftRequesterData: jest.fn(),
      updatePsfCreatedData: jest.fn(),
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

  it('creates a draft request with the authenticated server profile rather than client-supplied identity', async () => {
    const actor = {
      id: 'user-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    };
    authService.getProfile.mockResolvedValue(actor);
    service.createDraft.mockResolvedValue({ id: 'request-1', status: 'Draft' });
    const createDraft = controller.createDraft.bind(controller) as unknown as (
      body: {
        requester: string;
        requesterData: Record<string, unknown>;
      },
      request: { session: { userId?: string } },
    ) => Promise<unknown>;

    await expect(
      createDraft(
        {
          requester: 'Client supplied requester',
          requesterData: { product_type: 'New Product' },
        },
        { session: { userId: 'user-1' } },
      ),
    ).resolves.toEqual({ id: 'request-1', status: 'Draft' });

    expect(service.createDraft).toHaveBeenCalledWith(
      {
        requester: 'Client supplied requester',
        requesterData: { product_type: 'New Product' },
      },
      actor,
    );
  });

  it('rejects draft creation without a session user', async () => {
    const createDraft = controller.createDraft.bind(controller) as unknown as (
      body: {
        requesterData: Record<string, unknown>;
      },
      request: { session: { userId?: string } },
    ) => Promise<unknown>;

    await expect(
      createDraft(
        { requesterData: { product_type: 'New Product' } },
        { session: {} },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.createDraft).not.toHaveBeenCalled();
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

  it('loads request detail for the authenticated actor so PSF Created Information can be masked server-side', async () => {
    const actor = {
      id: 'user-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    };
    authService.getProfile.mockResolvedValue(actor);
    service.getRequest.mockResolvedValue({
      id: 'request-1',
      status: 'Submitted',
    });

    const getRequestForActor = controller.getRequest.bind(
      controller,
    ) as unknown as (
      requestId: string,
      request: { session: { userId?: string } },
    ) => Promise<unknown>;

    await expect(
      getRequestForActor('request-1', { session: { userId: 'user-1' } }),
    ).resolves.toEqual({ id: 'request-1', status: 'Submitted' });

    expect(service.getRequest).toHaveBeenCalledWith('request-1', actor);
  });

  it('rejects request detail lookup without a session user', async () => {
    const getRequestForActor = controller.getRequest.bind(
      controller,
    ) as unknown as (
      requestId: string,
      request: { session: { userId?: string } },
    ) => Promise<unknown>;

    await expect(
      getRequestForActor('request-1', { session: {} }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(service.getRequest).not.toHaveBeenCalled();
  });

  it('loads request history with the authenticated server profile rather than client-supplied identity', async () => {
    const actor = {
      id: 'user-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    };
    const history = [
      {
        actionType: 'REQUEST_STATUS_CHANGED',
        actorDisplayName: 'Setup Owner GNTC Demo',
        actorRole: 'setup_owner',
        createdAt: '2026-06-18T01:06:03.000Z',
        metadata: {
          fromStatus: 'Submitted',
          toStatus: 'Setup In Progress',
        },
      },
    ];
    authService.getProfile.mockResolvedValue(actor);
    service.getRequestHistory.mockResolvedValue(history);

    await expect(
      controller.getRequestHistory('request-1', {
        session: { userId: 'user-1' },
      } as never),
    ).resolves.toEqual(history);

    expect(service.getRequestHistory).toHaveBeenCalledWith('request-1', actor);
  });

  it('rejects request-history lookup without a session user', async () => {
    await expect(
      controller.getRequestHistory('request-1', {
        session: {},
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(service.getRequestHistory).not.toHaveBeenCalled();
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

  it('updates requester-owned draft data with the authenticated server profile', async () => {
    const actor = {
      id: 'user-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    };
    authService.getProfile.mockResolvedValue(actor);
    service.updateDraftRequesterData.mockResolvedValue({
      id: 'request-1',
      status: 'Draft',
    });
    const updateDraftRequesterData = controller.updateDraftRequesterData.bind(
      controller,
    ) as unknown as (
      requestId: string,
      body: {
        requester: string;
        requesterData: Record<string, unknown>;
      },
      request: { session: { userId?: string } },
    ) => Promise<unknown>;

    await expect(
      updateDraftRequesterData(
        'request-1',
        {
          requester: 'Client supplied requester',
          requesterData: { product_type: 'Transfer Product' },
        },
        { session: { userId: 'user-1' } },
      ),
    ).resolves.toEqual({ id: 'request-1', status: 'Draft' });

    expect(service.updateDraftRequesterData).toHaveBeenCalledWith(
      'request-1',
      {
        requester: 'Client supplied requester',
        requesterData: { product_type: 'Transfer Product' },
      },
      actor,
    );
  });

  it('rejects requester-owned draft updates without a session user', async () => {
    const updateDraftRequesterData = controller.updateDraftRequesterData.bind(
      controller,
    ) as unknown as (
      requestId: string,
      body: { requesterData: Record<string, unknown> },
      request: { session: { userId?: string } },
    ) => Promise<unknown>;

    await expect(
      updateDraftRequesterData(
        'request-1',
        { requesterData: { product_type: 'Transfer Product' } },
        { session: {} },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.updateDraftRequesterData).not.toHaveBeenCalled();
  });

  it('passes an authenticated actor to the PSF Created Information write service', async () => {
    const actor = {
      id: 'user-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    authService.getProfile.mockResolvedValue(actor);
    service.updatePsfCreatedData.mockResolvedValue({
      id: 'request-1',
      status: 'Setup In Progress',
    });
    const invokeUpdate = async () => {
      const updatePsfCreatedData = Reflect.get(
        controller,
        'updatePsfCreatedData',
      ) as (
        requestId: string,
        body: {
          psfCreatedData: Record<string, unknown>;
          expectedUpdatedAt: string;
        },
        request: { session: { userId?: string } },
      ) => Promise<unknown>;

      return updatePsfCreatedData.call(
        controller,
        'request-1',
        {
          psfCreatedData: { psf_setup_file_name: 'final-setup.psf' },
          expectedUpdatedAt: '2026-06-18T01:05:03.000Z',
        },
        { session: { userId: 'user-1' } },
      );
    };

    await expect(invokeUpdate()).resolves.toEqual({
      id: 'request-1',
      status: 'Setup In Progress',
    });
    expect(service.updatePsfCreatedData).toHaveBeenCalledWith('request-1', {
      actor,
      expectedUpdatedAt: '2026-06-18T01:05:03.000Z',
      psfCreatedData: { psf_setup_file_name: 'final-setup.psf' },
    });
  });

  it('forwards a null PSF Created Information body to service validation without throwing in the controller', async () => {
    const actor = {
      id: 'user-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    authService.getProfile.mockResolvedValue(actor);
    service.updatePsfCreatedData.mockResolvedValue({
      id: 'request-1',
      status: 'Setup In Progress',
    });
    const updatePsfCreatedData = Reflect.get(
      controller,
      'updatePsfCreatedData',
    ) as (
      requestId: string,
      body: null,
      request: { session: { userId?: string } },
    ) => Promise<unknown>;

    await expect(
      updatePsfCreatedData.call(controller, 'request-1', null, {
        session: { userId: 'user-1' },
      }),
    ).resolves.toEqual({ id: 'request-1', status: 'Setup In Progress' });

    expect(service.updatePsfCreatedData).toHaveBeenCalledWith('request-1', {
      actor,
      expectedUpdatedAt: undefined,
      psfCreatedData: undefined,
    });
  });

  it('rejects PSF Created Information writes without a session user', async () => {
    const invokeUpdate = async () => {
      const updatePsfCreatedData = Reflect.get(
        controller,
        'updatePsfCreatedData',
      ) as (
        requestId: string,
        body: { psfCreatedData: Record<string, unknown> },
        request: { session: { userId?: string } },
      ) => Promise<unknown>;

      return updatePsfCreatedData.call(
        controller,
        'request-1',
        { psfCreatedData: { psf_setup_file_name: 'final-setup.psf' } },
        { session: {} },
      );
    };

    await expect(invokeUpdate()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.updatePsfCreatedData).not.toHaveBeenCalled();
  });

  it('submits a draft request with the authenticated server profile', async () => {
    const actor = {
      id: 'user-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    };
    authService.getProfile.mockResolvedValue(actor);
    service.submitRequest.mockResolvedValue({
      id: 'request-1',
      status: 'Submitted',
    });
    const submitRequest = controller.submitRequest.bind(
      controller,
    ) as unknown as (
      requestId: string,
      body: { formVersion: number },
      request: { session: { userId?: string } },
    ) => Promise<unknown>;

    await expect(
      submitRequest(
        'request-1',
        { formVersion: 4 },
        { session: { userId: 'user-1' } },
      ),
    ).resolves.toEqual({
      id: 'request-1',
      status: 'Submitted',
    });

    expect(service.submitRequest).toHaveBeenCalledWith(
      'request-1',
      { formVersion: 4 },
      actor,
    );
  });

  it('rejects draft submission without a session user', async () => {
    const submitRequest = controller.submitRequest.bind(
      controller,
    ) as unknown as (
      requestId: string,
      body: { formVersion: number },
      request: { session: { userId?: string } },
    ) => Promise<unknown>;

    await expect(
      submitRequest('request-1', { formVersion: 4 }, { session: {} }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.submitRequest).not.toHaveBeenCalled();
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

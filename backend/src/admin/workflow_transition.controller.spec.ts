import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import {
  WorkflowStatusController,
  WorkflowTransitionController,
} from './workflow_transition.controller';
import { WorkflowTransitionService } from './workflow_transition.service';

const adminActor = {
  id: 'admin-1',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};

const configuration = {
  statuses: ['Review', 'Finished'],
  entries: [
    { id: 'draft-id', name: 'Draft', kind: 'draft', requestCount: null },
    { id: 'review-id', name: 'Review', kind: 'open', requestCount: 4 },
    { id: 'finished-id', name: 'Finished', kind: 'completed', requestCount: 2 },
  ],
  psfVisibilityTriggerId: null,
  updatedAt: '2026-10-01T01:02:03.123456Z',
};

const publicConfiguration = {
  statuses: ['Review', 'Finished'],
  entries: [
    { id: 'draft-id', name: 'Draft', kind: 'draft' },
    { id: 'review-id', name: 'Review', kind: 'open' },
    { id: 'finished-id', name: 'Finished', kind: 'completed' },
  ],
  psfVisibilityTriggerId: null,
  updatedAt: '2026-10-01T01:02:03.123456Z',
};

const createOperation = {
  action: 'create' as const,
  name: 'Approval',
  kind: 'open' as const,
  expectedUpdatedAt: '2026-10-01T01:02:03.123456Z',
};

describe('WorkflowTransitionController', () => {
  let authService: { getProfile: jest.Mock };
  let controller: WorkflowTransitionController;
  let statusController: WorkflowStatusController;
  let workflowTransitionService: {
    getConfiguration: jest.Mock;
    getPublicConfiguration: jest.Mock;
    applyOperation: jest.Mock;
  };

  beforeEach(async () => {
    authService = { getProfile: jest.fn() };
    workflowTransitionService = {
      getConfiguration: jest.fn(),
      getPublicConfiguration: jest.fn(),
      applyOperation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowTransitionController, WorkflowStatusController],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: WorkflowTransitionService,
          useValue: workflowTransitionService,
        },
      ],
    }).compile();

    controller = module.get(WorkflowTransitionController);
    statusController = module.get(WorkflowStatusController);
  });

  it('returns the saved configuration only after resolving the current administrator profile', async () => {
    authService.getProfile.mockResolvedValue(adminActor);
    workflowTransitionService.getConfiguration.mockResolvedValue(configuration);

    await expect(
      controller.getWorkflowTransitionConfiguration({
        session: { userId: adminActor.id },
      } as never),
    ).resolves.toEqual(configuration);

    expect(authService.getProfile).toHaveBeenCalledWith(adminActor.id);
    expect(workflowTransitionService.getConfiguration).toHaveBeenCalledWith();
  });

  it.each([
    adminActor,
    { ...adminActor, id: 'requester-1', role: 'requester' as const },
    { ...adminActor, id: 'owner-1', role: 'setup_owner' as const },
  ])(
    'returns the public catalog without usage counts to an authenticated $role',
    async (actor) => {
      authService.getProfile.mockResolvedValue(actor);
      workflowTransitionService.getPublicConfiguration.mockResolvedValue(
        publicConfiguration,
      );

      await expect(
        statusController.getStatuses({
          session: { userId: actor.id },
        } as never),
      ).resolves.toEqual(publicConfiguration);
      expect(
        workflowTransitionService.getPublicConfiguration,
      ).toHaveBeenCalledTimes(1);
      expect(workflowTransitionService.getConfiguration).not.toHaveBeenCalled();
    },
  );

  it('rejects missing or stale sessions before exposing statuses', async () => {
    await expect(
      statusController.getStatuses({ session: {} } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const stale = { session: { userId: 'missing-user' as string | undefined } };
    authService.getProfile.mockResolvedValue(null);
    await expect(
      statusController.getStatuses(stale as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(stale.session.userId).toBeUndefined();
    expect(workflowTransitionService.getConfiguration).not.toHaveBeenCalled();
    expect(
      workflowTransitionService.getPublicConfiguration,
    ).not.toHaveBeenCalled();
  });

  it('forwards a strict catalog operation with the authenticated administrator', async () => {
    authService.getProfile.mockResolvedValue(adminActor);
    workflowTransitionService.applyOperation.mockResolvedValue(configuration);

    await expect(
      controller.replaceWorkflowTransitionConfiguration(createOperation, {
        session: { userId: adminActor.id },
      } as never),
    ).resolves.toEqual(configuration);

    expect(workflowTransitionService.applyOperation).toHaveBeenCalledWith(
      createOperation,
      adminActor,
    );
  });

  it('rejects a missing or stale session before accessing configuration storage', async () => {
    const missingSession = { session: {} } as never;

    await expect(
      controller.getWorkflowTransitionConfiguration(missingSession),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.getProfile).not.toHaveBeenCalled();

    const staleSession = { session: { userId: 'missing-user' } };
    authService.getProfile.mockResolvedValue(null);

    await expect(
      controller.replaceWorkflowTransitionConfiguration(
        createOperation,
        staleSession as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(staleSession.session.userId).toBeUndefined();
    expect(workflowTransitionService.applyOperation).not.toHaveBeenCalled();
  });

  it.each([
    {
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    },
    {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    },
  ])(
    'rejects a non-admin before workflow configuration storage calls',
    async (actor) => {
      authService.getProfile.mockResolvedValue(actor);
      const request = { session: { userId: actor.id } } as never;

      await expect(
        controller.getWorkflowTransitionConfiguration(request),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        controller.replaceWorkflowTransitionConfiguration(
          createOperation,
          request,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(workflowTransitionService.getConfiguration).not.toHaveBeenCalled();
      expect(workflowTransitionService.applyOperation).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    {},
    { transitions: {} },
    { transitions: [], unexpected: true },
  ])(
    'rejects malformed operations through the real catalog validation boundary before storage access',
    async (operation) => {
      authService.getProfile.mockResolvedValue(adminActor);
      const pool = { connect: jest.fn() };
      const catalogService = new WorkflowTransitionService(
        pool as never,
        {} as never,
      );
      workflowTransitionService.applyOperation.mockImplementation((input) =>
        catalogService.applyOperation(input, adminActor),
      );

      await expect(
        controller.replaceWorkflowTransitionConfiguration(operation, {
          session: { userId: adminActor.id },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(workflowTransitionService.applyOperation).toHaveBeenCalledWith(
        operation,
        adminActor,
      );
      expect(pool.connect).not.toHaveBeenCalled();
    },
  );
});

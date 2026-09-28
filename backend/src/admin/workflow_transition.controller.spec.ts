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

const replacement = {
  transitions: [
    {
      fromStatus: 'Submitted',
      toStatus: 'Setup In Progress',
      enabled: true,
      allowedRoles: ['setup_owner'],
      allowedSetupOwnerDepartments: [],
    },
  ],
};

describe('WorkflowTransitionController', () => {
  let authService: { getProfile: jest.Mock };
  let controller: WorkflowTransitionController;
  let statusController: WorkflowStatusController;
  let workflowTransitionService: {
    getConfiguration: jest.Mock;
    replaceConfiguration: jest.Mock;
  };

  beforeEach(async () => {
    authService = { getProfile: jest.fn() };
    workflowTransitionService = {
      getConfiguration: jest.fn(),
      replaceConfiguration: jest.fn(),
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
    const configuration = {
      statuses: ['Submitted', 'Setup In Progress'],
      transitions: replacement.transitions,
    };
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
    'returns only configured statuses to an authenticated $role',
    async (actor) => {
      authService.getProfile.mockResolvedValue(actor);
      workflowTransitionService.getConfiguration.mockResolvedValue({
        statuses: ['Custom review', 'Need More Information'],
        transitions: replacement.transitions,
      });

      await expect(
        statusController.getStatuses({
          session: { userId: actor.id },
        } as never),
      ).resolves.toEqual({
        statuses: ['Custom review', 'Need More Information'],
      });
      expect(workflowTransitionService.getConfiguration).toHaveBeenCalledTimes(
        1,
      );
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
  });

  it('atomically replaces the complete configuration only for an administrator', async () => {
    const saved = {
      statuses: ['Submitted', 'Setup In Progress'],
      transitions: replacement.transitions,
    };
    authService.getProfile.mockResolvedValue(adminActor);
    workflowTransitionService.replaceConfiguration.mockResolvedValue(saved);

    await expect(
      controller.replaceWorkflowTransitionConfiguration(replacement, {
        session: { userId: adminActor.id },
      } as never),
    ).resolves.toEqual(saved);

    expect(workflowTransitionService.replaceConfiguration).toHaveBeenCalledWith(
      replacement,
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
        replacement,
        staleSession as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(staleSession.session.userId).toBeUndefined();
    expect(
      workflowTransitionService.replaceConfiguration,
    ).not.toHaveBeenCalled();
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
        controller.replaceWorkflowTransitionConfiguration(replacement, request),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(workflowTransitionService.getConfiguration).not.toHaveBeenCalled();
      expect(
        workflowTransitionService.replaceConfiguration,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    {},
    { transitions: {} },
    { transitions: [], unexpected: true },
  ])(
    'rejects malformed replacement envelopes before writing configuration',
    async (body) => {
      authService.getProfile.mockResolvedValue(adminActor);

      await expect(
        controller.replaceWorkflowTransitionConfiguration(body, {
          session: { userId: adminActor.id },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(
        workflowTransitionService.replaceConfiguration,
      ).not.toHaveBeenCalled();
    },
  );
});

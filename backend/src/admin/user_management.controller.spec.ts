import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { UserManagementController } from './user_management.controller';

const adminActor = {
  id: 'admin-1',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};

const managedSetupOwner = {
  id: 'setup-owner-1',
  username: 'setup.gntc.demo',
  displayName: 'Setup Owner GNTC Demo',
  role: 'setup_owner' as const,
  setupOwnerDepartment: 'GNTC' as const,
};

describe('UserManagementController', () => {
  let authService: {
    getProfile: jest.Mock;
    listUsers: jest.Mock;
    updateUser: jest.Mock;
  };
  let controller: UserManagementController;

  beforeEach(async () => {
    authService = {
      getProfile: jest.fn(),
      listUsers: jest.fn(),
      updateUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserManagementController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get(UserManagementController);
  });

  it('lists every user for an administrator using the current server profile', async () => {
    const users = [adminActor, managedSetupOwner];
    authService.getProfile.mockResolvedValue(adminActor);
    authService.listUsers.mockResolvedValue(users);

    await expect(
      controller.listUsers({ session: { userId: adminActor.id } } as never),
    ).resolves.toEqual(users);

    expect(authService.getProfile).toHaveBeenCalledWith(adminActor.id);
    expect(authService.listUsers).toHaveBeenCalledWith();
  });

  it('updates a user role and Setup File Owner department for an administrator', async () => {
    authService.getProfile.mockResolvedValue(adminActor);
    authService.updateUser.mockResolvedValue(managedSetupOwner);

    await expect(
      controller.updateUser(
        managedSetupOwner.id,
        { role: 'setup_owner', setupOwnerDepartment: 'GNTC' },
        { session: { userId: adminActor.id } } as never,
      ),
    ).resolves.toEqual(managedSetupOwner);

    expect(authService.updateUser).toHaveBeenCalledWith(managedSetupOwner.id, {
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    });
  });

  it('allows a non-Setup File Owner to have no department', async () => {
    const requester = {
      ...managedSetupOwner,
      role: 'requester' as const,
      setupOwnerDepartment: null,
    };
    authService.getProfile.mockResolvedValue(adminActor);
    authService.updateUser.mockResolvedValue(requester);

    await expect(
      controller.updateUser(
        requester.id,
        { role: 'requester', setupOwnerDepartment: null },
        { session: { userId: adminActor.id } } as never,
      ),
    ).resolves.toEqual(requester);
  });

  it.each([
    undefined,
    null,
    {},
    { role: 'unknown', setupOwnerDepartment: null },
    { role: 'setup_owner' },
    { role: 'setup_owner', setupOwnerDepartment: null },
    { role: 'setup_owner', setupOwnerDepartment: 'Engineering' },
    { role: 'requester', setupOwnerDepartment: 'GNTC' },
    { role: 'admin', setupOwnerDepartment: 'MFG' },
  ])(
    'rejects malformed or inconsistent role and department input',
    async (body) => {
      authService.getProfile.mockResolvedValue(adminActor);

      await expect(
        controller.updateUser(managedSetupOwner.id, body, {
          session: { userId: adminActor.id },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(authService.updateUser).not.toHaveBeenCalled();
    },
  );

  it('rejects missing sessions before listing or updating users', async () => {
    const request = { session: {} } as never;

    await expect(controller.listUsers(request)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      controller.updateUser(
        managedSetupOwner.id,
        {
          role: 'setup_owner',
          setupOwnerDepartment: 'GNTC',
        },
        request,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authService.getProfile).not.toHaveBeenCalled();
    expect(authService.listUsers).not.toHaveBeenCalled();
    expect(authService.updateUser).not.toHaveBeenCalled();
  });

  it('clears stale sessions before updating a user', async () => {
    const request = { session: { userId: 'missing-user' } };
    authService.getProfile.mockResolvedValue(null);

    await expect(
      controller.updateUser(
        managedSetupOwner.id,
        {
          role: 'setup_owner',
          setupOwnerDepartment: 'GNTC',
        },
        request as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(request.session.userId).toBeUndefined();
    expect(authService.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    {
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    },
    managedSetupOwner,
  ])(
    'rejects a non-admin before any user-management storage call',
    async (actor) => {
      authService.getProfile.mockResolvedValue(actor);
      const request = { session: { userId: actor.id } } as never;

      await expect(controller.listUsers(request)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        controller.updateUser(
          managedSetupOwner.id,
          {
            role: 'setup_owner',
            setupOwnerDepartment: 'GNTC',
          },
          request,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(authService.listUsers).not.toHaveBeenCalled();
      expect(authService.updateUser).not.toHaveBeenCalled();
    },
  );

  it('returns a not-found response when the selected user no longer exists', async () => {
    authService.getProfile.mockResolvedValue(adminActor);
    authService.updateUser.mockResolvedValue(null);

    await expect(
      controller.updateUser(
        'missing-user',
        { role: 'setup_owner', setupOwnerDepartment: 'GNTC' },
        { session: { userId: adminActor.id } } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

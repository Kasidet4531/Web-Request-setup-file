import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './session.types';

describe('AuthController', () => {
  const user = {
    id: '4cf63ae6-1488-4e15-a361-b2662f4a71ec',
    username: 'admin.demo',
    displayName: 'Admin Demo',
    role: 'admin' as const,
    setupOwnerDepartment: null,
  };

  let authService: Pick<AuthService, 'validateCredentials' | 'getProfile'>;
  let configService: ConfigService;
  let controller: AuthController;

  function createRequest(): {
    request: AuthenticatedRequest;
    save: jest.Mock;
    destroy: jest.Mock;
  } {
    const save = jest.fn((callback: (error?: Error) => void) => callback());
    const destroy = jest.fn((callback: (error?: Error) => void) => callback());

    const request = {
      session: {
        save,
        destroy,
      },
    } as unknown as AuthenticatedRequest;

    return { request, save, destroy };
  }

  beforeEach(() => {
    authService = {
      validateCredentials: jest.fn().mockResolvedValue(user),
      getProfile: jest.fn().mockResolvedValue(user),
    };
    configService = {
      get: jest.fn((_key: string, defaultValue: string) => defaultValue),
    } as unknown as ConfigService;
    controller = new AuthController(authService as AuthService, configService);
  });

  it('stores the user id in the server session after login', async () => {
    const { request, save } = createRequest();

    await expect(
      controller.login(
        { username: 'admin.demo', password: 'AdminDemo123!' },
        request,
      ),
    ).resolves.toEqual({ user });

    expect(authService.validateCredentials).toHaveBeenCalledWith(
      'admin.demo',
      'AdminDemo123!',
    );
    expect(request.session.userId).toBe(user.id);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('returns /api/me from the existing session cookie state', async () => {
    const { request } = createRequest();
    request.session.userId = user.id;

    await expect(controller.me(request)).resolves.toEqual({ user });
    expect(authService.getProfile).toHaveBeenCalledWith(user.id);
  });

  it('rejects /api/me when no authenticated session exists', async () => {
    const { request } = createRequest();

    await expect(controller.me(request)).rejects.toThrow(UnauthorizedException);
  });

  it('destroys the server session on logout and clears the cookie', async () => {
    const { request, destroy } = createRequest();
    const clearCookie = jest.fn();
    const response = { clearCookie } as unknown as Response;

    await expect(controller.logout(request, response)).resolves.toBeUndefined();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(clearCookie).toHaveBeenCalledWith('psf.sid');
  });
});

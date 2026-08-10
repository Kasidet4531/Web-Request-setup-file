import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const userId = '4cf63ae6-1488-4e15-a361-b2662f4a71ec';
  let query: jest.Mock;
  let service: AuthService;

  beforeEach(() => {
    query = jest.fn();
    service = new AuthService({ query } as unknown as Pool);
  });

  it('validates credentials against a bcrypt password hash', async () => {
    const passwordHash = await bcrypt.hash('RequesterDemo123!', 10);
    query.mockResolvedValueOnce({
      rows: [
        {
          id: userId,
          username: 'requester.demo',
          display_name: 'Requester Demo',
          password_hash: passwordHash,
          role: 'requester',
          setup_owner_department: null,
        },
      ],
    });

    await expect(
      service.validateCredentials(' requester.demo ', 'RequesterDemo123!'),
    ).resolves.toEqual({
      id: userId,
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester',
      setupOwnerDepartment: null,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE username = $1'),
      ['requester.demo'],
    );
  });

  it('rejects invalid credentials without exposing which field failed', async () => {
    const passwordHash = await bcrypt.hash('RequesterDemo123!', 10);
    query.mockResolvedValueOnce({
      rows: [
        {
          id: userId,
          username: 'requester.demo',
          display_name: 'Requester Demo',
          password_hash: passwordHash,
          role: 'requester',
          setup_owner_department: null,
        },
      ],
    });

    await expect(
      service.validateCredentials('requester.demo', 'wrong-password'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns the authenticated profile by stored session user id', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: userId,
          username: 'admin.demo',
          display_name: 'Admin Demo',
          password_hash: 'not-returned-to-client',
          role: 'admin',
          setup_owner_department: null,
        },
      ],
    });

    await expect(service.getProfile(userId)).resolves.toEqual({
      id: userId,
      username: 'admin.demo',
      displayName: 'Admin Demo',
      role: 'admin',
      setupOwnerDepartment: null,
    });
  });

  it('lists every stored user without exposing password hashes', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'requester-1',
          username: 'requester.demo',
          display_name: 'Requester Demo',
          password_hash: 'not-returned-to-client',
          role: 'requester',
          setup_owner_department: null,
        },
        {
          id: 'setup-owner-1',
          username: 'setup.gntc.demo',
          display_name: 'Setup Owner GNTC Demo',
          password_hash: 'not-returned-to-client',
          role: 'setup_owner',
          setup_owner_department: 'GNTC',
        },
      ],
    });

    await expect(service.listUsers()).resolves.toEqual([
      {
        id: 'requester-1',
        username: 'requester.demo',
        displayName: 'Requester Demo',
        role: 'requester',
        setupOwnerDepartment: null,
      },
      {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner',
        setupOwnerDepartment: 'GNTC',
      },
    ]);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM app_users'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY display_name ASC, username ASC'),
    );
  });

  it('persists a role and Setup File Owner department update for later profile reads', async () => {
    const updatedRow = {
      id: userId,
      username: 'requester.demo',
      display_name: 'Requester Demo',
      password_hash: 'not-returned-to-client',
      role: 'setup_owner',
      setup_owner_department: 'GNTC',
    };
    query.mockResolvedValueOnce({ rows: [updatedRow] });
    query.mockResolvedValueOnce({ rows: [updatedRow] });

    await expect(
      service.updateUser(userId, {
        role: 'setup_owner',
        setupOwnerDepartment: 'GNTC',
      }),
    ).resolves.toEqual({
      id: userId,
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    });
    await expect(service.getProfile(userId)).resolves.toEqual({
      id: userId,
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE app_users'),
      [userId, 'setup_owner', 'GNTC'],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE id = $1'),
      [userId],
    );
  });

  it.each([
    { role: 'setup_owner' as const, setupOwnerDepartment: null },
    { role: 'requester' as const, setupOwnerDepartment: 'GNTC' as const },
    { role: 'admin' as const, setupOwnerDepartment: 'MFG' as const },
  ])(
    'rejects an invalid role and Setup File Owner department pairing',
    async (update) => {
      await expect(service.updateUser(userId, update)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(query).not.toHaveBeenCalled();
    },
  );
});

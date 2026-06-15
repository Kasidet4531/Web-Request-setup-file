import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const userId = '4cf63ae6-1488-4e15-a361-b2662f4a71ec';
  let query: jest.Mock;
  let service: AuthService;

  beforeEach(() => {
    query = jest.fn();
    service = new AuthService({ query } as any);
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

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE username = $1'), [
      'requester.demo',
    ]);
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
});

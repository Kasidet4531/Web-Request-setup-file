import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AuthService } from './auth.service';

describe('development authentication', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let query: jest.Mock;
  let configService: { get: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    query = jest.fn();
    configService = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'DEV_AUTH_ENABLED' ? 'true' : fallback,
      ),
    };
    process.env.NODE_ENV = 'test';
    service = new AuthService(
      { query } as unknown as Pool,
      configService as unknown as ConfigService,
    );
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it.each([
    ['requester', 'dev.requester', 'requester', null],
    ['setup_owner_gntc', 'dev.setup-gntc', 'setup_owner', 'GNTC'],
    ['setup_owner_mfg', 'dev.setup-mfg', 'setup_owner', 'MFG'],
    ['admin', 'dev.admin', 'admin', null],
  ] as const)('upserts the reserved %s identity with its role and department', async (identity, username, role, department) => {
    query.mockResolvedValueOnce({
      rows: [{
        id: `${identity}-id`,
        username,
        display_name: `Development ${identity}`,
        password_hash: null,
        role,
        setup_owner_department: department,
      }],
    });

    await expect(service.loginWithDevelopmentIdentity(identity)).resolves.toMatchObject({
      username,
      role,
      setupOwnerDepartment: department,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO app_users'),
      expect.arrayContaining([username, role, department]),
    );
  });

  it('fails closed by default before any database operation', async () => {
    configService.get.mockReturnValue('false');

    await expect(service.loginWithDevelopmentIdentity('requester')).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });

  it('fails closed in production even when the flag is true', async () => {
    process.env.NODE_ENV = 'production';

    await expect(service.loginWithDevelopmentIdentity('requester')).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an invalid identity before any database operation', async () => {
    await expect(service.loginWithDevelopmentIdentity('unknown')).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });
});

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const userId = '4cf63ae6-1488-4e15-a361-b2662f4a71ec';
  let connect: jest.Mock;
  let query: jest.Mock;
  let release: jest.Mock;
  let service: AuthService;

  beforeEach(() => {
    connect = jest.fn();
    query = jest.fn();
    release = jest.fn();
    connect.mockResolvedValue({ query, release });
    service = new AuthService({ connect, query } as unknown as Pool);
  });

  function queryStatements(): string[] {
    return (query.mock.calls as unknown[][]).map(([statement]) =>
      typeof statement === 'string' ? statement : '',
    );
  }

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
    const currentRow = {
      id: userId,
      role: 'requester',
    };
    const updatedRow = {
      id: userId,
      username: 'requester.demo',
      display_name: 'Requester Demo',
      password_hash: 'not-returned-to-client',
      role: 'setup_owner',
      setup_owner_department: 'GNTC',
    };
    query.mockImplementation((statement: string) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
        return Promise.resolve({ rows: [] });
      }

      if (statement.includes('SELECT id, role')) {
        return Promise.resolve({ rows: [currentRow] });
      }

      return Promise.resolve({ rows: [updatedRow] });
    });

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

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE app_users'),
      [userId, 'setup_owner', 'GNTC'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('password_hash'),
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

  it('rejects demoting the sole administrator inside a locked transaction', async () => {
    const soleAdmin = {
      id: userId,
      username: 'admin.demo',
      display_name: 'Admin Demo',
      password_hash: 'not-returned-to-client',
      role: 'admin',
      setup_owner_department: null,
    };
    query.mockImplementation((statement: string) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
        return Promise.resolve({ rows: [] });
      }

      if (statement.includes('SELECT id, role')) {
        return Promise.resolve({ rows: [soleAdmin] });
      }

      if (statement.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ admin_count: 1 }] });
      }

      return Promise.resolve({ rows: [soleAdmin] });
    });

    await expect(
      service.updateUser(userId, {
        role: 'requester',
        setupOwnerDepartment: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE',
      ),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id, role'),
      [userId],
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('COUNT(*)'));
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('allows demoting an administrator when another administrator remains', async () => {
    const currentAdmin = {
      id: userId,
      role: 'admin',
    };
    const updatedRequester = {
      id: userId,
      username: 'admin.demo',
      display_name: 'Admin Demo',
      password_hash: 'not-returned-to-client',
      role: 'requester',
      setup_owner_department: null,
    };
    query.mockImplementation((statement: string) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
        return Promise.resolve({ rows: [] });
      }

      if (statement.includes('SELECT id, role')) {
        return Promise.resolve({ rows: [currentAdmin] });
      }

      if (statement.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ admin_count: 2 }] });
      }

      if (statement.includes('UPDATE app_users')) {
        return Promise.resolve({ rows: [updatedRequester] });
      }

      return Promise.resolve({ rows: [] });
    });

    await expect(
      service.updateUser(userId, {
        role: 'requester',
        setupOwnerDepartment: null,
      }),
    ).resolves.toEqual({
      id: userId,
      username: 'admin.demo',
      displayName: 'Admin Demo',
      role: 'requester',
      setupOwnerDepartment: null,
    });

    const statements = queryStatements();
    expect(
      statements.findIndex((statement) => statement.includes('COUNT(*)')),
    ).toBeLessThan(
      statements.findIndex((statement) =>
        statement.includes('UPDATE app_users'),
      ),
    );
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('fails closed with remediation guidance when existing users have invalid role and department data', async () => {
    query.mockImplementation((statement: string) => {
      if (
        statement.includes('FROM app_users') &&
        statement.includes('IS NOT TRUE')
      ) {
        return Promise.resolve({ rows: [{ id: userId }] });
      }

      return Promise.resolve({ rows: [] });
    });
    const ensureUsersTable = Reflect.get(
      service,
      'ensureUsersTable',
    ) as () => Promise<void>;

    await expect(ensureUsersTable.call(service)).rejects.toThrow(
      'Cannot start because app_users contains invalid role and department data.',
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ADD CONSTRAINT app_users_role_department_consistency',
      ),
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('IS NOT TRUE'));
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining(
        'VALIDATE CONSTRAINT app_users_role_department_consistency',
      ),
    );
  });

  it('creates an enforced role and department constraint for fresh user storage', async () => {
    query.mockResolvedValue({ rows: [] });
    const ensureUsersTable = Reflect.get(
      service,
      'ensureUsersTable',
    ) as () => Promise<void>;

    await expect(ensureUsersTable.call(service)).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "(role = 'setup_owner' AND setup_owner_department IS NOT NULL AND setup_owner_department IN ('GNTC', 'MFG'))",
      ),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'VALIDATE CONSTRAINT app_users_role_department_consistency',
      ),
    );
  });

  it('checks legacy rows before validating a newly added consistency constraint', async () => {
    query.mockResolvedValue({ rows: [] });
    const ensureUsersTable = Reflect.get(
      service,
      'ensureUsersTable',
    ) as () => Promise<void>;

    await ensureUsersTable.call(service);

    const statements = queryStatements();
    const addConstraintIndex = statements.findIndex((statement) =>
      statement.includes(
        'ADD CONSTRAINT app_users_role_department_consistency',
      ),
    );
    const legacyCheckIndex = statements.findIndex((statement) =>
      statement.includes('IS NOT TRUE'),
    );
    const validateIndex = statements.findIndex((statement) =>
      statement.includes(
        'VALIDATE CONSTRAINT app_users_role_department_consistency',
      ),
    );

    expect(addConstraintIndex).toBeGreaterThanOrEqual(0);
    expect(legacyCheckIndex).toBeGreaterThan(addConstraintIndex);
    expect(validateIndex).toBeGreaterThan(legacyCheckIndex);
  });

  it('remains rerunnable after a valid existing user table has been checked', async () => {
    query.mockResolvedValue({ rows: [] });
    const ensureUsersTable = Reflect.get(
      service,
      'ensureUsersTable',
    ) as () => Promise<void>;

    await ensureUsersTable.call(service);
    await ensureUsersTable.call(service);

    const validationStatements = queryStatements().filter((statement) =>
      statement.includes(
        'VALIDATE CONSTRAINT app_users_role_department_consistency',
      ),
    );
    const legacyChecks = queryStatements().filter((statement) =>
      statement.includes('IS NOT TRUE'),
    );

    expect(validationStatements).toHaveLength(2);
    expect(legacyChecks).toHaveLength(2);
  });
});

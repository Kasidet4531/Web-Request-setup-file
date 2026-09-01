import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const userId = '4cf63ae6-1488-4e15-a361-b2662f4a71ec';
  const ldapData = {
    email: 'ldap.user@example.test',
    name: 'LDAP Example User',
    user: 'ldap.user.example.test',
    employeeId: 'example-123',
    title: 'Example Engineer',
  };
  let connect: jest.Mock;
  let query: jest.Mock;
  let release: jest.Mock;
  let configService: {
    get: jest.Mock;
    getOrThrow: jest.Mock;
  };
  let fetchMock: jest.Mock;
  let originalFetch: typeof global.fetch;
  let service: AuthService;

  beforeEach(() => {
    connect = jest.fn();
    query = jest.fn();
    release = jest.fn();
    connect.mockResolvedValue({ query, release });
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'LDAP_AUTH_TIMEOUT_MS') {
          return '10000';
        }

        return fallback;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'LDAP_AUTH_URL') {
          return 'https://ldap.example.test/login';
        }

        throw new Error(`Unexpected required configuration key: ${key}`);
      }),
    };
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = new AuthService(
      { connect, query } as unknown as Pool,
      configService as unknown as ConfigService,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function queryStatements(): string[] {
    return (query.mock.calls as unknown[][]).map(([statement]) =>
      typeof statement === 'string' ? statement : '',
    );
  }

  function mockSuccessfulLdapResponse(): void {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        status: '200',
        message: null,
        data: ldapData,
      }),
    });
  }

  function mockLdapUserRow(
    role: 'requester' | 'setup_owner' | 'admin' = 'requester',
    setupOwnerDepartment: 'GNTC' | 'MFG' | null = null,
  ): void {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: userId,
          username: ldapData.user,
          display_name: ldapData.name,
          password_hash: null,
          role,
          setup_owner_department: setupOwnerDepartment,
          email: ldapData.email,
          employee_id: ldapData.employeeId,
          title: ldapData.title,
        },
      ],
    });
  }

  it('authenticates a matching LDAP identity and creates a requester with a null password hash', async () => {
    mockSuccessfulLdapResponse();
    mockLdapUserRow();

    await expect(
      service.validateCredentials(
        ' LDAP.USER.EXAMPLE.TEST ',
        'example-password',
      ),
    ).resolves.toEqual({
      id: userId,
      username: ldapData.user,
      displayName: ldapData.name,
      role: 'requester',
      setupOwnerDepartment: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ldap.example.test/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: ldapData.user,
          password: 'example-password',
        }),
      }),
    );
    const fetchCalls = fetchMock.mock.calls as unknown as [
      unknown,
      RequestInit | undefined,
    ][];
    const requestOptions = fetchCalls[0]?.[1];
    expect(requestOptions?.signal).toBeInstanceOf(AbortSignal);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO app_users'),
      [
        ldapData.user,
        ldapData.name,
        ldapData.email,
        ldapData.employeeId,
        ldapData.title,
      ],
    );
  });

  it('refreshes LDAP metadata without changing local role or department', async () => {
    mockSuccessfulLdapResponse();
    mockLdapUserRow('setup_owner', 'GNTC');

    await expect(
      service.validateCredentials(ldapData.user, 'example-password'),
    ).resolves.toEqual({
      id: userId,
      username: ldapData.user,
      displayName: ldapData.name,
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    });

    const upsert = queryStatements().find((statement) =>
      statement.includes('ON CONFLICT (username) DO UPDATE'),
    );
    expect(upsert).toContain(
      "VALUES ($1, $2, NULL, 'requester', NULL, $3, $4, $5)",
    );
    expect(upsert).toContain('display_name = EXCLUDED.display_name');
    expect(upsert).toContain('email = EXCLUDED.email');
    expect(upsert).toContain('employee_id = EXCLUDED.employee_id');
    expect(upsert).toContain('title = EXCLUDED.title');
    expect(upsert).toContain('updated_at = NOW()');
    const conflictClause = upsert?.slice(upsert.indexOf('ON CONFLICT'));
    expect(conflictClause).not.toContain('role');
    expect(conflictClause).not.toContain('setup_owner_department');
  });

  it.each([
    { ok: true, status: 200 },
    { ok: false, status: 401 },
  ])('maps LDAP body status 401 to UnauthorizedException', async (response) => {
    fetchMock.mockResolvedValue({
      ...response,
      json: jest.fn().mockResolvedValue({
        status: '401',
        message: null,
        data: null,
      }),
    });

    await expect(
      service.validateCredentials(ldapData.user, 'wrong-example-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(query).not.toHaveBeenCalled();
  });

  it('maps non-2xx LDAP responses to ServiceUnavailableException', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: jest.fn().mockResolvedValue({
        status: '200',
        message: null,
        data: ldapData,
      }),
    });

    await expect(
      service.validateCredentials(ldapData.user, 'example-password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'malformed LDAP data',
      body: { status: '200', message: null, data: { user: ldapData.user } },
    },
    {
      name: 'unexpected LDAP status',
      body: { status: '500', message: null, data: null },
    },
  ])('maps $name to ServiceUnavailableException', async ({ body }) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(body),
    });

    await expect(
      service.validateCredentials(ldapData.user, 'example-password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(query).not.toHaveBeenCalled();
  });

  it('maps malformed LDAP JSON to ServiceUnavailableException', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('invalid JSON')),
    });

    await expect(
      service.validateCredentials(ldapData.user, 'example-password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an LDAP response for a different normalized username', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        status: '200',
        message: null,
        data: { ...ldapData, user: 'other.user.example.test' },
      }),
    });

    await expect(
      service.validateCredentials(ldapData.user, 'example-password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    new TypeError('network failure'),
    new DOMException('The operation timed out.', 'TimeoutError'),
  ])(
    'maps LDAP transport and timeout failures to ServiceUnavailableException',
    async (error) => {
      fetchMock.mockRejectedValue(error);

      await expect(
        service.validateCredentials(ldapData.user, 'example-password'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['', 'example-password'],
    ['   ', 'example-password'],
    [ldapData.user, ''],
  ])(
    'rejects blank credentials before calling LDAP',
    async (username, password) => {
      await expect(
        service.validateCredentials(username, password),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('uses a configured positive LDAP timeout', async () => {
    const timeoutSpy = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(new AbortController().signal);
    configService.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'LDAP_AUTH_TIMEOUT_MS' ? '2500' : fallback,
    );
    mockSuccessfulLdapResponse();
    mockLdapUserRow();

    await service.validateCredentials(ldapData.user, 'example-password');

    expect(timeoutSpy).toHaveBeenCalledWith(2500);
  });

  it('falls back to the default LDAP timeout for a non-positive setting', async () => {
    const timeoutSpy = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(new AbortController().signal);
    configService.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'LDAP_AUTH_TIMEOUT_MS' ? '0' : fallback,
    );
    mockSuccessfulLdapResponse();
    mockLdapUserRow();

    await service.validateCredentials(ldapData.user, 'example-password');

    expect(timeoutSpy).toHaveBeenCalledWith(10000);
  });

  it('creates the configured initial administrator only when app_users is empty', async () => {
    configService.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'INITIAL_ADMIN_USERNAME'
        ? ' INITIAL.ADMIN.EXAMPLE.TEST '
        : fallback,
    );
    query
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const provisionInitialAdmin = Reflect.get(
      service,
      'provisionInitialAdmin',
    ) as () => Promise<void>;

    await provisionInitialAdmin.call(service);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'SELECT COUNT(*)::int AS count FROM app_users',
    );
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("VALUES ($1, $1, NULL, 'admin', NULL)"),
      ['initial.admin.example.test'],
    );
  });

  it('does not create an initial administrator when app_users already has rows', async () => {
    configService.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'INITIAL_ADMIN_USERNAME'
        ? 'initial.admin.example.test'
        : fallback,
    );
    query.mockResolvedValueOnce({ rows: [{ count: 1 }] });
    const provisionInitialAdmin = Reflect.get(
      service,
      'provisionInitialAdmin',
    ) as () => Promise<void>;

    await provisionInitialAdmin.call(service);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('ignores a blank initial administrator setting', async () => {
    configService.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'INITIAL_ADMIN_USERNAME' ? '   ' : fallback,
    );
    const provisionInitialAdmin = Reflect.get(
      service,
      'provisionInitialAdmin',
    ) as () => Promise<void>;

    await provisionInitialAdmin.call(service);

    expect(query).not.toHaveBeenCalled();
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

  it('makes password hashes nullable without defaults in fresh and existing user storage', async () => {
    query.mockResolvedValue({ rows: [] });
    const ensureUsersTable = Reflect.get(
      service,
      'ensureUsersTable',
    ) as () => Promise<void>;

    await ensureUsersTable.call(service);

    const statements = queryStatements();
    const createTable = statements.find((statement) =>
      statement.includes('CREATE TABLE IF NOT EXISTS app_users'),
    );
    const passwordHashMigration = statements.find((statement) =>
      statement.includes('ALTER COLUMN password_hash DROP NOT NULL'),
    );

    expect(createTable).toContain('password_hash TEXT,');
    expect(createTable).not.toContain('password_hash TEXT NOT NULL');
    expect(passwordHashMigration).toContain(
      'ALTER COLUMN password_hash DROP DEFAULT',
    );
    expect(passwordHashMigration).toContain(
      'ADD COLUMN IF NOT EXISTS email TEXT',
    );
    expect(passwordHashMigration).toContain(
      'ADD COLUMN IF NOT EXISTS employee_id TEXT',
    );
    expect(passwordHashMigration).toContain(
      'ADD COLUMN IF NOT EXISTS title TEXT',
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

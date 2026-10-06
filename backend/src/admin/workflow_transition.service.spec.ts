import { BadRequestException, ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
import {
  AuditLogService,
  REQUEST_AUDIT_ACTION,
} from '../audit/audit_log.service';
import { WorkflowTransitionService } from './workflow_transition.service';

const UPDATED_AT = '2026-10-01T01:02:03.123456Z';
const ADMIN = {
  id: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};
const REQUIRED_PSF_SCHEMA = {
  formKey: 'psf-created-information',
  version: 1,
  title: 'PSF Created Information',
  sections: [
    {
      sectionKey: 'psf',
      title: 'PSF',
      fields: [
        {
          fieldKey: 'setup',
          canonicalKey: 'setup',
          label: 'Setup',
          type: 'text' as const,
          required: true,
        },
      ],
    },
  ],
};

describe('WorkflowTransitionService status catalog', () => {
  let service: WorkflowTransitionService;
  let pool: { query: jest.Mock; connect: jest.Mock };
  let client: { query: jest.Mock; release: jest.Mock };
  let audit: { record: jest.Mock };
  let stored: unknown;
  let replacementRows: Array<Record<string, unknown>>;
  let transactionStored: unknown;

  beforeEach(() => {
    stored = null;
    replacementRows = [];
    transactionStored = null;
    const execute = (
      sql: string,
      values: unknown[] = [],
      transaction = false,
    ) => {
      if (sql.includes('INSERT INTO workflow_transition_config')) {
        stored ??= values[1];
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('SELECT config_json')) {
        return Promise.resolve({
          rows: stored
            ? [
                {
                  config_json: transaction
                    ? (transactionStored ?? stored)
                    : stored,
                  updated_at_version: UPDATED_AT,
                },
              ]
            : [],
        });
      }
      if (sql.includes('COUNT(*)::int AS request_count')) {
        return Promise.resolve({
          rows: [
            { status: 'Draft', request_count: 99 },
            { status: 'Work', request_count: 3 },
          ],
        });
      }
      if (sql.includes('FROM psf_requests') && sql.includes('FOR UPDATE')) {
        return Promise.resolve({ rows: replacementRows });
      }
      if (sql.includes('UPDATE workflow_transition_config')) {
        if (transaction) transactionStored = values[1];
        else stored = values[1];
        return Promise.resolve({ rowCount: 1, rows: [] });
      }
      if (sql.includes('UPDATE psf_requests') && sql.includes('RETURNING')) {
        return Promise.resolve({
          rows: replacementRows.map((row) => ({ ...row, status: values[1] })),
        });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    };
    client = {
      query: jest.fn(async (sql: string, values?: unknown[]) => {
        if (sql === 'BEGIN') {
          transactionStored = stored;
          return { rows: [] };
        }
        if (sql === 'COMMIT') {
          stored = transactionStored;
          return { rows: [] };
        }
        if (sql === 'ROLLBACK') {
          transactionStored = stored;
          return { rows: [] };
        }
        return execute(sql, values, true);
      }),
      release: jest.fn(),
    };
    pool = {
      query: jest.fn((sql: string, values?: unknown[]) => execute(sql, values)),
      connect: jest.fn().mockResolvedValue(client),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new WorkflowTransitionService(
      pool as unknown as Pool,
      audit as unknown as AuditLogService,
    );
  });

  it('seeds the verbatim catalog, returns semantic kinds and hides Draft usage counts', async () => {
    await service.onModuleInit();
    const configuration = await service.getConfiguration();
    expect(configuration.entries[0]).toMatchObject({
      name: 'Draft',
      kind: 'draft',
      requestCount: null,
    });
    expect(configuration.entries).toHaveLength(17);
    expect(configuration.entries.map(({ name }) => name)).toContain(
      '85 % -- Reject check list',
    );
    expect(
      configuration.entries.find(
        ({ name }) => name === '5% -- Reject (Information not complete)',
      )?.kind,
    ).toBe('open');
    expect(
      configuration.entries.find(({ name }) => name === '100% -- Completed')
        ?.kind,
    ).toBe('completed');
    expect(
      configuration.entries.find(
        ({ name }) => name === '0% -- Rejected (Cancel Request)',
      )?.kind,
    ).toBe('cancelled');
    expect(configuration.psfVisibilityTriggerId).toBeNull();
    expect(configuration.entries[1]?.requestCount).toBe(0);
    const countQueriesBefore = pool.query.mock.calls.filter(([sql]) =>
      String(sql).includes('COUNT(*)::int AS request_count'),
    ).length;
    const publicConfiguration = await service.getPublicConfiguration();
    expect(publicConfiguration.entries[0]).not.toHaveProperty('requestCount');
    expect(
      pool.query.mock.calls.filter(([sql]) =>
        String(sql).includes('COUNT(*)::int AS request_count'),
      ),
    ).toHaveLength(countQueriesBefore);
  });

  it('requires strict operation shapes and the exact opaque revision token', async () => {
    await service.onModuleInit();
    await expect(
      service.applyOperation({ transitions: [] }, ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pool.connect).not.toHaveBeenCalled();
    await expect(
      service.applyOperation(
        {
          action: 'create',
          name: 'Work',
          kind: 'open',
          expectedUpdatedAt: UPDATED_AT,
          unexpected: true,
        },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.applyOperation(
        {
          action: 'create',
          name: 'New status',
          kind: 'open',
          expectedUpdatedAt: '2026-10-01T01:02:03.123455Z',
        },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('creates with an explicit kind, preserves the exact label, and audits in the catalog transaction', async () => {
    await service.onModuleInit();
    const result = await service.applyOperation(
      {
        action: 'create',
        name: '  New work  ',
        kind: 'open',
        expectedUpdatedAt: UPDATED_AT,
      },
      ADMIN,
    );
    expect(result.entries.at(-1)).toMatchObject({
      name: '  New work  ',
      kind: 'open',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: null,
        actionType: REQUEST_AUDIT_ACTION.WORKFLOW_CATALOG_UPDATED,
        actor: ADMIN,
      }),
      client,
    );
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it.each([
    { action: 'rename', id: 'not-a-uuid', name: 'Work' },
    { action: 'delete', id: 'not-a-uuid' },
    {
      action: 'delete',
      id: '00000000-0000-4000-8000-000000000002',
      replacementId: 'not-a-uuid',
    },
    {
      action: 'delete',
      id: '00000000-0000-4000-8000-000000000002',
      replacementTriggerId: 'not-a-uuid',
    },
    { action: 'settings', psfVisibilityTriggerId: 'not-a-uuid' },
    {
      action: 'rename',
      id: ' 00000000-0000-4000-8000-000000000002 ',
      name: 'Work',
    },
    { action: 'delete', id: '' },
    {
      action: 'delete',
      id: '00000000-0000-4000-8000-000000000002',
      replacementId: '00000000-0000-0000-0000-000000000002',
    },
    {
      action: 'delete',
      id: '00000000-0000-4000-8000-000000000002',
      replacementTriggerId: ' 00000000-0000-4000-8000-000000000003 ',
    },
    {
      action: 'settings',
      psfVisibilityTriggerId: '00000000-0000-0000-0000-000000000002',
    },
    ...['', ' \t\n ', 'Draft', ' dRaFt '].flatMap((name) => [
      { action: 'create', name, kind: 'open' },
      { action: 'rename', id: '00000000-0000-4000-8000-000000000002', name },
    ]),
  ])(
    'rejects malformed catalog syntax %p before storage or audit',
    async (operation) => {
      pool.connect.mockRejectedValue(new Error('STORAGE_REACHED'));
      await expect(
        service.applyOperation(
          { ...operation, expectedUpdatedAt: UPDATED_AT },
          ADMIN,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pool.connect).not.toHaveBeenCalled();
      expect(pool.query).not.toHaveBeenCalled();
      expect(client.query).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it.each([
    { action: 'create', name: '  New work  ', kind: 'open' },
    {
      action: 'rename',
      id: '00000000-0000-4000-8000-000000000002',
      name: '  New work  ',
    },
    {
      action: 'delete',
      id: '00000000-0000-4000-8000-000000000002',
      replacementId: '00000000-0000-4000-8000-000000000003',
      replacementTriggerId: '00000000-0000-4000-8000-000000000004',
    },
    {
      action: 'delete',
      id: '00000000-0000-4000-8000-000000000002',
      replacementTriggerId: null,
    },
    {
      action: 'settings',
      psfVisibilityTriggerId: '00000000-0000-4000-8000-000000000002',
    },
    { action: 'settings', psfVisibilityTriggerId: null },
  ])(
    'allows valid syntax %p through to the transaction boundary',
    async (operation) => {
      pool.connect.mockRejectedValue(new Error('STORAGE_REACHED'));
      await expect(
        service.applyOperation(
          { ...operation, expectedUpdatedAt: UPDATED_AT },
          ADMIN,
        ),
      ).rejects.toThrow('STORAGE_REACHED');
      expect(pool.connect).toHaveBeenCalledTimes(1);
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it.each([
    { action: 'create', name: ' 100% -- Completed ', kind: 'open' },
    {
      action: 'rename',
      id: '00000000-0000-4000-8000-000000000002',
      name: '100% -- Completed',
    },
    {
      action: 'rename',
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Work',
    },
    { action: 'delete', id: '00000000-0000-4000-8000-000000000001' },
    {
      action: 'delete',
      id: '00000000-0000-4000-8000-000000000002',
      replacementId: '00000000-0000-4000-8000-000000000002',
    },
    {
      action: 'delete',
      id: '00000000-0000-4000-8000-000000000002',
      replacementId: '00000000-0000-4000-8000-000000000001',
    },
    {
      action: 'settings',
      psfVisibilityTriggerId: '00000000-0000-4000-8000-000000000001',
    },
    {
      action: 'rename',
      id: '00000000-0000-4000-8000-000000000099',
      name: 'Work',
    },
  ])(
    'rechecks catalog-dependent rejection %p under the lock',
    async (operation) => {
      await service.onModuleInit();
      await expect(
        service.applyOperation(
          { ...operation, expectedUpdatedAt: UPDATED_AT },
          ADMIN,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pool.connect).toHaveBeenCalledTimes(1);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        ['status-catalog-v1'],
      );
      expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('preserves renamed labels verbatim through catalog and request/projection updates', async () => {
    await service.onModuleInit();
    const result = await service.applyOperation(
      {
        action: 'rename',
        id: '00000000-0000-4000-8000-000000000002',
        name: '  Renamed work  ',
        expectedUpdatedAt: UPDATED_AT,
      },
      ADMIN,
    );
    expect(result.entries[1].name).toBe('  Renamed work  ');
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE psf_requests SET status = $2 WHERE status = $1',
      ['5% -- Reject (Information not complete)', '  Renamed work  '],
    );
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE psf_request_search_index SET status = $2 WHERE status = $1',
      ['5% -- Reject (Information not complete)', '  Renamed work  '],
    );
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('removes a deleted trigger without requiring or assigning a replacement trigger', async () => {
    await service.onModuleInit();
    const config = stored as {
      entries: Array<{ id: string; name: string; kind: string }>;
      psfVisibilityTriggerId: string | null;
    };
    stored = { ...config, psfVisibilityTriggerId: config.entries[1]?.id };
    await expect(
      service.applyOperation(
        {
          action: 'delete',
          id: config.entries[1]?.id,
          expectedUpdatedAt: UPDATED_AT,
        },
        ADMIN,
      ),
    ).resolves.toMatchObject({
      psfVisibilityTriggerIds: [],
      psfVisibilityTriggerId: null,
    });
    expect(
      client.query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE psf_requests'),
      ),
    ).toBe(false);
  });

  it('rejects a bulk replacement into the PSF trigger before request, projection, or audit writes', async () => {
    await service.onModuleInit();
    const config = stored as {
      entries: Array<{
        id: string;
        name: string;
        kind: 'draft' | 'open' | 'completed' | 'cancelled';
      }>;
      psfVisibilityTriggerId: string | null;
    };
    const source = config.entries[1];
    const trigger = config.entries[2];
    stored = { ...config, psfVisibilityTriggerId: trigger.id };
    replacementRows = [
      {
        id: 'c4e87bd1-f7de-4d6d-8097-bf914cd13acd',
        request_no: 'PSF-0001',
        status: source.name,
        psf_created_data_json: {},
        psf_created_schema_snapshot_json: REQUIRED_PSF_SCHEMA,
      },
    ];
    await expect(
      service.applyOperation(
        {
          action: 'delete',
          id: source.id,
          replacementId: trigger.id,
          expectedUpdatedAt: UPDATED_AT,
        },
        ADMIN,
      ),
    ).rejects.toThrow(/Setup/);
    expect(
      client.query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE psf_requests'),
      ),
    ).toBe(false);
    expect(
      client.query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE psf_request_search_index'),
      ),
    ).toBe(false);
    expect(audit.record).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('rolls back a catalog change when its audit insert fails', async () => {
    await service.onModuleInit();
    audit.record.mockRejectedValueOnce(new Error('audit insert failed'));
    await expect(
      service.applyOperation(
        {
          action: 'create',
          name: 'Rollback me',
          kind: 'open',
          expectedUpdatedAt: UPDATED_AT,
        },
        ADMIN,
      ),
    ).rejects.toThrow('audit insert failed');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

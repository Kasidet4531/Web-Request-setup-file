import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from '../audit/audit_log.service';
import {
  FormSchemaService,
  type FormSchemaJson,
} from '../admin/form_schema.service';
import { WorkflowTransitionService } from '../admin/workflow_transition.service';
import { DATABASE_POOL } from '../database/database.service';
import * as requestsServiceModule from './requests.service';
import { RequestsService } from './requests.service';
import { SearchIndexService } from './search-index.service';

const activeSchema = {
  formKey: 'psf-request',
  version: 3,
  title: 'PSF Request Form',
  description: null,
  status: 'active',
  publishedAt: '2026-01-01T00:00:00.000Z',
  schema: {
    formKey: 'psf-request',
    version: 3,
    title: 'PSF Request Form',
    sections: [
      {
        sectionKey: 'requester_information',
        title: 'Requester Information',
        fields: [
          {
            fieldKey: 'product_type',
            canonicalKey: 'product_type',
            label: 'Product Type',
            type: 'radio' as const,
            options: ['New Product', 'Transfer Product', 'Existing Product'],
            required: true,
          },
          {
            fieldKey: 'requester_name',
            canonicalKey: 'requester',
            label: 'Requester Name',
            type: 'text' as const,
            required: true,
          },
        ],
      },
    ],
  },
};

const storedPsfDateSchema: FormSchemaJson = {
  formKey: 'psf-created-information',
  version: 3,
  title: 'PSF Created Information v3',
  sections: [
    {
      sectionKey: 'setup',
      title: 'Setup',
      fields: [
        {
          fieldKey: 'field_3',
          canonicalKey: 'setup_date',
          label: 'Setup Date',
          type: 'date',
          required: false,
        },
        {
          fieldKey: 'field_4',
          canonicalKey: 'completion_date',
          label: 'Completion Date',
          type: 'date',
          required: false,
        },
      ],
    },
  ],
};

const revision = '2026-06-18T01:05:03.000Z';
const configuration = {
  entries: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Draft',
      kind: 'draft',
      requestCount: null,
    },
    ...[
      'Submitted',
      'Setup In Progress',
      'Need More Information',
      'PSF Created',
      'Completed',
      'Rejected',
      'Cancelled',
    ].map((name, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
      name,
      kind:
        name === 'Completed'
          ? 'completed'
          : name === 'Cancelled'
            ? 'cancelled'
            : 'open',
      requestCount: 0,
    })),
  ],
  psfVisibilityTriggerId: '00000000-0000-4000-8000-000000000005',
  updatedAt: revision,
};

const requesterActor = {
  id: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
  username: 'requester.demo',
  displayName: 'Fook',
  role: 'requester' as const,
  setupOwnerDepartment: null,
};

const requestRow = {
  id: 'request-1',
  request_no: 'DRAFT-1',
  form_key: 'psf-request',
  form_version: 3,
  status: 'Submitted',
  requester: requesterActor.displayName,
  requester_user_id: requesterActor.id,
  setup_owner: 'Original owner',
  setup_owner_role: 'MFG',
  product_type: 'Existing Product',
  requester_data_json: {
    product_type: 'Existing Product',
    requester_name: requesterActor.displayName,
  },
  psf_created_data_json: {},
  schema_snapshot_json: activeSchema.schema,
  psf_created_schema_snapshot_json:
    requestsServiceModule.PSF_CREATED_INFORMATION_SCHEMA,
  created_at: revision,
  updated_at: revision,
  updated_at_version: revision,
  submitted_at: revision,
  psf_created_at: null,
  psf_released_at: null,
  completed_at: null,
};

describe('RequestsService draft flow', () => {
  let service: RequestsService;
  let pool: { query: jest.Mock; connect: jest.Mock };
  let dbClient: { query: jest.Mock; release: jest.Mock };
  let formSchemaService: {
    getActiveSchema: jest.Mock;
    getActiveSchemaForUpdate: jest.Mock;
  };
  let workflowTransitionService: {
    getAllowedNextStatuses: jest.Mock;
    getConfiguration: jest.Mock;
    lockConfiguration: jest.Mock;
  };
  let searchIndexService: {
    ensureRequestSearchIndexStorage: jest.Mock;
    extractCanonicalValues: jest.Mock;
    queryRequests: jest.Mock;
    upsertRequestSearchIndex: jest.Mock;
    upsertSubmittedCanonicalValues: jest.Mock;
  };
  let auditLogService: { findByRequestId: jest.Mock; record: jest.Mock };

  beforeEach(async () => {
    dbClient = { query: jest.fn(), release: jest.fn() };
    pool = { query: jest.fn(), connect: jest.fn().mockResolvedValue(dbClient) };
    dbClient.query.mockImplementation((query: string, values?: unknown[]) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(query)) {
        return Promise.resolve({});
      }

      const result: unknown = pool.query(query, values);
      return result;
    });
    formSchemaService = {
      getActiveSchema: jest.fn().mockResolvedValue(activeSchema),
      getActiveSchemaForUpdate: jest.fn().mockResolvedValue(activeSchema),
    };
    workflowTransitionService = {
      getAllowedNextStatuses: jest.fn().mockResolvedValue([]),
      getConfiguration: jest.fn().mockResolvedValue(configuration),
      lockConfiguration: jest.fn().mockResolvedValue(configuration),
    };
    searchIndexService = {
      ensureRequestSearchIndexStorage: jest.fn().mockResolvedValue(undefined),
      extractCanonicalValues: jest.fn().mockReturnValue({
        product_type: 'Existing Product',
        requester: 'Fook',
      }),
      queryRequests: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      }),
      upsertRequestSearchIndex: jest.fn().mockResolvedValue(undefined),
      upsertSubmittedCanonicalValues: jest.fn().mockResolvedValue({
        product_type: 'Existing Product',
        requester: 'Fook',
      }),
    };
    auditLogService = {
      findByRequestId: jest.fn().mockResolvedValue([]),
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: DATABASE_POOL, useValue: pool },
        { provide: FormSchemaService, useValue: formSchemaService },
        {
          provide: WorkflowTransitionService,
          useValue: workflowTransitionService,
        },
        { provide: SearchIndexService, useValue: searchIndexService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(RequestsService);
  });

  it('does not mutate the prototype when an active schema contains a prototype-reserved field key', () => {
    const normalizeRequesterDataToSchema = Reflect.get(
      service,
      'normalizeRequesterDataToSchema',
    ) as
      | undefined
      | ((
          schema: FormSchemaJson,
          requesterData: Record<string, unknown>,
          initializeMissingValues?: boolean,
        ) => Record<string, unknown>);
    expect(normalizeRequesterDataToSchema).toBeDefined();
    if (!normalizeRequesterDataToSchema) {
      return;
    }

    const unsafeSchema: FormSchemaJson = {
      ...activeSchema.schema,
      sections: activeSchema.schema.sections.map((section) => ({
        ...section,
        fields: [
          ...section.fields,
          {
            fieldKey: '__proto__',
            canonicalKey: 'unsafe',
            label: 'Unsafe key',
            type: 'text',
            required: false,
          },
        ],
      })),
    };
    const requesterData = JSON.parse(
      '{"product_type":"Existing Product","requester_name":"Fook","__proto__":{"polluted":true}}',
    ) as Record<string, unknown>;

    const normalized = normalizeRequesterDataToSchema(
      unsafeSchema,
      requesterData,
    );

    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    expect(Object.hasOwn(normalized, '__proto__')).toBe(false);
    expect(normalized).toEqual({
      product_type: 'Existing Product',
      requester_name: 'Fook',
    });
  });

  it("migrates a pre-GI-49 database's requester ownership into the search index in one ordered transaction", async () => {
    const legacy = {
      requestColumns: new Set(['id', 'requester']),
      searchIndexColumns: new Set(['request_id', 'requester']),
      appUsers: [
        {
          id: requesterActor.id,
          displayName: requesterActor.displayName,
        },
      ],
      requests: [
        {
          id: 'request-1',
          requester: requesterActor.displayName,
          requester_user_id: null as string | null,
        },
      ],
      searchEntries: [
        {
          request_id: 'request-1',
          requester: requesterActor.displayName,
          requester_user_id: null as string | null,
        },
      ],
    };
    const executedStatements: string[] = [];
    const executeMigrationStatement = (query: string) => {
      executedStatements.push(query);

      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(query)) {
        return {};
      }

      if (query.includes('ALTER TABLE psf_requests')) {
        legacy.requestColumns.add('requester_user_id');
        return {};
      }

      if (query.includes('$backfill_requester_owners$')) {
        if (!legacy.requestColumns.has('requester_user_id')) {
          throw new Error('request ownership column is unavailable');
        }

        legacy.requests.forEach((request) => {
          const matchingOwners = legacy.appUsers.filter(
            (owner) =>
              owner.displayName.toLowerCase() ===
              request.requester.toLowerCase(),
          );

          if (
            request.requester_user_id === null &&
            matchingOwners.length === 1
          ) {
            request.requester_user_id = matchingOwners[0].id;
          }
        });
        return {};
      }

      if (query.includes('ALTER TABLE psf_request_search_index')) {
        legacy.searchIndexColumns.add('requester_user_id');
        return {};
      }

      if (query.includes('$backfill_search_requester_owners$')) {
        if (
          !legacy.requestColumns.has('requester_user_id') ||
          !legacy.searchIndexColumns.has('requester_user_id')
        ) {
          throw new Error('request ownership migration has not completed');
        }

        legacy.searchEntries.forEach((searchEntry) => {
          const request = legacy.requests.find(
            (candidate) => candidate.id === searchEntry.request_id,
          );
          searchEntry.requester_user_id = request?.requester_user_id ?? null;
        });
        return {};
      }

      return { rows: [] };
    };

    pool.query.mockImplementation(executeMigrationStatement);
    dbClient.query.mockImplementation(executeMigrationStatement);

    const migrationSearchIndexService = new SearchIndexService(pool as never);
    const migrationRequestsService = new RequestsService(
      pool as never,
      formSchemaService as never,
      workflowTransitionService as never,
      migrationSearchIndexService,
      auditLogService as never,
    );

    await migrationRequestsService.onModuleInit();

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(legacy.requests).toEqual([
      {
        id: 'request-1',
        requester: requesterActor.displayName,
        requester_user_id: requesterActor.id,
      },
    ]);
    expect(legacy.searchEntries).toEqual([
      {
        request_id: 'request-1',
        requester: requesterActor.displayName,
        requester_user_id: requesterActor.id,
      },
    ]);

    const requestBackfillIndex = executedStatements.findIndex((statement) =>
      statement.includes('$backfill_requester_owners$'),
    );
    const searchIndexBackfillIndex = executedStatements.findIndex((statement) =>
      statement.includes('$backfill_search_requester_owners$'),
    );

    expect(executedStatements[0]).toBe('BEGIN');
    expect(requestBackfillIndex).toBeGreaterThan(0);
    expect(searchIndexBackfillIndex).toBeGreaterThan(requestBackfillIndex);
    expect(executedStatements[executedStatements.length - 1]).toBe('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('derives draft requester identity from the authenticated actor rather than client fields', async () => {
    const insertedRow = {
      updated_at_version: new Date('2026-06-18T01:02:03.000Z').toISOString(),
      psf_released_at: null,
      id: 'request-1',
      request_no: 'DRAFT-20260618-0001',
      form_key: 'psf-request',
      form_version: 3,
      status: 'Draft',
      requester: requesterActor.displayName,
      requester_user_id: requesterActor.id,
      setup_owner: null,
      setup_owner_role: null,
      product_type: 'New Product',
      requester_data_json: {
        product_type: 'New Product',
        requester_name: requesterActor.displayName,
      },
      psf_created_data_json: {},
      psf_created_schema_snapshot_json:
        requestsServiceModule.PSF_CREATED_INFORMATION_SCHEMA,
      schema_snapshot_json: activeSchema.schema,
      created_at: new Date('2026-06-18T01:02:03.000Z'),
      updated_at: new Date('2026-06-18T01:02:03.000Z'),
      submitted_at: null,
      psf_created_at: null,
      completed_at: null,
    };
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ next: 'DRAFT-20260618-0001' }],
      })
      .mockResolvedValueOnce({ rows: [insertedRow] })
      .mockResolvedValueOnce({});
    formSchemaService.getActiveSchemaForUpdate.mockResolvedValueOnce({
      formKey: 'psf-created-information',
      version: 1,
      title: 'PSF Created Information',
      description: null,
      status: 'active',
      publishedAt: null,
      schema: requestsServiceModule.PSF_CREATED_INFORMATION_SCHEMA,
    });

    const draft = await service.createDraft(
      {
        requester: 'Another requester',
        requesterData: {
          product_type: 'New Product',
          requester_name: 'Another requester',
        },
      },
      requesterActor,
    );

    expect(formSchemaService.getActiveSchema).toHaveBeenCalledWith(
      'psf-request',
    );
    expect(formSchemaService.getActiveSchemaForUpdate).toHaveBeenCalledWith(
      'psf-created-information',
      dbClient,
    );
    expect(dbClient.query).toHaveBeenCalledWith(
      expect.stringContaining('psf_created_schema_snapshot_json'),
      [
        expect.any(String),
        'DRAFT-20260618-0001',
        'psf-request',
        3,
        'Draft',
        requesterActor.displayName,
        requesterActor.id,
        'New Product',
        {
          product_type: 'New Product',
          requester_name: requesterActor.displayName,
        },
        activeSchema.schema,
        requestsServiceModule.PSF_CREATED_INFORMATION_SCHEMA,
      ],
    );
    expect(draft).toMatchObject({
      id: 'request-1',
      requestNo: 'DRAFT-20260618-0001',
      status: 'Draft',
      requesterData: {
        product_type: 'New Product',
        requester_name: requesterActor.displayName,
      },
      schemaSnapshot: activeSchema.schema,
    });
  });

  it("rejects a requester reading a different requester's request before mapping response data", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: new Date(
            '2026-06-18T01:02:03.000Z',
          ).toISOString(),
          psf_released_at: null,
          id: 'request-2',
          request_no: 'DRAFT-2',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Draft',
          requester: 'Other Requester',
          requester_user_id: 'other-requester-id',
          setup_owner: null,
          setup_owner_role: null,
          product_type: 'New Product',
          requester_data_json: { requester_name: 'Other Requester' },
          psf_created_data_json: {},
          schema_snapshot_json: activeSchema.schema,
          created_at: new Date('2026-06-18T01:02:03.000Z'),
          updated_at: new Date('2026-06-18T01:02:03.000Z'),
          submitted_at: null,
          psf_created_at: null,
          completed_at: null,
        },
      ],
    });

    await expect(
      service.getRequest('request-2', requesterActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a requester loading another requester's history before the audit query", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: new Date(
            '2026-06-18T01:02:03.000Z',
          ).toISOString(),
          psf_released_at: null,
          id: 'request-2',
          request_no: 'DRAFT-2',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Draft',
          requester: 'Other Requester',
          requester_user_id: 'other-requester-id',
          setup_owner: null,
          setup_owner_role: null,
          product_type: 'New Product',
          requester_data_json: { requester_name: 'Other Requester' },
          psf_created_data_json: {},
          schema_snapshot_json: activeSchema.schema,
          created_at: new Date('2026-06-18T01:02:03.000Z'),
          updated_at: new Date('2026-06-18T01:02:03.000Z'),
          submitted_at: null,
          psf_created_at: null,
          completed_at: null,
        },
      ],
    });

    await expect(
      service.getRequestHistory('request-2', requesterActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditLogService.findByRequestId).not.toHaveBeenCalled();
  });

  it("rejects a requester updating another requester's draft before the write query", async () => {
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: revision,
            psf_released_at: null,
            id: 'request-2',
            status: 'Draft',
            requester: 'Other Requester',
            requester_user_id: 'other-requester-id',
          },
        ],
      })
      .mockResolvedValueOnce({});

    await expect(
      service.updateDraftRequesterData(
        'request-2',
        {
          expectedUpdatedAt: revision,
          formVersion: 3,
          requesterData: { product_type: 'New Product' },
        },
        requesterActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dbClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      expect.any(Array),
    );
  });

  it('rejects a setup owner from editing requester-owned draft data', async () => {
    const setupOwnerActor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: revision,
            psf_released_at: null,
            id: 'request-1',
            status: 'Draft',
            requester: requesterActor.displayName,
            requester_user_id: requesterActor.id,
          },
        ],
      })
      .mockResolvedValueOnce({});

    await expect(
      service.updateDraftRequesterData(
        'request-1',
        {
          expectedUpdatedAt: revision,
          formVersion: 3,
          requesterData: { product_type: 'New Product' },
        },
        setupOwnerActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dbClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      expect.any(Array),
    );
  });

  it('keeps ordinary requester filters separate from server-resolved shared authorization', async () => {
    const queryRequestsForActor = service.queryRequests.bind(
      service,
    ) as unknown as (
      query: {
        requester?: string;
        status?: string;
        limit?: number;
        offset?: number;
      },
      actor: typeof requesterActor,
    ) => Promise<unknown>;

    await queryRequestsForActor(
      {
        requester: 'Former Requester Display Name',
        status: 'Submitted',
        limit: 25,
        offset: 0,
      },
      requesterActor,
    );

    expect(searchIndexService.queryRequests).toHaveBeenCalledWith(
      {
        requester: 'Former Requester Display Name',
        status: 'Submitted',
        limit: 25,
        offset: 0,
      },
      {
        scope: 'all',
        relation: 'all',
        workState: 'all',
        actorId: requesterActor.id,
        actorRole: 'requester',
        department: null,
        openStatuses: [
          'Submitted',
          'Setup In Progress',
          'Need More Information',
          'PSF Created',
          'Rejected',
        ],
        completedStatuses: ['Completed'],
      },
    );
  });

  it('queries submitted requests through the search index with normalized pagination values', async () => {
    searchIndexService.queryRequests.mockResolvedValueOnce({
      items: [{ requestId: 'request-1', requestNo: 'DRAFT-1' }],
      total: 1,
      limit: 25,
      offset: 50,
    });

    await expect(
      service.queryRequests(
        {
          keyword: 'probe',
          status: 'Submitted',
          limit: '25' as never,
          offset: '50' as never,
        },
        {
          id: 'admin-1',
          username: 'admin.demo',
          displayName: 'Admin Demo',
          role: 'admin',
          setupOwnerDepartment: null,
        },
      ),
    ).resolves.toEqual({
      items: [{ requestId: 'request-1', requestNo: 'DRAFT-1' }],
      total: 1,
      limit: 25,
      offset: 50,
    });

    expect(searchIndexService.queryRequests).toHaveBeenCalledWith(
      {
        keyword: 'probe',
        status: 'Submitted',
        limit: 25,
        offset: 50,
      },
      {
        scope: 'all',
        relation: 'all',
        workState: 'all',
        actorId: 'admin-1',
        actorRole: 'admin',
        department: null,
        openStatuses: [
          'Submitted',
          'Setup In Progress',
          'Need More Information',
          'PSF Created',
          'Rejected',
        ],
        completedStatuses: ['Completed'],
      },
    );
  });

  it.each([
    {
      actor: {
        id: 'requester-1',
        username: 'requester.demo',
        displayName: 'Requester Demo',
        role: 'requester' as const,
        setupOwnerDepartment: null,
      },
      allowedNextStatuses: ['Cancelled'],
      currentStatus: 'Submitted',
      description:
        'returns all other catalog work options to a requester from Submitted',
    },
    {
      actor: {
        id: 'requester-1',
        username: 'requester.demo',
        displayName: 'Requester Demo',
        role: 'requester' as const,
        setupOwnerDepartment: null,
      },
      allowedNextStatuses: ['Submitted', 'Cancelled'],
      currentStatus: 'Need More Information',
      description:
        'returns all other catalog work options to a requester from Need More Information',
    },
    {
      actor: {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner' as const,
        setupOwnerDepartment: 'GNTC' as const,
      },
      allowedNextStatuses: [
        'Setup In Progress',
        'Need More Information',
        'Rejected',
      ],
      currentStatus: 'Submitted',
      description: 'returns setup-owner options from Submitted',
    },
    {
      actor: {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner' as const,
        setupOwnerDepartment: 'GNTC' as const,
      },
      allowedNextStatuses: ['PSF Created', 'Need More Information', 'Rejected'],
      currentStatus: 'Setup In Progress',
      description: 'returns setup-owner options from Setup In Progress',
    },
    {
      actor: {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner' as const,
        setupOwnerDepartment: 'GNTC' as const,
      },
      allowedNextStatuses: ['Completed', 'Need More Information'],
      currentStatus: 'PSF Created',
      description: 'returns setup-owner options from PSF Created',
    },
  ])('$description', async ({ actor, currentStatus }) => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: revision,
          psf_released_at: null,
          id: 'request-1',
          status: currentStatus,
          requester_user_id: actor.role === 'requester' ? actor.id : null,
        },
      ],
    });
    const catalog = new WorkflowTransitionService(
      pool as never,
      auditLogService as never,
    );
    pool.query.mockResolvedValue({
      rows: [{ config_json: configuration, updated_at_version: revision }],
    });
    const actualService = new RequestsService(
      pool as never,
      formSchemaService as never,
      catalog,
      searchIndexService as never,
      auditLogService as never,
    );
    const expected = configuration.entries
      .filter((entry) => entry.kind !== 'draft' && entry.name !== currentStatus)
      .map((entry) => entry.name);

    await expect(
      actualService.getAllowedStatusTransitions('request-1', actor),
    ).resolves.toEqual({ allowedNextStatuses: expected });
    expect(expected).not.toContain('Draft');
    expect(expected).not.toContain(currentStatus);
  });

  it('records the acting setup owner in status audit without assigning the request to the editor', async () => {
    const actor = {
      ...requesterActor,
      id: 'setup-owner-gntc',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const current = {
      ...requestRow,
      setup_owner: null,
      setup_owner_role: null,
    };
    const updated = { ...current, status: 'Setup In Progress' };
    pool.query
      .mockResolvedValueOnce({ rows: [current] })
      .mockResolvedValueOnce({ rows: [updated] });
    await expect(
      service.updateRequestStatus('request-1', {
        status: updated.status,
        actor,
        expectedUpdatedAt: revision,
      }),
    ).resolves.toMatchObject({
      status: updated.status,
    });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.not.stringMatching(/SET[\s\S]*setup_owner\s*=/),
      ['request-1', updated.status, false, false, current.status, revision],
    );
    expect(searchIndexService.upsertRequestSearchIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterUserId: requesterActor.id,
      }),
      { product_type: 'Existing Product', requester: 'Fook' },
      dbClient,
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        metadata: { fromStatus: current.status, toStatus: updated.status },
      }),
      dbClient,
    );
  });

  it('allows cross-department shared work transitions without reassigning the existing owner', async () => {
    const actor = {
      ...requesterActor,
      id: 'setup-owner-gntc',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const updated = { ...requestRow, status: 'Setup In Progress' };
    pool.query
      .mockResolvedValueOnce({ rows: [requestRow] })
      .mockResolvedValueOnce({ rows: [updated] });
    await expect(
      service.updateRequestStatus('request-1', {
        actor,
        status: updated.status,
        expectedUpdatedAt: revision,
      }),
    ).resolves.toMatchObject({
      requesterUserId: requesterActor.id,
    });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.not.stringMatching(/SET[\s\S]*setup_owner\s*=/),
      ['request-1', updated.status, false, false, requestRow.status, revision],
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ actor, actionType: 'REQUEST_STATUS_CHANGED' }),
      dbClient,
    );
  });

  it('rejects a lost status CAS without audit, projections or release', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [requestRow] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      service.updateRequestStatus('request-1', {
        status: 'Setup In Progress',
        actor: requesterActor,
        expectedUpdatedAt: revision,
      }),
    ).rejects.toThrow(ConflictException);
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringMatching(/WHERE id = \$1\s+AND status = \$5/),
      [
        'request-1',
        'Setup In Progress',
        false,
        false,
        requestRow.status,
        revision,
      ],
    );
    expect(searchIndexService.upsertRequestSearchIndex).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('allows a requester to skip forward on foreign shared work without changing identity or assignment', async () => {
    const current = { ...requestRow, requester_user_id: 'foreign-creator' };
    pool.query
      .mockResolvedValueOnce({ rows: [current] })
      .mockResolvedValueOnce({ rows: [{ ...current, status: 'Completed' }] });
    await expect(
      service.updateRequestStatus('request-1', {
        actor: requesterActor,
        status: 'Completed',
        expectedUpdatedAt: revision,
      }),
    ).resolves.toMatchObject({
      requesterUserId: 'foreign-creator',
      psfCreatedDataVisible: false,
    });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('completed_at = CASE'),
      ['request-1', 'Completed', true, false, current.status, revision],
    );
  });

  it('rejects admin manual status changes out of Draft so submit validation cannot be bypassed', async () => {
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: revision,
            psf_released_at: null,
            id: 'request-1',
            status: 'Draft',
          },
        ],
      })
      .mockResolvedValueOnce({});

    await expect(
      service.updateRequestStatus('request-1', {
        expectedUpdatedAt: revision,
        status: 'Submitted',
        actor: {
          id: 'admin-1',
          username: 'admin.demo',
          displayName: 'Admin Demo',
          role: 'admin',
          setupOwnerDepartment: null,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dbClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      expect.any(Array),
    );
  });

  it('loads an existing draft request with requester data and schema snapshot', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: new Date(
            '2026-06-18T01:03:03.000Z',
          ).toISOString(),
          psf_released_at: null,
          id: 'request-1',
          request_no: 'DRAFT-1',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Draft',
          requester: 'Fook',
          setup_owner: null,
          setup_owner_role: null,
          product_type: 'Transfer Product',
          requester_user_id: requesterActor.id,
          requester_data_json: { product_type: 'Transfer Product' },
          psf_created_data_json: {},
          schema_snapshot_json: activeSchema.schema,
          created_at: new Date('2026-06-18T01:02:03.000Z'),
          updated_at: new Date('2026-06-18T01:03:03.000Z'),
          submitted_at: null,
          psf_created_at: null,
          completed_at: null,
        },
      ],
    });

    await expect(
      service.getRequest('request-1', requesterActor),
    ).resolves.toMatchObject({
      id: 'request-1',
      status: 'Draft',
      requesterData: { product_type: 'Transfer Product' },
      schemaSnapshot: activeSchema.schema,
      psfCreatedInformationSchema:
        requestsServiceModule.PSF_CREATED_INFORMATION_SCHEMA,
    });
  });

  it('resolves actual shared detail permissions before fetching masked PSF history', async () => {
    pool.query.mockResolvedValueOnce({ rows: [requestRow] });
    await expect(
      service.getRequestHistory('request-1', requesterActor),
    ).resolves.toEqual([]);
    expect(auditLogService.findByRequestId).toHaveBeenCalledWith(
      'request-1',
      false,
    );
  });

  it('masks raw PSF Created Information for a requester before PSF Created', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: new Date(
            '2026-06-18T01:06:03.000Z',
          ).toISOString(),
          psf_released_at: null,
          id: 'request-1',
          request_no: 'PSF-0001',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Setup In Progress',
          requester: 'Fook',
          requester_user_id: 'requester-1',
          setup_owner: 'Setup Owner GNTC Demo',
          setup_owner_role: 'GNTC',
          product_type: 'Existing Product',
          requester_data_json: { product_type: 'Existing Product' },
          psf_created_data_json: {
            psf_setup_file_name: 'restricted-setup.psf',
            attachment_reference: 'smb://restricted/share/layout.pdf',
          },
          schema_snapshot_json: activeSchema.schema,
          created_at: new Date('2026-06-18T01:02:03.000Z'),
          updated_at: new Date('2026-06-18T01:06:03.000Z'),
          submitted_at: new Date('2026-06-18T01:05:03.000Z'),
          psf_created_at: null,
          completed_at: null,
        },
      ],
    });
    const requester = {
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    };
    type MaskedPsfCreatedDetail = {
      psfCreatedData: Record<string, unknown>;
      psfCreatedDataVisible: boolean;
      canEditPsfCreatedData: boolean;
      psfCreatedInformationSchema: {
        formKey: string;
        sections: Array<{
          sectionKey: string;
          fields: Array<{ fieldKey: string; required: boolean }>;
        }>;
      };
    };
    const getRequestForActor = service.getRequest.bind(service) as unknown as (
      requestId: string,
      actor: typeof requester,
    ) => Promise<MaskedPsfCreatedDetail>;

    const response = await getRequestForActor('request-1', requester);
    expect(response).toMatchObject({
      psfCreatedData: {},
      psfCreatedDataVisible: false,
      canEditPsfCreatedData: false,
      psfCreatedInformationSchema: {
        formKey: 'psf-created-information',
      },
    });
    const section = response.psfCreatedInformationSchema.sections.find(
      ({ sectionKey }) => sectionKey === 'psf_created_information',
    );
    expect(
      section?.fields.some(
        ({ fieldKey, required }) =>
          fieldKey === 'psf_setup_file_name' && required === false,
      ),
    ).toBe(true);
  });

  it('returns each request’s PSF schema snapshot instead of the latest active descriptor', async () => {
    const historicalSchema = {
      formKey: 'psf-created-information',
      version: 7,
      title: 'Historical PSF Created Information',
      sections: [
        {
          sectionKey: 'historical',
          title: 'Historical setup',
          fields: [
            {
              fieldKey: 'historical_tag',
              canonicalKey: 'historical_tag',
              label: 'Historical Tag',
              type: 'text' as const,
              required: true,
            },
          ],
        },
      ],
    };
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: new Date(
            '2026-06-18T01:06:03.000Z',
          ).toISOString(),
          psf_released_at: null,
          id: 'request-1',
          request_no: 'PSF-0001',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Draft',
          requester: requesterActor.displayName,
          requester_user_id: requesterActor.id,
          setup_owner: null,
          setup_owner_role: null,
          product_type: 'Existing Product',
          requester_data_json: {},
          psf_created_data_json: {},
          psf_created_schema_snapshot_json: historicalSchema,
          schema_snapshot_json: activeSchema.schema,
          created_at: new Date('2026-06-18T01:02:03.000Z'),
          updated_at: new Date('2026-06-18T01:06:03.000Z'),
          submitted_at: null,
          psf_created_at: null,
          completed_at: null,
        },
      ],
    });

    await expect(
      service.getRequest('request-1', requesterActor),
    ).resolves.toMatchObject({
      psfCreatedInformationSchema: historicalSchema,
      psfCreatedData: {},
      psfCreatedDataVisible: false,
    });
  });

  it.each([
    { layout: 42 },
    { mirror_die_available: 'Maybe' },
    { unexpected_field: 'malicious' },
  ])(
    'rejects invalid PSF Created values instead of silently dropping them: %p',
    async (payload) => {
      const actor = {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner' as const,
        setupOwnerDepartment: 'GNTC' as const,
      };
      const currentUpdatedAt = new Date('2026-06-18T01:05:03.000Z');
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: currentUpdatedAt.toISOString(),
            psf_released_at: null,
            id: 'request-1',
            status: 'Setup In Progress',
            updated_at: currentUpdatedAt,
            psf_created_schema_snapshot_json:
              requestsServiceModule.PSF_CREATED_INFORMATION_SCHEMA,
          },
        ],
      });
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'request-1' }] });
      const updatePsfCreatedData = Reflect.get(
        service,
        'updatePsfCreatedData',
      ) as (
        requestId: string,
        dto: {
          actor: typeof actor;
          expectedUpdatedAt: string;
          psfCreatedData: Record<string, unknown>;
        },
      ) => Promise<unknown>;

      await expect(
        updatePsfCreatedData.call(service, 'request-1', {
          actor,
          expectedUpdatedAt: currentUpdatedAt.toISOString(),
          psfCreatedData: payload,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pool.query).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['not-a-date', '2026-06-18T00:00:00.000Z', '2025-02-29'])(
    'rejects invalid date values when saving PSF Created Information: %s',
    async (value) => {
      const actor = {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner' as const,
        setupOwnerDepartment: 'GNTC' as const,
      };
      const updatedAt = new Date('2026-06-18T01:05:03.000Z');
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: updatedAt.toISOString(),
            psf_released_at: null,
            id: 'request-1',
            status: 'Setup In Progress',
            updated_at: updatedAt,
            psf_created_schema_snapshot_json: storedPsfDateSchema,
          },
        ],
      });
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: updatedAt.toISOString(),
            psf_released_at: null,
            id: 'request-1',
            request_no: 'PSF-0001',
            form_key: 'psf-request',
            form_version: 3,
            status: 'Setup In Progress',
            requester: 'Fook',
            setup_owner: actor.displayName,
            setup_owner_role: 'GNTC',
            product_type: 'Existing Product',
            requester_data_json: {},
            psf_created_data_json: { field_3: value },
            psf_created_schema_snapshot_json: storedPsfDateSchema,
            schema_snapshot_json: activeSchema.schema,
            created_at: new Date('2026-06-18T01:02:03.000Z'),
            updated_at: updatedAt,
            submitted_at: null,
            psf_created_at: null,
            completed_at: null,
          },
        ],
      });

      await expect(
        service.updatePsfCreatedData('request-1', {
          actor,
          expectedUpdatedAt: updatedAt.toISOString(),
          psfCreatedData: { field_3: value },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE psf_requests'),
        expect.anything(),
      );
      expect(auditLogService.record).not.toHaveBeenCalled();
    },
  );

  it('accepts ordinary and leap calendar dates from the request snapshot when saving PSF Created Information', async () => {
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const updatedAt = new Date('2026-06-18T01:05:03.000Z');
    const savedData = { field_3: '2026-06-18', field_4: '2024-02-29' };
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: updatedAt.toISOString(),
            psf_released_at: null,
            id: 'request-1',
            status: 'Setup In Progress',
            updated_at: updatedAt,
            psf_created_schema_snapshot_json: storedPsfDateSchema,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: updatedAt.toISOString(),
            psf_released_at: null,
            id: 'request-1',
            request_no: 'PSF-0001',
            form_key: 'psf-request',
            form_version: 3,
            status: 'Setup In Progress',
            requester: 'Fook',
            setup_owner: actor.displayName,
            setup_owner_role: 'GNTC',
            product_type: 'Existing Product',
            requester_data_json: {},
            psf_created_data_json: savedData,
            psf_created_schema_snapshot_json: storedPsfDateSchema,
            schema_snapshot_json: activeSchema.schema,
            created_at: new Date('2026-06-18T01:02:03.000Z'),
            updated_at: updatedAt,
            submitted_at: null,
            psf_created_at: null,
            completed_at: null,
          },
        ],
      });

    await expect(
      service.updatePsfCreatedData('request-1', {
        actor,
        expectedUpdatedAt: updatedAt.toISOString(),
        psfCreatedData: {
          field_3: ' 2026-06-18 ',
          field_4: ' 2024-02-29 ',
        },
      }),
    ).resolves.toMatchObject({ psfCreatedData: savedData });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      ['request-1', savedData, true, updatedAt.toISOString()],
    );
  });

  it('requires required PSF values from the request snapshot before moving to PSF Created', async () => {
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const requiredSchema = {
      formKey: 'psf-created-information',
      version: 4,
      title: 'PSF Created Information v4',
      sections: [
        {
          sectionKey: 'setup',
          title: 'Setup',
          fields: [
            {
              fieldKey: 'psf_setup_file_name',
              canonicalKey: 'psf_setup_file_name',
              label: 'PSF Setup File Name',
              type: 'text' as const,
              required: true,
            },
          ],
        },
      ],
    };
    workflowTransitionService.getAllowedNextStatuses.mockResolvedValueOnce([
      'PSF Created',
    ]);
    dbClient.query.mockResolvedValueOnce({}).mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: revision,
          psf_released_at: null,
          id: 'request-1',
          status: 'Setup In Progress',
          requester_user_id: null,
          psf_created_data_json: {},
          psf_created_schema_snapshot_json: requiredSchema,
        },
      ],
    });

    await expect(
      service.updateRequestStatus('request-1', {
        expectedUpdatedAt: revision,
        status: 'PSF Created',
        actor,
      }),
    ).rejects.toThrow(
      'PSF Created Information is missing required fields: PSF Setup File Name.',
    );
    expect(dbClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      expect.anything(),
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it.each(['2025-02-29', '2026-06-18T00:00:00.000Z'])(
    'rejects invalid stored required PSF dates before moving to PSF Created: %s',
    async (value) => {
      const actor = {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner' as const,
        setupOwnerDepartment: 'GNTC' as const,
      };
      const requiredSchema: FormSchemaJson = {
        ...storedPsfDateSchema,
        sections: [
          {
            ...storedPsfDateSchema.sections[0],
            fields: [
              { ...storedPsfDateSchema.sections[0].fields[0], required: true },
            ],
          },
        ],
      };
      workflowTransitionService.getAllowedNextStatuses.mockResolvedValueOnce([
        'PSF Created',
      ]);
      dbClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [
            {
              updated_at_version: revision,
              psf_released_at: null,
              id: 'request-1',
              status: 'Setup In Progress',
              requester_user_id: null,
              psf_created_data_json: { field_3: value },
              psf_created_schema_snapshot_json: requiredSchema,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              updated_at_version: new Date(
                '2026-06-18T01:06:03.000Z',
              ).toISOString(),
              psf_released_at: null,
              id: 'request-1',
              request_no: 'PSF-0001',
              form_key: 'psf-request',
              form_version: 3,
              status: 'PSF Created',
              requester: 'Fook',
              requester_user_id: null,
              setup_owner: actor.displayName,
              setup_owner_role: 'GNTC',
              product_type: 'Existing Product',
              requester_data_json: {},
              psf_created_data_json: { field_3: value },
              psf_created_schema_snapshot_json: requiredSchema,
              schema_snapshot_json: activeSchema.schema,
              created_at: new Date('2026-06-18T01:02:03.000Z'),
              updated_at: new Date('2026-06-18T01:06:03.000Z'),
              submitted_at: null,
              psf_created_at: new Date('2026-06-18T01:06:03.000Z'),
              completed_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({});

      await expect(
        service.updateRequestStatus('request-1', {
          expectedUpdatedAt: revision,
          status: 'PSF Created',
          actor,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dbClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE psf_requests'),
        expect.anything(),
      );
      expect(auditLogService.record).not.toHaveBeenCalled();
      expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    },
  );

  it('accepts valid own ordinary and leap dates when moving to PSF Created', async () => {
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const requiredSchema: FormSchemaJson = {
      ...storedPsfDateSchema,
      sections: [
        {
          ...storedPsfDateSchema.sections[0],
          fields: storedPsfDateSchema.sections[0].fields.map((field) => ({
            ...field,
            required: true,
          })),
        },
      ],
    };
    const savedData = { field_3: '2026-06-18', field_4: '2024-02-29' };
    const updatedRow = {
      updated_at_version: new Date('2026-06-18T01:06:03.000Z').toISOString(),
      psf_released_at: null,
      id: 'request-1',
      request_no: 'PSF-0001',
      form_key: 'psf-request',
      form_version: 3,
      status: 'PSF Created',
      requester: 'Fook',
      requester_user_id: null,
      setup_owner: actor.displayName,
      setup_owner_role: 'GNTC',
      product_type: 'Existing Product',
      requester_data_json: {},
      psf_created_data_json: savedData,
      psf_created_schema_snapshot_json: requiredSchema,
      schema_snapshot_json: activeSchema.schema,
      created_at: new Date('2026-06-18T01:02:03.000Z'),
      updated_at: new Date('2026-06-18T01:06:03.000Z'),
      submitted_at: null,
      psf_created_at: new Date('2026-06-18T01:06:03.000Z'),
      completed_at: null,
    };
    workflowTransitionService.getAllowedNextStatuses.mockResolvedValueOnce([
      'PSF Created',
    ]);
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: revision,
            psf_released_at: null,
            id: 'request-1',
            status: 'Setup In Progress',
            requester_user_id: null,
            psf_created_data_json: savedData,
            psf_created_schema_snapshot_json: requiredSchema,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [updatedRow] })
      .mockResolvedValueOnce({});

    await expect(
      service.updateRequestStatus('request-1', {
        expectedUpdatedAt: revision,
        status: 'PSF Created',
        actor,
      }),
    ).resolves.toMatchObject({
      status: 'PSF Created',
      psfCreatedData: savedData,
    });
    expect(auditLogService.record).toHaveBeenCalledTimes(1);
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
    'does not let inherited %s satisfy a required PSF Created field',
    async (fieldKey) => {
      const actor = {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner' as const,
        setupOwnerDepartment: 'GNTC' as const,
      };
      const requiredSchema = {
        formKey: 'psf-created-information',
        version: 4,
        title: 'PSF Created Information v4',
        sections: [
          {
            sectionKey: 'setup',
            title: 'Setup',
            fields: [
              {
                fieldKey,
                canonicalKey: 'required_value',
                label: 'Required Value',
                type: 'text' as const,
                required: true,
              },
            ],
          },
        ],
      };
      workflowTransitionService.getAllowedNextStatuses.mockResolvedValueOnce([
        'PSF Created',
      ]);
      pool.query.mockResolvedValue({ rows: [requestRow] });
      dbClient.query.mockResolvedValueOnce({}).mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: revision,
            psf_released_at: null,
            id: 'request-1',
            status: 'Setup In Progress',
            requester_user_id: null,
            psf_created_data_json: {},
            psf_created_schema_snapshot_json: requiredSchema,
          },
        ],
      });

      await expect(
        service.updateRequestStatus('request-1', {
          expectedUpdatedAt: revision,
          status: 'PSF Created',
          actor,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dbClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE psf_requests'),
        expect.anything(),
      );
      expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    },
  );

  it.each([
    { description: 'a number', value: 12, type: 'text' },
    { description: 'a boolean', value: true, type: 'text' },
    { description: 'a blank string', value: '  ', type: 'text' },
    { description: 'an unconfigured choice', value: 'Maybe', type: 'select' },
  ])(
    'rejects required PSF Created fields containing $description',
    async ({ value, type }) => {
      const actor = {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner' as const,
        setupOwnerDepartment: 'GNTC' as const,
      };
      const requiredSchema = {
        formKey: 'psf-created-information',
        version: 4,
        title: 'PSF Created Information v4',
        sections: [
          {
            sectionKey: 'setup',
            title: 'Setup',
            fields: [
              {
                fieldKey: 'required_value',
                canonicalKey: 'required_value',
                label: 'Required Value',
                type,
                required: true,
                ...(type === 'select' ? { options: ['Yes', 'No'] } : {}),
              },
            ],
          },
        ],
      };
      workflowTransitionService.getAllowedNextStatuses.mockResolvedValueOnce([
        'PSF Created',
      ]);
      dbClient.query.mockResolvedValueOnce({}).mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: revision,
            psf_released_at: null,
            id: 'request-1',
            status: 'Setup In Progress',
            requester_user_id: null,
            psf_created_data_json: { required_value: value },
            psf_created_schema_snapshot_json: requiredSchema,
          },
        ],
      });

      await expect(
        service.updateRequestStatus('request-1', {
          expectedUpdatedAt: revision,
          status: 'PSF Created',
          actor,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dbClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE psf_requests'),
        expect.anything(),
      );
    },
  );

  it('accepts an owned configured PSF Created choice when moving to PSF Created', async () => {
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const requiredSchema = {
      formKey: 'psf-created-information',
      version: 4,
      title: 'PSF Created Information v4',
      sections: [
        {
          sectionKey: 'setup',
          title: 'Setup',
          fields: [
            {
              fieldKey: 'mirror_die_available',
              canonicalKey: 'mirror_die_available',
              label: 'Mirror Die Available',
              type: 'select' as const,
              required: true,
              options: ['Yes', 'No'],
            },
          ],
        },
      ],
    };
    const updatedRow = {
      updated_at_version: new Date('2026-06-18T01:06:03.000Z').toISOString(),
      psf_released_at: null,
      id: 'request-1',
      request_no: 'PSF-0001',
      form_key: 'psf-request',
      form_version: 3,
      status: 'PSF Created',
      requester: 'Fook',
      requester_user_id: null,
      setup_owner: actor.displayName,
      setup_owner_role: 'GNTC',
      product_type: 'Existing Product',
      requester_data_json: {},
      psf_created_data_json: { mirror_die_available: 'Yes' },
      psf_created_schema_snapshot_json: requiredSchema,
      schema_snapshot_json: activeSchema.schema,
      created_at: new Date('2026-06-18T01:02:03.000Z'),
      updated_at: new Date('2026-06-18T01:06:03.000Z'),
      submitted_at: null,
      psf_created_at: new Date('2026-06-18T01:06:03.000Z'),
      completed_at: null,
    };
    workflowTransitionService.getAllowedNextStatuses.mockResolvedValueOnce([
      'PSF Created',
    ]);
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: revision,
            psf_released_at: null,
            id: 'request-1',
            status: 'Setup In Progress',
            requester_user_id: null,
            psf_created_data_json: { mirror_die_available: 'Yes' },
            psf_created_schema_snapshot_json: requiredSchema,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [updatedRow] })
      .mockResolvedValueOnce({});

    await expect(
      service.updateRequestStatus('request-1', {
        expectedUpdatedAt: revision,
        status: 'PSF Created',
        actor,
      }),
    ).resolves.toMatchObject({
      status: 'PSF Created',
      psfCreatedData: { mirror_die_available: 'Yes' },
    });
  });

  it('allows PSF Created only after the stored schema required values are present', async () => {
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const storedSchema = {
      formKey: 'psf-created-information',
      version: 4,
      title: 'PSF Created Information v4',
      sections: [
        {
          sectionKey: 'setup',
          title: 'Setup',
          fields: [
            {
              fieldKey: 'file_name_v4',
              canonicalKey: 'file_name',
              label: 'PSF Setup File Name',
              type: 'text' as const,
              required: true,
            },
          ],
        },
      ],
    };
    const updatedRow = {
      updated_at_version: new Date('2026-06-18T01:06:03.000Z').toISOString(),
      psf_released_at: null,
      id: 'request-1',
      request_no: 'PSF-0001',
      form_key: 'psf-request',
      form_version: 3,
      status: 'PSF Created',
      requester: 'Fook',
      requester_user_id: requesterActor.id,
      setup_owner: actor.displayName,
      setup_owner_role: 'GNTC',
      product_type: 'Existing Product',
      requester_data_json: { product_type: 'Existing Product' },
      psf_created_data_json: { file_name_v4: 'ready.psf' },
      psf_created_schema_snapshot_json: storedSchema,
      schema_snapshot_json: activeSchema.schema,
      created_at: new Date('2026-06-18T01:02:03.000Z'),
      updated_at: new Date('2026-06-18T01:06:03.000Z'),
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      psf_created_at: new Date('2026-06-18T01:06:03.000Z'),
      completed_at: null,
    };
    workflowTransitionService.getAllowedNextStatuses.mockResolvedValueOnce([
      'PSF Created',
    ]);
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: revision,
            psf_released_at: null,
            id: 'request-1',
            status: 'Setup In Progress',
            requester_user_id: requesterActor.id,
            psf_created_data_json: { file_name_v4: 'ready.psf' },
            psf_created_schema_snapshot_json: storedSchema,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [updatedRow] })
      .mockResolvedValueOnce({});

    await expect(
      service.updateRequestStatus('request-1', {
        expectedUpdatedAt: revision,
        status: 'PSF Created',
        actor,
      }),
    ).resolves.toMatchObject({
      status: 'PSF Created',
      psfCreatedInformationSchema: storedSchema,
    });
    expect(dbClient.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      ['request-1'],
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'REQUEST_STATUS_CHANGED',
        metadata: {
          fromStatus: 'Setup In Progress',
          toStatus: 'PSF Created',
        },
      }),
      dbClient,
    );
  });

  it.each(['PSF Created', 'Completed'])(
    'returns PSF Created Information read-only to a requester at %s',
    async (status) => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'request-1',
            request_no: 'PSF-0001',
            form_key: 'psf-request',
            form_version: 3,
            psf_released_at: revision,
            status,
            requester: 'Fook',
            requester_user_id: 'requester-1',
            setup_owner: 'Setup Owner GNTC Demo',
            setup_owner_role: 'GNTC',
            product_type: 'Existing Product',
            requester_data_json: { product_type: 'Existing Product' },
            psf_created_data_json: {
              psf_setup_file_name: 'visible-setup.psf',
            },
            schema_snapshot_json: activeSchema.schema,
            created_at: new Date('2026-06-18T01:02:03.000Z'),
            updated_at: new Date('2026-06-18T01:06:03.000Z'),
            submitted_at: new Date('2026-06-18T01:05:03.000Z'),
            psf_created_at: new Date('2026-06-18T01:06:03.000Z'),
            completed_at:
              status === 'Completed'
                ? new Date('2026-06-18T01:07:03.000Z')
                : null,
          },
        ],
      });
      const requester = {
        id: 'requester-1',
        username: 'requester.demo',
        displayName: 'Requester Demo',
        role: 'requester' as const,
        setupOwnerDepartment: null,
      };
      const getRequestForActor = service.getRequest.bind(
        service,
      ) as unknown as (
        requestId: string,
        actor: typeof requester,
      ) => Promise<unknown>;

      await expect(
        getRequestForActor('request-1', requester),
      ).resolves.toMatchObject({
        status,
        psfCreatedData: { psf_setup_file_name: 'visible-setup.psf' },
        psfCreatedDataVisible: true,
        canEditPsfCreatedData: false,
      });
    },
  );

  it('rejects incomplete shared PSF saves using the captured required snapshot', async () => {
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const updatedAt = new Date('2026-06-18T01:05:03.000Z');
    const storedSchema = {
      formKey: 'psf-created-information',
      version: 4,
      title: 'PSF Created Information v4',
      sections: [
        {
          sectionKey: 'setup',
          title: 'Setup',
          fields: [
            {
              fieldKey: 'required_file_name',
              canonicalKey: 'file_name',
              label: 'Required File Name',
              type: 'text' as const,
              required: true,
            },
            {
              fieldKey: 'required_setup_date',
              canonicalKey: 'required_setup_date',
              label: 'Required Setup Date',
              type: 'date' as const,
              required: true,
            },
            {
              fieldKey: 'optional_setup_date',
              canonicalKey: 'optional_setup_date',
              label: 'Optional Setup Date',
              type: 'date' as const,
              required: false,
            },
          ],
        },
      ],
    };
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: updatedAt.toISOString(),
            psf_released_at: null,
            id: 'request-1',
            status: 'Setup In Progress',
            updated_at: updatedAt,
            psf_created_schema_snapshot_json: storedSchema,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: updatedAt.toISOString(),
            psf_released_at: null,
            id: 'request-1',
            request_no: 'PSF-0001',
            form_key: 'psf-request',
            form_version: 3,
            status: 'Setup In Progress',
            requester: 'Fook',
            setup_owner: actor.displayName,
            setup_owner_role: 'GNTC',
            product_type: 'Existing Product',
            requester_data_json: {},
            psf_created_data_json: {},
            psf_created_schema_snapshot_json: storedSchema,
            schema_snapshot_json: activeSchema.schema,
            created_at: new Date('2026-06-18T01:02:03.000Z'),
            updated_at: updatedAt,
            submitted_at: null,
            psf_created_at: null,
            completed_at: null,
          },
        ],
      });
    const updatePsfCreatedData = Reflect.get(
      service,
      'updatePsfCreatedData',
    ) as (
      requestId: string,
      dto: {
        actor: typeof actor;
        expectedUpdatedAt: string;
        psfCreatedData: Record<string, unknown>;
      },
    ) => Promise<unknown>;

    await expect(
      updatePsfCreatedData.call(service, 'request-1', {
        actor,
        expectedUpdatedAt: updatedAt.toISOString(),
        psfCreatedData: { optional_setup_date: '   ' },
      }),
    ).rejects.toThrow('Required File Name, Required Setup Date');
    expect(pool.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      expect.anything(),
    );
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(searchIndexService.upsertRequestSearchIndex).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('allows a setup owner to save normalized PSF Created Information without changing status and records the acting owner', async () => {
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const currentUpdatedAt = new Date('2026-06-18T01:05:03.000Z');
    const updatedRow = {
      updated_at_version: new Date('2026-06-18T01:06:03.000Z').toISOString(),
      psf_released_at: null,
      id: 'request-1',
      request_no: 'PSF-0001',
      form_key: 'psf-request',
      form_version: 3,
      status: 'Setup In Progress',
      requester: 'Fook',
      setup_owner: 'Setup Owner GNTC Demo',
      setup_owner_role: 'GNTC',
      product_type: 'Existing Product',
      requester_data_json: { product_type: 'Existing Product' },
      psf_created_data_json: {
        psf_setup_file_name: 'final-setup.psf',
        attachment_reference: 'https://files.example/final-layout.pdf',
      },
      schema_snapshot_json: activeSchema.schema,
      created_at: new Date('2026-06-18T01:02:03.000Z'),
      updated_at: new Date('2026-06-18T01:06:03.000Z'),
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      psf_created_at: null,
      completed_at: null,
    };
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: currentUpdatedAt.toISOString(),
          psf_released_at: null,
          id: 'request-1',
          status: 'Setup In Progress',
          updated_at: currentUpdatedAt,
        },
      ],
    });
    pool.query.mockResolvedValueOnce({ rows: [updatedRow] });

    const invokeUpdate = async () => {
      const updatePsfCreatedData = Reflect.get(
        service,
        'updatePsfCreatedData',
      ) as (
        requestId: string,
        dto: {
          actor: typeof actor;
          expectedUpdatedAt: string;
          psfCreatedData: Record<string, unknown>;
        },
      ) => Promise<unknown>;

      return updatePsfCreatedData.call(service, 'request-1', {
        actor,
        expectedUpdatedAt: currentUpdatedAt.toISOString(),
        psfCreatedData: {
          psf_setup_file_name: ' final-setup.psf ',
          attachment_reference: ' https://files.example/final-layout.pdf ',
        },
      });
    };

    await expect(invokeUpdate()).resolves.toMatchObject({
      status: 'Setup In Progress',
      psfCreatedData: {
        psf_setup_file_name: 'final-setup.psf',
        attachment_reference: 'https://files.example/final-layout.pdf',
      },
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
    });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      [
        'request-1',
        {
          psf_setup_file_name: 'final-setup.psf',
          attachment_reference: 'https://files.example/final-layout.pdf',
        },
        true,
        currentUpdatedAt.toISOString(),
      ],
    );
    const queryCalls = pool.query.mock.calls as unknown as Array<
      [string, unknown[]]
    >;
    expect(queryCalls[1]?.[0]).not.toContain('SET status');
  });

  it.each([undefined, null, [], 'not-an-object'])(
    'rejects malformed PSF Created Information payload %p with a controlled bad request before writing',
    async (psfCreatedData) => {
      const actor = {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner' as const,
        setupOwnerDepartment: 'GNTC' as const,
      };
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            updated_at_version: revision,
            psf_released_at: null,
            id: 'request-1',
            status: 'Setup In Progress',
          },
        ],
      });
      const updatePsfCreatedData = Reflect.get(
        service,
        'updatePsfCreatedData',
      ) as (
        requestId: string,
        dto: {
          actor: typeof actor;
          expectedUpdatedAt: string;
          psfCreatedData: unknown;
        },
      ) => Promise<unknown>;

      await expect(
        updatePsfCreatedData.call(service, 'request-1', {
          actor,
          expectedUpdatedAt: '2026-06-18T01:05:03.000Z',
          psfCreatedData,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pool.query).not.toHaveBeenCalled();
      expect(pool.connect).not.toHaveBeenCalled();
    },
  );

  it('requires a valid fetched updatedAt value before saving PSF Created Information', async () => {
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: revision,
          psf_released_at: null,
          id: 'request-1',
          status: 'Setup In Progress',
        },
      ],
    });
    const updatePsfCreatedData = Reflect.get(
      service,
      'updatePsfCreatedData',
    ) as (
      requestId: string,
      dto: {
        actor: typeof actor;
        expectedUpdatedAt: unknown;
        psfCreatedData: Record<string, unknown>;
      },
    ) => Promise<unknown>;

    await expect(
      updatePsfCreatedData.call(service, 'request-1', {
        actor,
        expectedUpdatedAt: undefined,
        psfCreatedData: { psf_setup_file_name: 'final-setup.psf' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('returns a conflict when another owner saves between the PSF Created Information read and write', async () => {
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const currentUpdatedAt = new Date('2026-06-18T01:05:03.000Z');
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: currentUpdatedAt.toISOString(),
          psf_released_at: null,
          id: 'request-1',
          status: 'Setup In Progress',
          updated_at: currentUpdatedAt,
        },
      ],
    });
    pool.query.mockResolvedValueOnce({ rows: [] });
    const updatePsfCreatedData = Reflect.get(
      service,
      'updatePsfCreatedData',
    ) as (
      requestId: string,
      dto: {
        actor: typeof actor;
        expectedUpdatedAt: string;
        psfCreatedData: Record<string, unknown>;
      },
    ) => Promise<unknown>;

    await expect(
      updatePsfCreatedData.call(service, 'request-1', {
        actor,
        expectedUpdatedAt: currentUpdatedAt.toISOString(),
        psfCreatedData: { psf_setup_file_name: 'stale-setup.psf' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining(
        "updated_at = ($4::timestamptz AT TIME ZONE current_setting('TIMEZONE'))",
      ),
      [
        'request-1',
        { psf_setup_file_name: 'stale-setup.psf' },
        true,
        currentUpdatedAt.toISOString(),
      ],
    );
  });

  it('rejects a client snapshot that is older than the fetched request updatedAt', async () => {
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: new Date(
            '2026-06-18T01:06:03.000Z',
          ).toISOString(),
          psf_released_at: null,
          id: 'request-1',
          status: 'Setup In Progress',
          updated_at: new Date('2026-06-18T01:06:03.000Z'),
        },
      ],
    });
    const updatePsfCreatedData = Reflect.get(
      service,
      'updatePsfCreatedData',
    ) as (
      requestId: string,
      dto: {
        actor: typeof actor;
        expectedUpdatedAt: string;
        psfCreatedData: Record<string, unknown>;
      },
    ) => Promise<unknown>;

    await expect(
      updatePsfCreatedData.call(service, 'request-1', {
        actor,
        expectedUpdatedAt: '2026-06-18T01:05:03.000Z',
        psfCreatedData: { psf_setup_file_name: 'stale-setup.psf' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a requester attempting to save PSF Created Information', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: revision,
          psf_released_at: null,
          id: 'request-1',
          status: 'Setup In Progress',
        },
      ],
    });
    const actor = {
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    };
    const invokeUpdate = async () => {
      const updatePsfCreatedData = Reflect.get(
        service,
        'updatePsfCreatedData',
      ) as (
        requestId: string,
        dto: { actor: typeof actor; psfCreatedData: Record<string, unknown> },
      ) => Promise<unknown>;

      return updatePsfCreatedData.call(service, 'request-1', {
        actor,
        psfCreatedData: { psf_setup_file_name: 'requester-overwrite.psf' },
      });
    };

    await expect(invokeUpdate()).rejects.toBeInstanceOf(ForbiddenException);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('allows a setup owner to edit Completed shared PSF data while preserving the existing owner', async () => {
    const actor = {
      ...requesterActor,
      id: 'setup-owner-gntc',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const current = { ...requestRow, status: 'Completed' };
    const data = { psf_setup_file_name: 'late-change.psf' };
    pool.query
      .mockResolvedValueOnce({ rows: [current] })
      .mockResolvedValueOnce({
        rows: [{ ...current, psf_created_data_json: data }],
      });
    await expect(
      service.updatePsfCreatedData('request-1', {
        actor,
        psfCreatedData: data,
        expectedUpdatedAt: revision,
      }),
    ).resolves.toMatchObject({
      status: 'Completed',
      canEditPsfCreatedData: true,
    });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('SET psf_created_data_json = $2::jsonb'),
      ['request-1', data, true, revision],
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        metadata: {
          fieldChanges: [
            expect.objectContaining({
              fieldKey: 'psf_setup_file_name',
              before: null,
              after: 'late-change.psf',
            }),
          ],
        },
      }),
      dbClient,
    );
  });

  it('allows an admin to save PSF Created Information after Completed without replacing the saved owner', async () => {
    const currentUpdatedAt = new Date('2026-06-18T01:07:03.000Z');
    const updatedRow = {
      updated_at_version: new Date('2026-06-18T01:08:03.000Z').toISOString(),
      psf_released_at: null,
      id: 'request-1',
      request_no: 'PSF-0001',
      form_key: 'psf-request',
      form_version: 3,
      status: 'Completed',
      requester: 'Fook',
      setup_owner: 'Setup Owner GNTC Demo',
      setup_owner_role: 'GNTC',
      product_type: 'Existing Product',
      requester_data_json: { product_type: 'Existing Product' },
      psf_created_data_json: { psf_setup_file_name: 'admin-corrected.psf' },
      schema_snapshot_json: activeSchema.schema,
      created_at: new Date('2026-06-18T01:02:03.000Z'),
      updated_at: new Date('2026-06-18T01:08:03.000Z'),
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      psf_created_at: new Date('2026-06-18T01:06:03.000Z'),
      completed_at: new Date('2026-06-18T01:07:03.000Z'),
    };
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: currentUpdatedAt.toISOString(),
          psf_released_at: null,
          id: 'request-1',
          status: 'Completed',
          updated_at: currentUpdatedAt,
        },
      ],
    });
    pool.query.mockResolvedValueOnce({ rows: [updatedRow] });
    const actor = {
      id: 'admin-1',
      username: 'admin.demo',
      displayName: 'Admin Demo',
      role: 'admin' as const,
      setupOwnerDepartment: null,
    };
    const invokeUpdate = async () => {
      const updatePsfCreatedData = Reflect.get(
        service,
        'updatePsfCreatedData',
      ) as (
        requestId: string,
        dto: {
          actor: typeof actor;
          expectedUpdatedAt: string;
          psfCreatedData: Record<string, unknown>;
        },
      ) => Promise<unknown>;

      return updatePsfCreatedData.call(service, 'request-1', {
        actor,
        expectedUpdatedAt: currentUpdatedAt.toISOString(),
        psfCreatedData: { psf_setup_file_name: 'admin-corrected.psf' },
      });
    };

    await expect(invokeUpdate()).resolves.toMatchObject({
      status: 'Completed',
      psfCreatedData: { psf_setup_file_name: 'admin-corrected.psf' },
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
    });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.not.stringContaining("status <> 'Completed'"),
      [
        'request-1',
        { psf_setup_file_name: 'admin-corrected.psf' },
        true,
        currentUpdatedAt.toISOString(),
      ],
    );
  });

  it('updates requester-owned draft data while the request status is Draft', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: revision,
          psf_released_at: null,
          schema_snapshot_json: activeSchema.schema,
          id: 'request-1',
          form_version: 3,
          status: 'Draft',
          requester: 'Fook',
          requester_user_id: requesterActor.id,
        },
      ],
    });
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: new Date(
            '2026-06-18T01:04:03.000Z',
          ).toISOString(),
          psf_released_at: null,
          id: 'request-1',
          request_no: 'DRAFT-1',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Draft',
          requester: 'Fook',
          setup_owner: null,
          setup_owner_role: null,
          product_type: 'Existing Product',
          requester_user_id: requesterActor.id,
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: 'Fook',
          },
          psf_created_data_json: {},
          schema_snapshot_json: activeSchema.schema,
          created_at: new Date('2026-06-18T01:02:03.000Z'),
          updated_at: new Date('2026-06-18T01:04:03.000Z'),
          submitted_at: null,
          psf_created_at: null,
          completed_at: null,
        },
      ],
    });

    const updated = await service.updateDraftRequesterData(
      'request-1',
      {
        expectedUpdatedAt: revision,
        formVersion: 3,
        requesterData: {
          product_type: 'Existing Product',
          requester_name: 'Fook',
        },
      },
      requesterActor,
    );

    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      [
        'request-1',
        'Existing Product',
        { product_type: 'Existing Product', requester_name: 'Fook' },
        3,
        revision,
      ],
    );
    expect(updated).toMatchObject({
      id: 'request-1',
      status: 'Draft',
      productType: 'Existing Product',
      requesterData: {
        product_type: 'Existing Product',
        requester_name: 'Fook',
      },
    });
  });

  it('rejects missing required requester snapshot values on shared work before projections or audit', async () => {
    pool.query.mockResolvedValueOnce({ rows: [requestRow] });
    await expect(
      service.updateDraftRequesterData(
        'request-1',
        { formVersion: 3, expectedUpdatedAt: revision, requesterData: {} },
        requesterActor,
      ),
    ).rejects.toThrow('Product Type, Requester Name');
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(
      searchIndexService.upsertSubmittedCanonicalValues,
    ).not.toHaveBeenCalled();
    expect(searchIndexService.upsertRequestSearchIndex).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('submits a current draft using its locked active schema snapshot', async () => {
    const submittedSchema = {
      ...activeSchema,
      version: 4,
      schema: {
        ...activeSchema.schema,
        version: 4,
        title: 'PSF Request Form v4',
      },
    };
    formSchemaService.getActiveSchemaForUpdate.mockResolvedValueOnce(
      submittedSchema,
    );
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: revision,
          psf_released_at: null,
          id: 'request-1',
          form_key: 'psf-request',
          status: 'Draft',
          form_version: 4,
          requester: 'Fook',
          requester_user_id: requesterActor.id,
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: 'Fook',
          },
          schema_snapshot_json: submittedSchema.schema,
        },
      ],
    });
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: new Date(
            '2026-06-18T01:05:03.000Z',
          ).toISOString(),
          psf_released_at: null,
          id: 'request-1',
          request_no: 'DRAFT-1',
          form_key: 'psf-request',
          form_version: 4,
          status: 'Submitted',
          requester: 'Fook',
          requester_user_id: requesterActor.id,
          setup_owner: null,
          setup_owner_role: null,
          product_type: 'Existing Product',
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: 'Fook',
          },
          psf_created_data_json: {},
          schema_snapshot_json: submittedSchema.schema,
          created_at: new Date('2026-06-18T01:02:03.000Z'),
          updated_at: new Date('2026-06-18T01:05:03.000Z'),
          submitted_at: new Date('2026-06-18T01:05:03.000Z'),
          psf_created_at: null,
          completed_at: null,
        },
      ],
    });

    const submitted = await service.submitRequest(
      'request-1',
      {
        expectedUpdatedAt: revision,
        status: 'Submitted',
        formVersion: 4,
      },
      requesterActor,
    );

    expect(formSchemaService.getActiveSchemaForUpdate).toHaveBeenCalledWith(
      'psf-request',
      dbClient,
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SET status = $2'),
      [
        'request-1',
        'Submitted',
        'Existing Product',
        { product_type: 'Existing Product', requester_name: 'Fook' },
        false,
        false,
        revision,
      ],
    );
    expect(
      searchIndexService.upsertSubmittedCanonicalValues,
    ).toHaveBeenCalledWith(
      'request-1',
      submittedSchema.schema,
      {
        product_type: 'Existing Product',
        requester_name: 'Fook',
      },
      dbClient,
    );
    expect(searchIndexService.upsertRequestSearchIndex).toHaveBeenCalledWith(
      {
        requestId: 'request-1',
        requestNo: 'DRAFT-1',
        status: 'Submitted',
        requester: 'Fook',
        requesterUserId: requesterActor.id,
        productType: 'Existing Product',
        requestDate: new Date('2026-06-18T01:02:03.000Z'),
        updatedAt: new Date('2026-06-18T01:05:03.000Z'),
      },
      { product_type: 'Existing Product', requester: 'Fook' },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
    expect(submitted).toMatchObject({
      id: 'request-1',
      status: 'Submitted',
      formVersion: 4,
      schemaSnapshot: submittedSchema.schema,
      submittedAt: '2026-06-18T01:05:03.000Z',
    });
  });

  it('rejects unconfigured stored requester fields on submit instead of silently upgrading or dropping data', async () => {
    const current = {
      ...requestRow,
      status: 'Draft',
      requester_data_json: {
        ...requestRow.requester_data_json,
        legacy_field: 'must not silently disappear',
      },
    };
    pool.query.mockResolvedValueOnce({ rows: [current] });
    await expect(
      service.submitRequest(
        'request-1',
        { formVersion: 3, status: 'Submitted', expectedUpdatedAt: revision },
        requesterActor,
      ),
    ).rejects.toThrow('Unknown form field: legacy_field');
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(
      searchIndexService.upsertSubmittedCanonicalValues,
    ).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('rolls back the submitted status update when canonical value persistence fails', async () => {
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: revision,
          psf_released_at: null,
          id: 'request-1',
          form_key: 'psf-request',
          status: 'Draft',
          form_version: 3,
          requester: 'Fook',
          requester_user_id: requesterActor.id,
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: 'Fook',
          },
          schema_snapshot_json: activeSchema.schema,
        },
      ],
    });
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: new Date(
            '2026-06-18T01:05:03.000Z',
          ).toISOString(),
          psf_released_at: null,
          id: 'request-1',
          request_no: 'DRAFT-1',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Submitted',
          requester: 'Fook',
          requester_user_id: requesterActor.id,
          setup_owner: null,
          setup_owner_role: null,
          product_type: 'Existing Product',
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: 'Fook',
          },
          psf_created_data_json: {},
          schema_snapshot_json: activeSchema.schema,
          created_at: new Date('2026-06-18T01:02:03.000Z'),
          updated_at: new Date('2026-06-18T01:05:03.000Z'),
          submitted_at: new Date('2026-06-18T01:05:03.000Z'),
          psf_created_at: null,
          completed_at: null,
        },
      ],
    });
    searchIndexService.upsertSubmittedCanonicalValues.mockRejectedValueOnce(
      new Error('canonical persistence failed'),
    );
    dbClient.query.mockResolvedValueOnce({});

    await expect(
      service.submitRequest(
        'request-1',
        {
          expectedUpdatedAt: revision,
          status: 'Submitted',
          formVersion: 3,
        },
        requesterActor,
      ),
    ).rejects.toThrow('canonical persistence failed');

    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SET status = $2'),
      [
        'request-1',
        'Submitted',
        'Existing Product',
        { product_type: 'Existing Product', requester_name: 'Fook' },
        false,
        false,
        revision,
      ],
    );
    expect(
      searchIndexService.upsertSubmittedCanonicalValues,
    ).toHaveBeenCalledWith(
      'request-1',
      activeSchema.schema,
      {
        product_type: 'Existing Product',
        requester_name: 'Fook',
      },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(dbClient.query).toHaveBeenCalledTimes(4);
    expect(dbClient.query).toHaveBeenNthCalledWith(4, 'ROLLBACK');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('rejects submission when the captured requester schema has required fields the draft has not satisfied', async () => {
    const schemaWithRequiredTitle = {
      ...activeSchema,
      schema: {
        ...activeSchema.schema,
        sections: activeSchema.schema.sections.map((section) => ({
          ...section,
          fields: [
            ...section.fields,
            {
              fieldKey: 'title',
              canonicalKey: 'title',
              label: 'Title',
              type: 'text' as const,
              required: true,
            },
          ],
        })),
      },
    };
    formSchemaService.getActiveSchemaForUpdate.mockResolvedValueOnce(
      schemaWithRequiredTitle,
    );
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: revision,
          psf_released_at: null,
          id: 'request-1',
          form_key: 'psf-request',
          status: 'Draft',
          form_version: 3,
          requester: 'Fook',
          requester_user_id: requesterActor.id,
          requester_data_json: {
            product_type: 'Existing Product',
          },
          schema_snapshot_json: schemaWithRequiredTitle.schema,
        },
      ],
    });
    dbClient.query.mockResolvedValueOnce({});

    await expect(
      service.submitRequest(
        'request-1',
        {
          expectedUpdatedAt: revision,
          status: 'Submitted',
          formVersion: 3,
        },
        requesterActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('rejects submission when the active schema changed after the requester validated the draft', async () => {
    const newerActiveSchema = {
      ...activeSchema,
      version: 4,
      schema: {
        ...activeSchema.schema,
        version: 4,
      },
    };
    formSchemaService.getActiveSchemaForUpdate.mockResolvedValueOnce(
      newerActiveSchema,
    );
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: revision,
          psf_released_at: null,
          id: 'request-1',
          form_key: 'psf-request',
          status: 'Draft',
          form_version: 4,
          requester: 'Fook',
          requester_user_id: requesterActor.id,
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: 'Fook',
          },
          schema_snapshot_json: newerActiveSchema.schema,
        },
      ],
    });
    dbClient.query.mockResolvedValueOnce({});

    await expect(
      service.submitRequest(
        'request-1',
        {
          expectedUpdatedAt: revision,
          status: 'Submitted',
          formVersion: 3,
        },
        requesterActor,
      ),
    ).rejects.toThrow(
      'The active request schema changed before submit. Reload the draft and submit again.',
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('rejects submitting a request that is already past Draft status', async () => {
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          updated_at_version: revision,
          psf_released_at: null,
          id: 'request-1',
          status: 'Submitted',
          requester: 'Fook',
          requester_user_id: requesterActor.id,
        },
      ],
    });
    dbClient.query.mockResolvedValueOnce({});

    await expect(
      service.submitRequest(
        'request-1',
        {
          expectedUpdatedAt: revision,
          status: 'Submitted',
          formVersion: 3,
        },
        requesterActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('rejects a lost submission CAS before any canonical, search or audit write', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...requestRow, status: 'Draft' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      service.submitRequest(
        'request-1',
        { formVersion: 3, status: 'Submitted', expectedUpdatedAt: revision },
        requesterActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      searchIndexService.upsertSubmittedCanonicalValues,
    ).not.toHaveBeenCalled();
    expect(searchIndexService.upsertRequestSearchIndex).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
    'rejects inherited requester required value %s before writing shared data',
    async (fieldKey) => {
      const captured = {
        ...activeSchema.schema,
        sections: [
          {
            ...activeSchema.schema.sections[0],
            fields: [
              ...activeSchema.schema.sections[0].fields,
              {
                fieldKey,
                canonicalKey: 'required_value',
                label: 'Required Value',
                type: 'text' as const,
                required: true,
              },
            ],
          },
        ],
      };
      pool.query.mockResolvedValue({ rows: [requestRow] });
      pool.query.mockResolvedValueOnce({
        rows: [{ ...requestRow, schema_snapshot_json: captured }],
      });
      await expect(
        service.updateDraftRequesterData(
          'request-1',
          {
            formVersion: 3,
            expectedUpdatedAt: revision,
            requesterData: requestRow.requester_data_json,
          },
          requesterActor,
        ),
      ).rejects.toThrow('Required Value');
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(auditLogService.record).not.toHaveBeenCalled();
      expect(
        searchIndexService.upsertSubmittedCanonicalValues,
      ).not.toHaveBeenCalled();
    },
  );

  it.each(['requester', 'admin', 'setup_owner'] as const)(
    'denies foreign Drafts to %s across every request read/write entry point',
    async (role) => {
      const actor = {
        ...requesterActor,
        role,
        setupOwnerDepartment: role === 'setup_owner' ? ('GNTC' as const) : null,
      };
      const foreign = {
        ...requestRow,
        status: 'Draft',
        requester_user_id: 'foreign-creator',
      };
      pool.query.mockResolvedValue({ rows: [foreign] });
      const operations = [
        () => service.getRequest('request-1', actor),
        () => service.getRequestHistory('request-1', actor),
        () => service.getAllowedStatusTransitions('request-1', actor),
        () =>
          service.updateRequestStatus('request-1', {
            actor,
            status: 'Submitted',
            expectedUpdatedAt: revision,
          }),
        () =>
          service.updateDraftRequesterData(
            'request-1',
            {
              formVersion: 3,
              requesterData: requestRow.requester_data_json,
              expectedUpdatedAt: revision,
            },
            actor,
          ),
        () =>
          service.updatePsfCreatedData('request-1', {
            actor,
            psfCreatedData: {},
            expectedUpdatedAt: revision,
          }),
        () =>
          service.submitRequest(
            'request-1',
            {
              formVersion: 3,
              status: 'Submitted',
              expectedUpdatedAt: revision,
            },
            actor,
          ),
        () =>
          service.upgradeDraftSchema('request-1', { formVersion: 4 }, actor),
      ];
      for (const invoke of operations)
        await expect(invoke()).rejects.toBeInstanceOf(ForbiddenException);
      expect(pool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE psf_requests'),
        expect.anything(),
      );
      expect(auditLogService.findByRequestId).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
      expect(
        searchIndexService.upsertRequestSearchIndex,
      ).not.toHaveBeenCalled();
      expect(
        searchIndexService.upsertSubmittedCanonicalValues,
      ).not.toHaveBeenCalled();
      expect(formSchemaService.getActiveSchemaForUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(['requester', 'admin', 'setup_owner'] as const)(
    'saves an incomplete private own Draft for %s without updating any shared projection',
    async (role) => {
      const actor = {
        ...requesterActor,
        role,
        setupOwnerDepartment: role === 'setup_owner' ? ('GNTC' as const) : null,
      };
      const current = { ...requestRow, status: 'Draft' };
      pool.query
        .mockResolvedValueOnce({ rows: [current] })
        .mockResolvedValueOnce({
          rows: [
            { ...current, requester_data_json: { requester_name: 'Fook' } },
          ],
        });
      await expect(
        service.updateDraftRequesterData(
          'request-1',
          { formVersion: 3, requesterData: {}, expectedUpdatedAt: revision },
          actor,
        ),
      ).resolves.toMatchObject({
        requesterUserId: actor.id,
        canSubmitDraft: true,
        canEditRequesterData: true,
      });
      expect(pool.query).toHaveBeenLastCalledWith(
        expect.stringContaining('AND form_version = $4'),
        ['request-1', null, { requester_name: 'Fook' }, 3, revision],
      );
      expect(formSchemaService.getActiveSchema).not.toHaveBeenCalled();
      expect(
        searchIndexService.upsertRequestSearchIndex,
      ).not.toHaveBeenCalled();
      expect(
        searchIndexService.upsertSubmittedCanonicalValues,
      ).not.toHaveBeenCalled();
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ actor }),
        dbClient,
      );
    },
  );

  it.each(['admin', 'setup_owner'] as const)(
    'allows %s to view and save their own incomplete private PSF Draft even when self-requester',
    async (role) => {
      const actor = {
        ...requesterActor,
        role,
        setupOwnerDepartment: role === 'setup_owner' ? ('GNTC' as const) : null,
      };
      const required = {
        ...storedPsfDateSchema,
        sections: [
          {
            ...storedPsfDateSchema.sections[0],
            fields: storedPsfDateSchema.sections[0].fields.map((field) => ({
              ...field,
              required: true,
            })),
          },
        ],
      };
      const current = {
        ...requestRow,
        status: 'Draft',
        psf_created_schema_snapshot_json: required,
      };
      pool.query
        .mockResolvedValueOnce({ rows: [current] })
        .mockResolvedValueOnce({ rows: [current] });
      await expect(
        service.updatePsfCreatedData('request-1', {
          actor,
          psfCreatedData: {},
          expectedUpdatedAt: revision,
        }),
      ).resolves.toMatchObject({
        psfCreatedDataVisible: true,
        canEditPsfCreatedData: true,
        psfReleasedAt: null,
        requesterUserId: actor.id,
      });
      expect(
        searchIndexService.upsertRequestSearchIndex,
      ).not.toHaveBeenCalled();
      expect(pool.query).toHaveBeenLastCalledWith(
        expect.stringContaining('psf_created_at = CASE'),
        ['request-1', {}, false, revision],
      );
    },
  );

  it.each(['requester', 'admin', 'setup_owner'] as const)(
    'permits %s to reopen Completed shared work without revoking its sticky release',
    async (role) => {
      const actor = { ...requesterActor, role };
      const current = {
        ...requestRow,
        status: 'Completed',
        psf_released_at: revision,
      };
      pool.query
        .mockResolvedValueOnce({ rows: [current] })
        .mockResolvedValueOnce({ rows: [{ ...current, status: 'Submitted' }] });
      await expect(
        service.updateRequestStatus('request-1', {
          actor,
          status: 'Submitted',
          expectedUpdatedAt: revision,
        }),
      ).resolves.toMatchObject({
        status: 'Submitted',
        psfReleasedAt: revision,
        requesterUserId: requesterActor.id,
      });
      expect(pool.query).toHaveBeenLastCalledWith(
        expect.stringContaining('COALESCE(psf_released_at, NOW())'),
        ['request-1', 'Submitted', false, false, 'Completed', revision],
      );
    },
  );

  it('never submits an owned Draft through the generic status endpoint', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ ...requestRow, status: 'Draft' }],
    });
    await expect(
      service.updateRequestStatus('request-1', {
        actor: requesterActor,
        status: 'Submitted',
        expectedUpdatedAt: revision,
      }),
    ).rejects.toThrow('submit action');
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(searchIndexService.upsertRequestSearchIndex).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('does not treat equal status as another transition or first PSF release', async () => {
    const current = { ...requestRow, status: 'PSF Created' };
    pool.query.mockResolvedValueOnce({ rows: [current] });
    await expect(
      service.updateRequestStatus('request-1', {
        actor: requesterActor,
        status: current.status,
        expectedUpdatedAt: revision,
      }),
    ).resolves.toMatchObject({ psfReleasedAt: null });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(searchIndexService.upsertRequestSearchIndex).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it.each(['Draft', 'unknown'])(
    'rejects work transition target %s before updates or side effects',
    async (status) => {
      pool.query.mockResolvedValueOnce({ rows: [requestRow] });
      await expect(
        service.updateRequestStatus('request-1', {
          actor: requesterActor,
          status,
          expectedUpdatedAt: revision,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(
        searchIndexService.upsertRequestSearchIndex,
      ).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    },
  );

  it.each(['requester', 'psf', 'status', 'submit'] as const)(
    'rejects same-millisecond but different microsecond %s revision before writes',
    async (operation) => {
      const exact = '2026-06-18T01:05:03.123456Z';
      const current = {
        ...requestRow,
        status: operation === 'submit' ? 'Draft' : 'Submitted',
        updated_at_version: exact,
      };
      pool.query.mockResolvedValueOnce({ rows: [current] });
      const expectedUpdatedAt = '2026-06-18T01:05:03.123455Z';
      const actor = { ...requesterActor, role: 'admin' as const };
      const invoke =
        operation === 'requester'
          ? service.updateDraftRequesterData(
              'request-1',
              {
                formVersion: 3,
                requesterData: requestRow.requester_data_json,
                expectedUpdatedAt,
              },
              actor,
            )
          : operation === 'psf'
            ? service.updatePsfCreatedData('request-1', {
                actor,
                psfCreatedData: {},
                expectedUpdatedAt,
              })
            : operation === 'status'
              ? service.updateRequestStatus('request-1', {
                  actor,
                  status: 'Completed',
                  expectedUpdatedAt,
                })
              : service.submitRequest(
                  'request-1',
                  { formVersion: 3, status: 'Submitted', expectedUpdatedAt },
                  actor,
                );
      await expect(invoke).rejects.toBeInstanceOf(ConflictException);
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(auditLogService.record).not.toHaveBeenCalled();
      expect(
        searchIndexService.upsertRequestSearchIndex,
      ).not.toHaveBeenCalled();
      expect(
        searchIndexService.upsertSubmittedCanonicalValues,
      ).not.toHaveBeenCalled();
    },
  );

  it.each(['status', 'submit'] as const)(
    'gates %s at a custom renamed trigger using the separate PSF snapshot before any writes',
    async (operation) => {
      const renamed = 'Ready for requester';
      const cfg = {
        ...configuration,
        entries: configuration.entries.map((entry) =>
          entry.id === configuration.psfVisibilityTriggerId
            ? { ...entry, name: renamed }
            : entry,
        ),
      };
      workflowTransitionService.lockConfiguration.mockResolvedValueOnce(cfg);
      const required = {
        ...storedPsfDateSchema,
        sections: [
          {
            ...storedPsfDateSchema.sections[0],
            fields: [
              { ...storedPsfDateSchema.sections[0].fields[0], required: true },
            ],
          },
        ],
      };
      const current = {
        ...requestRow,
        status: operation === 'submit' ? 'Draft' : 'Submitted',
        psf_created_schema_snapshot_json: required,
        psf_released_at: operation === 'status' ? revision : null,
      };
      pool.query.mockResolvedValueOnce({ rows: [current] });
      const invoke =
        operation === 'submit'
          ? service.submitRequest(
              'request-1',
              { formVersion: 3, status: renamed, expectedUpdatedAt: revision },
              requesterActor,
            )
          : service.updateRequestStatus('request-1', {
              actor: requesterActor,
              status: renamed,
              expectedUpdatedAt: revision,
            });
      await expect(invoke).rejects.toThrow(
        'PSF Created Information is missing required fields: Setup Date',
      );
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(
        searchIndexService.upsertSubmittedCanonicalValues,
      ).not.toHaveBeenCalled();
      expect(
        searchIndexService.upsertRequestSearchIndex,
      ).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
      expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    },
  );

  it('submits to an unrelated explicit work target without requiring or releasing PSF data', async () => {
    const required = {
      ...storedPsfDateSchema,
      sections: [
        {
          ...storedPsfDateSchema.sections[0],
          fields: [
            { ...storedPsfDateSchema.sections[0].fields[0], required: true },
          ],
        },
      ],
    };
    const current = {
      ...requestRow,
      status: 'Draft',
      psf_created_schema_snapshot_json: required,
    };
    pool.query
      .mockResolvedValueOnce({ rows: [current] })
      .mockResolvedValueOnce({ rows: [{ ...current, status: 'Submitted' }] });
    await expect(
      service.submitRequest(
        'request-1',
        { formVersion: 3, status: 'Submitted', expectedUpdatedAt: revision },
        requesterActor,
      ),
    ).resolves.toMatchObject({ psfReleasedAt: null });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining("AND status = 'Draft'"),
      [
        'request-1',
        'Submitted',
        'Existing Product',
        requestRow.requester_data_json,
        false,
        false,
        revision,
      ],
    );
    expect(
      workflowTransitionService.lockConfiguration.mock.invocationCallOrder[0],
    ).toBeLessThan(pool.query.mock.invocationCallOrder[0]);
  });

  it.each(['requester', 'psf', 'status', 'submit'] as const)(
    'rolls back %s fields, projection, release and audit together on a downstream audit failure',
    async (operation) => {
      const current = {
        ...requestRow,
        status: operation === 'submit' ? 'Draft' : 'Submitted',
      };
      pool.query
        .mockResolvedValueOnce({ rows: [current] })
        .mockResolvedValueOnce({ rows: [{ ...current, status: 'Submitted' }] });
      auditLogService.record.mockRejectedValueOnce(
        new Error('audit unavailable'),
      );
      const actor = { ...requesterActor, role: 'admin' as const };
      const invoke =
        operation === 'requester'
          ? service.updateDraftRequesterData(
              'request-1',
              {
                formVersion: 3,
                requesterData: requestRow.requester_data_json,
                expectedUpdatedAt: revision,
              },
              actor,
            )
          : operation === 'psf'
            ? service.updatePsfCreatedData('request-1', {
                actor,
                psfCreatedData: { psf_setup_file_name: 'valid.psf' },
                expectedUpdatedAt: revision,
              })
            : operation === 'status'
              ? service.updateRequestStatus('request-1', {
                  actor,
                  status: 'Completed',
                  expectedUpdatedAt: revision,
                })
              : service.submitRequest(
                  'request-1',
                  {
                    formVersion: 3,
                    status: 'Submitted',
                    expectedUpdatedAt: revision,
                  },
                  actor,
                );
      await expect(invoke).rejects.toThrow('audit unavailable');
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ actor }),
        dbClient,
      );
      expect(searchIndexService.upsertRequestSearchIndex).toHaveBeenCalledWith(
        expect.objectContaining({ requesterUserId: requesterActor.id }),
        expect.any(Object),
        dbClient,
      );
      expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(dbClient.release).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { scope: 'my-drafts', relation: 'created' },
    { scope: 'my-drafts', workState: 'open' },
    { scope: 'all', relation: 'created' },
  ] as const)(
    'rejects incompatible list authority filters %p before a search query',
    async (query) => {
      await expect(
        service.queryRequests(query, requesterActor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(searchIndexService.queryRequests).not.toHaveBeenCalled();
      expect(workflowTransitionService.getConfiguration).not.toHaveBeenCalled();
    },
  );

  it('rejects removed department relation and assignment filters', async () => {
    await expect(
      service.queryRequests(
        { scope: 'related', relation: 'department', setupOwnerRole: 'GNTC' },
        requesterActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(searchIndexService.queryRequests).not.toHaveBeenCalled();
  });

  it.each([
    { role: 'requester', status: 'Completed', release: null, visible: false },
    {
      role: 'requester',
      status: 'Renamed business trigger',
      release: revision,
      visible: true,
    },
    {
      role: 'requester',
      status: 'Submitted',
      release: revision,
      visible: true,
    },
    { role: 'admin', status: 'Completed', release: null, visible: true },
    { role: 'setup_owner', status: 'Submitted', release: null, visible: true },
  ] as const)(
    'applies real PSF history masking for $role at $status with sticky release $release',
    async ({ role, status, release, visible }) => {
      const actualAudit = new AuditLogService(pool as never);
      const actualRequests = new RequestsService(
        pool as never,
        formSchemaService as never,
        workflowTransitionService as never,
        searchIndexService as never,
        actualAudit,
      );
      const requesterEvent = {
        action_type: 'REQUESTER_INFORMATION_UPDATED',
        actor_display_name: 'Editor',
        actor_role: 'requester',
        created_at: revision,
        metadata_json: {
          fieldChanges: [
            { fieldKey: 'title', before: 'old', after: 'public title' },
          ],
        },
      };
      const psfEvent = {
        ...requesterEvent,
        action_type: 'PSF_CREATED_INFORMATION_UPDATED',
        metadata_json: {
          fieldChanges: [
            {
              fieldKey: 'psf_setup_file_name',
              before: 'private-old.psf',
              after: 'private-new.psf',
            },
          ],
        },
      };
      pool.query
        .mockResolvedValueOnce({
          rows: [{ ...requestRow, status, psf_released_at: release }],
        })
        .mockResolvedValueOnce({ rows: [requesterEvent, psfEvent] });
      const result = await actualRequests.getRequestHistory('request-1', {
        ...requesterActor,
        role,
      });
      expect(result.map((entry) => entry.actionType)).toEqual(
        visible
          ? ['REQUESTER_INFORMATION_UPDATED', 'PSF_CREATED_INFORMATION_UPDATED']
          : ['REQUESTER_INFORMATION_UPDATED'],
      );
      expect(JSON.stringify(result).includes('private-new.psf')).toBe(visible);
      expect(pool.query).toHaveBeenLastCalledWith(
        expect.stringContaining('WHERE request_id = $1'),
        ['request-1'],
      );
    },
  );

  it.each(['requester', 'psf', 'status', 'submit'] as const)(
    'rolls back %s mutation before audit when the search projection fails',
    async (operation) => {
      const current = {
        ...requestRow,
        status: operation === 'submit' ? 'Draft' : 'Submitted',
      };
      const changed = {
        ...current,
        status: 'Submitted',
        psf_released_at: revision,
      };
      pool.query
        .mockResolvedValueOnce({ rows: [current] })
        .mockResolvedValueOnce({ rows: [changed] });
      searchIndexService.upsertRequestSearchIndex.mockRejectedValueOnce(
        new Error('projection unavailable'),
      );
      const actor = { ...requesterActor, role: 'admin' as const };
      const invoke =
        operation === 'requester'
          ? service.updateDraftRequesterData(
              'request-1',
              {
                formVersion: 3,
                requesterData: requestRow.requester_data_json,
                expectedUpdatedAt: revision,
              },
              actor,
            )
          : operation === 'psf'
            ? service.updatePsfCreatedData('request-1', {
                actor,
                psfCreatedData: { psf_setup_file_name: 'valid.psf' },
                expectedUpdatedAt: revision,
              })
            : operation === 'status'
              ? service.updateRequestStatus('request-1', {
                  actor,
                  status: 'PSF Created',
                  expectedUpdatedAt: revision,
                })
              : service.submitRequest(
                  'request-1',
                  {
                    formVersion: 3,
                    status: 'PSF Created',
                    expectedUpdatedAt: revision,
                  },
                  actor,
                );
      await expect(invoke).rejects.toThrow('projection unavailable');
      expect(searchIndexService.upsertRequestSearchIndex).toHaveBeenCalledWith(
        expect.objectContaining({ requesterUserId: requesterActor.id }),
        expect.any(Object),
        dbClient,
      );
      expect(auditLogService.record).not.toHaveBeenCalled();
      expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(dbClient.release).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['requester', 'psf', 'status', 'submit'] as const)(
    'preserves the exact microsecond %s revision in SQL and its authoritative response',
    async (operation) => {
      const exact = '2026-06-18T01:05:03.123456Z';
      const next = '2026-06-18T01:05:03.123457Z';
      const current = {
        ...requestRow,
        status: operation === 'submit' ? 'Draft' : 'Submitted',
        updated_at_version: exact,
      };
      const data = {
        ...requestRow.requester_data_json,
        requester_name: 'Spoofed editor',
      };
      pool.query
        .mockResolvedValueOnce({ rows: [current] })
        .mockResolvedValueOnce({
          rows: [{ ...current, status: 'Submitted', updated_at_version: next }],
        });
      const actor = {
        ...requesterActor,
        displayName: 'Different authenticated editor',
        role: 'admin' as const,
      };
      const invoke =
        operation === 'requester'
          ? service.updateDraftRequesterData(
              'request-1',
              { formVersion: 3, requesterData: data, expectedUpdatedAt: exact },
              actor,
            )
          : operation === 'psf'
            ? service.updatePsfCreatedData('request-1', {
                actor,
                psfCreatedData: {},
                expectedUpdatedAt: exact,
              })
            : operation === 'status'
              ? service.updateRequestStatus('request-1', {
                  actor,
                  status: 'Completed',
                  expectedUpdatedAt: exact,
                })
              : service.submitRequest(
                  'request-1',
                  {
                    formVersion: 3,
                    status: 'Submitted',
                    expectedUpdatedAt: exact,
                  },
                  actor,
                );
      await expect(invoke).resolves.toMatchObject({
        updatedAt: next,
        requester: 'Fook',
        requesterUserId: requesterActor.id,
        schemaSnapshot: activeSchema.schema,
      });
      const [, params] = pool.query.mock.calls[1] as [string, unknown[]];
      expect(params[params.length - 1]).toBe(exact);
      expect(params).not.toContain(actor.displayName);
      expect(formSchemaService.getActiveSchema).not.toHaveBeenCalled();
      if (operation === 'requester') {
        expect(params[2]).toEqual(requestRow.requester_data_json);
        expect(
          searchIndexService.upsertSubmittedCanonicalValues,
        ).toHaveBeenCalledWith(
          'request-1',
          activeSchema.schema,
          requestRow.requester_data_json,
          dbClient,
        );
      }
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ actor }),
        dbClient,
      );
    },
  );

  it('uses server-resolved immutable related authority and ignores a spoofed requesterUserId filter', async () => {
    const query = {
      scope: 'related' as const,
      relation: 'created' as const,
      requesterUserId: 'spoofed-id',
      requester: 'Other display name',
    };
    await service.queryRequests(query, requesterActor);
    expect(searchIndexService.queryRequests).toHaveBeenCalledWith(
      {
        scope: 'related',
        relation: 'created',
        requester: 'Other display name',
        limit: undefined,
        offset: undefined,
      },
      {
        scope: 'related',
        relation: 'created',
        workState: 'all',
        actorId: requesterActor.id,
        actorRole: 'requester',
        department: null,
        openStatuses: [
          'Submitted',
          'Setup In Progress',
          'Need More Information',
          'PSF Created',
          'Rejected',
        ],
        completedStatuses: ['Completed'],
      },
    );
    expect(query.requesterUserId).toBe('spoofed-id');
  });

  it('raises NotFoundException when loading an unknown request', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.getRequest('missing', requesterActor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PSF Created visibility policy', () => {
  it.each([
    ['requester', 'Draft', false],
    ['requester', 'Submitted', false],
    ['requester', 'PSF Created', false],
    ['requester', 'Completed', false],
    ['admin', 'Draft', true],
    ['setup_owner', 'Submitted', true],
  ] as const)('returns %s for a %s at %s', (role, status, expected) => {
    const visibilityPolicy = requestsServiceModule as unknown as {
      canActorViewPsfCreatedData: (
        status: string,
        actor: { role: typeof role },
      ) => boolean;
    };

    expect(visibilityPolicy.canActorViewPsfCreatedData(status, { role })).toBe(
      expected,
    );
  });
});

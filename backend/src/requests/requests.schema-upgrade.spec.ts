import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogService,
  REQUEST_AUDIT_ACTION,
} from '../audit/audit_log.service';
import { FormSchemaService } from '../admin/form_schema.service';
import { WorkflowTransitionService } from '../admin/workflow_transition.service';
import { DATABASE_POOL } from '../database/database.service';
import { RequestsService } from './requests.service';
import { SearchIndexService } from './search-index.service';

const requesterActor = {
  id: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
  username: 'requester.demo',
  displayName: 'Fook',
  role: 'requester' as const,
  setupOwnerDepartment: null,
};

const setupOwnerActor = {
  id: 'setup-owner-1',
  username: 'setup.gntc.demo',
  displayName: 'Setup Owner GNTC Demo',
  role: 'setup_owner' as const,
  setupOwnerDepartment: 'GNTC' as const,
};

const adminActor = {
  id: 'admin-1',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};

const CURRENT_REVISION = '2026-08-08T01:02:03.123456Z';
const STALE_REVISION = '2026-08-08T01:02:03.123455Z';

const psfCreatedSchemaSnapshot = {
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

const oldSchema = {
  formKey: 'psf-request',
  version: 3,
  title: 'PSF Request Form v3',
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
          required: true,
        },
        {
          fieldKey: 'requester_name',
          canonicalKey: 'requester',
          label: 'Requester Name',
          type: 'text' as const,
          required: true,
        },
        {
          fieldKey: 'legacy_field',
          canonicalKey: 'legacy_field',
          label: 'Legacy Field',
          type: 'text' as const,
          required: false,
        },
      ],
    },
  ],
};

const activeSchema = {
  formKey: 'psf-request',
  version: 4,
  title: 'PSF Request Form v4',
  description: null,
  status: 'active',
  publishedAt: '2026-08-08T00:00:00.000Z',
  schema: {
    formKey: 'psf-request',
    version: 4,
    title: 'PSF Request Form v4',
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
            required: true,
          },
          {
            fieldKey: 'requester_name',
            canonicalKey: 'requester',
            label: 'Requester Name',
            type: 'text' as const,
            required: true,
          },
          {
            fieldKey: 'new_field',
            canonicalKey: 'new_field',
            label: 'New Field',
            type: 'text' as const,
            required: false,
          },
        ],
      },
    ],
  },
};

const lockedDraft = {
  id: 'request-1',
  form_key: 'psf-request',
  form_version: 3,
  status: 'Draft',
  requester: 'Fook',
  requester_user_id: requesterActor.id,
  requester_data_json: {
    legacy_field: 'remove only after Upgrade',
    product_type: 'Existing Product',
    requester_name: 'Client supplied name',
  },
  psf_created_schema_snapshot_json: psfCreatedSchemaSnapshot,
  schema_snapshot_json: oldSchema,
};

const upgradedRow = {
  ...lockedDraft,
  form_version: 4,
  product_type: 'Existing Product',
  requester_data_json: {
    new_field: '',
    product_type: 'Existing Product',
    requester_name: 'Fook',
  },
  psf_created_data_json: {},
  schema_snapshot_json: activeSchema.schema,
  created_at: new Date('2026-06-18T01:02:03.000Z'),
  updated_at: new Date('2026-08-08T01:02:03.000Z'),
  updated_at_version: CURRENT_REVISION,
  submitted_at: null,
  psf_created_at: null,
  completed_at: null,
  setup_owner: null,
  setup_owner_role: null,
};

describe('RequestsService explicit draft schema upgrade', () => {
  let service: RequestsService;
  let pool: { query: jest.Mock; connect: jest.Mock };
  let dbClient: { query: jest.Mock; release: jest.Mock };
  let formSchemaService: {
    getActiveSchema: jest.Mock;
    getActiveSchemaForUpdate: jest.Mock;
  };
  let auditLogService: { record: jest.Mock };

  beforeEach(async () => {
    dbClient = { query: jest.fn(), release: jest.fn() };
    pool = { query: jest.fn(), connect: jest.fn().mockResolvedValue(dbClient) };
    dbClient.query.mockImplementation((query: string, values?: unknown[]) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(query)) {
        return Promise.resolve({});
      }

      const result: unknown = pool.query(query, values);
      return Promise.resolve(result);
    });
    formSchemaService = {
      getActiveSchema: jest.fn().mockResolvedValue(activeSchema),
      getActiveSchemaForUpdate: jest.fn().mockResolvedValue(activeSchema),
    };
    auditLogService = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: DATABASE_POOL, useValue: pool },
        { provide: FormSchemaService, useValue: formSchemaService },
        {
          provide: WorkflowTransitionService,
          useValue: {
            getAllowedNextStatuses: jest.fn(),
            lockConfiguration: jest.fn().mockResolvedValue({
              entries: [
                {
                  id: 'submitted-entry',
                  name: 'Submitted',
                  kind: 'open',
                  requestCount: null,
                },
              ],
              psfVisibilityTriggerId: null,
            }),
          },
        },
        {
          provide: SearchIndexService,
          useValue: {
            ensureRequestSearchIndexStorage: jest
              .fn()
              .mockResolvedValue(undefined),
            extractCanonicalValues: jest.fn(),
            queryRequests: jest.fn(),
            upsertRequestSearchIndex: jest.fn(),
            upsertSubmittedCanonicalValues: jest.fn(),
          },
        },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(RequestsService);
  });

  function invokeUpgrade(
    requestId = lockedDraft.id,
    formVersion = activeSchema.version,
    actor: {
      id: string;
      username: string;
      displayName: string;
      role: 'requester' | 'setup_owner' | 'admin';
      setupOwnerDepartment: 'GNTC' | 'MFG' | null;
    } = requesterActor,
  ): Promise<unknown> {
    const upgradeDraftSchema = Reflect.get(service, 'upgradeDraftSchema') as
      | undefined
      | ((
          id: string,
          dto: { formVersion: number },
          authenticatedActor: typeof actor,
        ) => Promise<unknown>);

    if (!upgradeDraftSchema) {
      throw new Error('upgradeDraftSchema is unavailable');
    }

    return upgradeDraftSchema.call(service, requestId, { formVersion }, actor);
  }

  it('atomically upgrades an owned older Draft using the locked server-authoritative active schema', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [lockedDraft] })
      .mockResolvedValueOnce({ rows: [upgradedRow] });
    const upgradeDraftSchema = Reflect.get(service, 'upgradeDraftSchema') as
      | undefined
      | ((
          requestId: string,
          dto: { formVersion: number },
          actor: typeof requesterActor,
        ) => Promise<unknown>);

    expect(upgradeDraftSchema).toEqual(expect.any(Function));
    if (!upgradeDraftSchema) {
      return;
    }

    await expect(
      upgradeDraftSchema.call(
        service,
        lockedDraft.id,
        { formVersion: activeSchema.version },
        requesterActor,
      ),
    ).resolves.toMatchObject({
      formVersion: activeSchema.version,
      id: lockedDraft.id,
      requesterData: upgradedRow.requester_data_json,
      psfCreatedInformationSchema: psfCreatedSchemaSnapshot,
      schemaSnapshot: activeSchema.schema,
      status: 'Draft',
    });

    expect(formSchemaService.getActiveSchemaForUpdate).toHaveBeenCalledWith(
      'psf-request',
      dbClient,
    );
    expect(formSchemaService.getActiveSchema).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(dbClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FOR UPDATE'),
      [lockedDraft.id],
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE psf_requests'),
      [
        lockedDraft.id,
        requesterActor.displayName,
        requesterActor.id,
        'Existing Product',
        upgradedRow.requester_data_json,
        activeSchema.version,
        activeSchema.schema,
        lockedDraft.form_version,
      ],
    );
    const updateCall = dbClient.query.mock.calls[2] as
      | [string, unknown[]?]
      | undefined;
    expect(updateCall?.[0]).not.toContain('psf_created_schema_snapshot_json');
    expect(auditLogService.record).toHaveBeenCalledWith(
      {
        requestId: lockedDraft.id,
        actionType: REQUEST_AUDIT_ACTION.DRAFT_REQUESTER_DATA_UPDATED,
        actor: requesterActor,
        metadata: {
          fromFormVersion: lockedDraft.form_version,
          toFormVersion: activeSchema.version,
        },
      },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('rejects a requester-data save with a stale form version when the revision matches', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            ...lockedDraft,
            form_version: activeSchema.version,
            schema_snapshot_json: activeSchema.schema,
            updated_at_version: CURRENT_REVISION,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [upgradedRow] });

    await expect(
      service.updateDraftRequesterData(
        lockedDraft.id,
        {
          formVersion: lockedDraft.form_version,
          expectedUpdatedAt: CURRENT_REVISION,
          requesterData: {
            requester_name: requesterActor.displayName,
          },
        },
        requesterActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      dbClient.query.mock.calls.some(
        ([query]) =>
          typeof query === 'string' && /UPDATE\s+psf_requests/i.test(query),
      ),
    ).toBe(false);
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('rejects a stale microsecond revision without issuing a requester-data update', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          ...lockedDraft,
          form_version: activeSchema.version,
          schema_snapshot_json: activeSchema.schema,
          updated_at_version: CURRENT_REVISION,
        },
      ],
    });

    await expect(
      service.updateDraftRequesterData(
        lockedDraft.id,
        {
          formVersion: activeSchema.version,
          expectedUpdatedAt: STALE_REVISION,
          requesterData: {
            product_type: 'Existing Product',
            requester_name: requesterActor.displayName,
          },
        },
        requesterActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('refuses to silently migrate an older Draft when submit is called after Remain', async () => {
    const submittedRow = {
      ...upgradedRow,
      status: 'Submitted',
      submitted_at: new Date('2026-08-08T01:03:03.000Z'),
    };
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            ...lockedDraft,
            psf_created_data_json: {},
            updated_at_version: CURRENT_REVISION,
            setup_owner: null,
            setup_owner_role: null,
            created_at: new Date('2026-06-18T01:02:03.000Z'),
            updated_at: new Date('2026-06-18T01:02:03.000Z'),
            submitted_at: null,
            psf_created_at: null,
            completed_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [submittedRow] });

    await expect(
      service.submitRequest(
        lockedDraft.id,
        {
          formVersion: activeSchema.version,
          status: 'Submitted',
          expectedUpdatedAt: CURRENT_REVISION,
        },
        requesterActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(formSchemaService.getActiveSchemaForUpdate).toHaveBeenCalledWith(
      'psf-request',
      dbClient,
    );
    expect(formSchemaService.getActiveSchema).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('refuses to submit a Draft whose snapshot no longer matches its persisted schema version', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          ...lockedDraft,
          form_version: activeSchema.version,
          updated_at_version: CURRENT_REVISION,
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: requesterActor.displayName,
          },
          schema_snapshot_json: oldSchema,
        },
      ],
    });

    await expect(
      service.submitRequest(
        lockedDraft.id,
        {
          formVersion: activeSchema.version,
          status: 'Submitted',
          expectedUpdatedAt: CURRENT_REVISION,
        },
        requesterActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(formSchemaService.getActiveSchema).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('treats a missing persisted schema snapshot as a recoverable Draft conflict', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          ...lockedDraft,
          form_version: activeSchema.version,
          updated_at_version: CURRENT_REVISION,
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: requesterActor.displayName,
          },
          schema_snapshot_json: null,
        },
      ],
    });

    await expect(
      service.submitRequest(
        lockedDraft.id,
        {
          formVersion: activeSchema.version,
          status: 'Submitted',
          expectedUpdatedAt: CURRENT_REVISION,
        },
        requesterActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(formSchemaService.getActiveSchema).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it.each([
    { name: 'Setup Owner', actor: setupOwnerActor },
    { name: 'Admin', actor: adminActor },
  ])('allows an owned Draft schema upgrade by $name', async ({ actor }) => {
    const ownedDraft = {
      ...lockedDraft,
      requester: actor.displayName,
      requester_user_id: actor.id,
      requester_data_json: {
        ...lockedDraft.requester_data_json,
        requester_name: actor.displayName,
      },
    };
    const upgradedOwnedRow = {
      ...upgradedRow,
      requester: actor.displayName,
      requester_user_id: actor.id,
      requester_data_json: {
        ...upgradedRow.requester_data_json,
        requester_name: actor.displayName,
      },
    };
    pool.query
      .mockResolvedValueOnce({ rows: [ownedDraft] })
      .mockResolvedValueOnce({ rows: [upgradedOwnedRow] });

    await expect(
      invokeUpgrade(ownedDraft.id, activeSchema.version, actor),
    ).resolves.toMatchObject({
      formVersion: activeSchema.version,
      requester: actor.displayName,
      requesterUserId: actor.id,
      schemaSnapshot: activeSchema.schema,
    });

    expect(formSchemaService.getActiveSchemaForUpdate).toHaveBeenCalledWith(
      'psf-request',
      dbClient,
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ actor }),
      dbClient,
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('rejects cross-owner and non-Draft upgrades without mutating the request', async () => {
    const foreignOwnedDraft = {
      ...lockedDraft,
      requester_user_id: 'other-requester-id',
    };
    for (const actor of [requesterActor, setupOwnerActor, adminActor]) {
      pool.query.mockResolvedValueOnce({ rows: [foreignOwnedDraft] });

      await expect(
        invokeUpgrade(lockedDraft.id, activeSchema.version, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(formSchemaService.getActiveSchemaForUpdate).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
      expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(dbClient.release).toHaveBeenCalledTimes(1);

      dbClient.query.mockClear();
      dbClient.release.mockClear();
    }

    pool.query.mockResolvedValueOnce({
      rows: [{ ...lockedDraft, status: 'Submitted' }],
    });

    await expect(invokeUpgrade()).rejects.toBeInstanceOf(ForbiddenException);
    expect(formSchemaService.getActiveSchemaForUpdate).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back not-found, stale-target, and inconsistent-snapshot rejections before an update', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(invokeUpgrade()).rejects.toBeInstanceOf(NotFoundException);
    expect(formSchemaService.getActiveSchemaForUpdate).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');

    dbClient.query.mockClear();
    formSchemaService.getActiveSchemaForUpdate.mockClear();
    pool.query.mockClear();
    pool.query.mockResolvedValueOnce({ rows: [lockedDraft] });
    formSchemaService.getActiveSchemaForUpdate.mockResolvedValueOnce({
      ...activeSchema,
      version: 5,
      schema: { ...activeSchema.schema, version: 5 },
    });

    await expect(invokeUpgrade()).rejects.toBeInstanceOf(ConflictException);
    expect(formSchemaService.getActiveSchemaForUpdate).toHaveBeenCalledWith(
      'psf-request',
      dbClient,
    );
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');

    dbClient.query.mockClear();
    formSchemaService.getActiveSchemaForUpdate.mockClear();
    pool.query.mockClear();
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          ...lockedDraft,
          schema_snapshot_json: { ...oldSchema, version: 2 },
        },
      ],
    });

    await expect(invokeUpgrade()).rejects.toBeInstanceOf(ConflictException);
    expect(formSchemaService.getActiveSchemaForUpdate).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('does not downgrade a current-or-newer Draft when the explicit upgrade action is replayed', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          ...lockedDraft,
          form_version: activeSchema.version,
          schema_snapshot_json: activeSchema.schema,
        },
      ],
    });

    await expect(invokeUpgrade()).rejects.toBeInstanceOf(ConflictException);
    expect(formSchemaService.getActiveSchemaForUpdate).toHaveBeenCalledWith(
      'psf-request',
      dbClient,
    );
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('rolls back an optimistic update race and preserves an audit failure for the caller', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [lockedDraft] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(invokeUpgrade()).rejects.toBeInstanceOf(ConflictException);
    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);

    dbClient.query.mockClear();
    dbClient.release.mockClear();
    pool.query.mockClear();
    pool.query
      .mockResolvedValueOnce({ rows: [lockedDraft] })
      .mockResolvedValueOnce({ rows: [upgradedRow] });
    auditLogService.record.mockRejectedValueOnce(
      new Error('audit insert failed'),
    );

    await expect(invokeUpgrade()).rejects.toThrow('audit insert failed');
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });
});

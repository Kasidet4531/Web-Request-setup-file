import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditLogService,
  REQUEST_AUDIT_ACTION,
} from '../audit/audit_log.service';
import { FormSchemaService } from '../admin/form_schema.service';
import { WorkflowTransitionService } from '../admin/workflow_transition.service';
import { DATABASE_POOL } from '../database/database.service';
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
            required: true,
            options: ['New Product', 'Transfer Product', 'Existing Product'],
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

const CURRENT_REVISION = '2026-06-18T01:02:03.123456Z';
const NEXT_REVISION = '2026-06-18T01:02:03.123457Z';
const workflowConfiguration = {
  entries: [
    { id: 'submitted', name: 'Submitted', kind: 'open', requestCount: null },
    {
      id: 'setup-in-progress',
      name: 'Setup In Progress',
      kind: 'open',
      requestCount: null,
    },
    {
      id: 'psf-created',
      name: 'PSF Created',
      kind: 'open',
      requestCount: null,
    },
  ],
  psfVisibilityTriggerId: 'psf-created',
};

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

const requesterActor = {
  id: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
  username: 'requester.demo',
  displayName: 'Fook',
  role: 'requester' as const,
  setupOwnerDepartment: null,
};

const setupOwnerActor = {
  id: 'a93b0f92-2e07-4b16-b3cf-1bf5b874a11d',
  username: 'setup.gntc.demo',
  displayName: 'Setup Owner GNTC Demo',
  role: 'setup_owner' as const,
  setupOwnerDepartment: 'GNTC' as const,
};

const draftRow = {
  id: 'c4e87bd1-f7de-4d6d-8097-bf914cd13acd',
  request_no: 'DRAFT-20260618-0001',
  form_key: 'psf-request',
  form_version: 3,
  status: 'Draft',
  requester: 'Fook',
  requester_user_id: requesterActor.id,
  setup_owner: null,
  setup_owner_role: null,
  product_type: 'New Product',
  requester_data_json: {
    product_type: 'New Product',
    requester_name: 'Fook',
  },
  psf_created_data_json: {},
  schema_snapshot_json: activeSchema.schema,
  created_at: new Date('2026-06-18T01:02:03.000Z'),
  updated_at: new Date('2026-06-18T01:02:03.000Z'),
  updated_at_version: CURRENT_REVISION,
  submitted_at: null,
  psf_created_at: null,
  completed_at: null,
};

describe('RequestsService audit baseline', () => {
  let service: RequestsService;
  let pool: { query: jest.Mock; connect: jest.Mock };
  let dbClient: { query: jest.Mock; release: jest.Mock };
  let formSchemaService: {
    getActiveSchema: jest.Mock;
    getActiveSchemaForUpdate: jest.Mock;
  };
  let searchIndexService: {
    extractCanonicalValues: jest.Mock;
    upsertRequestSearchIndex: jest.Mock;
    upsertSubmittedCanonicalValues: jest.Mock;
  };
  let auditLogService: { record: jest.Mock };

  beforeEach(async () => {
    dbClient = { query: jest.fn(), release: jest.fn() };
    pool = { query: jest.fn(), connect: jest.fn().mockResolvedValue(dbClient) };
    formSchemaService = {
      getActiveSchema: jest.fn().mockResolvedValue(activeSchema),
      getActiveSchemaForUpdate: jest.fn().mockResolvedValue(activeSchema),
    };
    searchIndexService = {
      extractCanonicalValues: jest.fn().mockReturnValue({
        product_type: 'New Product',
        requester: 'Fook',
      }),
      upsertRequestSearchIndex: jest.fn().mockResolvedValue(undefined),
      upsertSubmittedCanonicalValues: jest.fn().mockResolvedValue({
        product_type: 'New Product',
        requester: 'Fook',
      }),
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
            getAllowedNextStatuses: jest
              .fn()
              .mockResolvedValue(['Setup In Progress']),
            lockConfiguration: jest
              .fn()
              .mockResolvedValue(workflowConfiguration),
          },
        },
        { provide: SearchIndexService, useValue: searchIndexService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(RequestsService);
  });

  it('records draft creation with the authenticated actor in the same transaction', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ next: draftRow.request_no }] })
      .mockResolvedValueOnce({ rows: [draftRow] });
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ next: draftRow.request_no }] })
      .mockResolvedValueOnce({ rows: [draftRow] })
      .mockResolvedValueOnce({});

    await service.createDraft(
      {
        requester: 'Client supplied requester',
        requesterData: draftRow.requester_data_json,
      },
      requesterActor,
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      {
        requestId: draftRow.id,
        actionType: REQUEST_AUDIT_ACTION.DRAFT_CREATED,
        actor: requesterActor,
        metadata: {},
      },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(dbClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back draft creation when the audit insert fails', async () => {
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ next: draftRow.request_no }] })
      .mockResolvedValueOnce({ rows: [draftRow] });
    auditLogService.record.mockRejectedValueOnce(
      new Error('audit insert failed'),
    );

    await expect(
      service.createDraft(
        { requesterData: draftRow.requester_data_json },
        requesterActor,
      ),
    ).rejects.toThrow('audit insert failed');

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: draftRow.id,
        actionType: REQUEST_AUDIT_ACTION.DRAFT_CREATED,
        actor: requesterActor,
      }),
      dbClient,
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('records requester-data draft updates with the authenticated actor in the same transaction', async () => {
    const updatedRow = {
      ...draftRow,
      product_type: 'Transfer Product',
      requester_data_json: {
        product_type: 'Transfer Product',
        requester_name: 'Fook',
      },
      updated_at: new Date('2026-06-18T01:04:03.000Z'),
      updated_at_version: NEXT_REVISION,
    };
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            ...draftRow,
            updated_at_version: CURRENT_REVISION,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [updatedRow] });
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            ...draftRow,
            updated_at_version: CURRENT_REVISION,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [updatedRow] })
      .mockResolvedValueOnce({});

    const response = await service.updateDraftRequesterData(
      draftRow.id,
      {
        formVersion: draftRow.form_version,
        expectedUpdatedAt: CURRENT_REVISION,
        requesterData: updatedRow.requester_data_json,
      },
      requesterActor,
    );
    expect(response.updatedAt).toBe(NEXT_REVISION);

    expect(auditLogService.record).toHaveBeenCalledWith(
      {
        requestId: draftRow.id,
        actionType: REQUEST_AUDIT_ACTION.DRAFT_REQUESTER_DATA_UPDATED,
        actor: requesterActor,
        metadata: {
          fieldChanges: [
            {
              fieldKey: 'product_type',
              fieldLabel: 'Product Type',
              before: 'New Product',
              after: 'Transfer Product',
            },
          ],
        },
      },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('updated_at = ($5::timestamptz'),
      [
        draftRow.id,
        'Transfer Product',
        updatedRow.requester_data_json,
        draftRow.form_version,
        CURRENT_REVISION,
      ],
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(dbClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back requester-data changes when the audit insert fails', async () => {
    const updatedRow = {
      ...draftRow,
      product_type: 'Transfer Product',
      requester_data_json: {
        product_type: 'Transfer Product',
        requester_name: 'Fook',
      },
      updated_at_version: NEXT_REVISION,
    };
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ ...draftRow, updated_at_version: CURRENT_REVISION }],
      })
      .mockResolvedValueOnce({ rows: [updatedRow] });
    auditLogService.record.mockRejectedValueOnce(
      new Error('audit insert failed'),
    );

    await expect(
      service.updateDraftRequesterData(
        draftRow.id,
        {
          formVersion: draftRow.form_version,
          expectedUpdatedAt: CURRENT_REVISION,
          requesterData: updatedRow.requester_data_json,
        },
        requesterActor,
      ),
    ).rejects.toThrow('audit insert failed');

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: requesterActor,
        metadata: {
          fieldChanges: [
            {
              fieldKey: 'product_type',
              fieldLabel: 'Product Type',
              before: 'New Product',
              after: 'Transfer Product',
            },
          ],
        },
      }),
      dbClient,
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('records draft submission with the authenticated actor in the existing submit transaction', async () => {
    const submittedRow = {
      ...draftRow,
      status: 'Submitted',
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      updated_at: new Date('2026-06-18T01:05:03.000Z'),
      updated_at_version: NEXT_REVISION,
    };
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            ...draftRow,
            updated_at_version: CURRENT_REVISION,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [submittedRow] })
      .mockResolvedValueOnce({});

    const response = await service.submitRequest(
      draftRow.id,
      {
        formVersion: activeSchema.version,
        status: 'Submitted',
        expectedUpdatedAt: CURRENT_REVISION,
      },
      requesterActor,
    );
    expect(response.updatedAt).toBe(NEXT_REVISION);

    expect(auditLogService.record).toHaveBeenCalledWith(
      {
        requestId: draftRow.id,
        actionType: REQUEST_AUDIT_ACTION.REQUEST_SUBMITTED,
        actor: requesterActor,
        metadata: { fromStatus: 'Draft', toStatus: 'Submitted' },
      },
      dbClient,
    );
    expect(
      searchIndexService.upsertSubmittedCanonicalValues,
    ).toHaveBeenCalledWith(
      draftRow.id,
      activeSchema.schema,
      draftRow.requester_data_json,
      dbClient,
    );
    expect(searchIndexService.upsertRequestSearchIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: draftRow.id,
        status: 'Submitted',
      }),
      { product_type: 'New Product', requester: 'Fook' },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('updated_at = ($7::timestamptz'),
      [
        draftRow.id,
        'Submitted',
        'New Product',
        draftRow.requester_data_json,
        false,
        false,
        CURRENT_REVISION,
      ],
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(dbClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back submit status, release, and search projections when the audit insert fails', async () => {
    const currentRow = {
      ...draftRow,
      psf_created_schema_snapshot_json: psfCreatedSchemaSnapshot,
      psf_created_data_json: { file_name_v4: 'request.psf' },
      updated_at_version: CURRENT_REVISION,
    };
    const submittedRow = {
      ...currentRow,
      status: 'PSF Created',
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      psf_released_at: new Date('2026-06-18T01:05:03.000Z'),
      updated_at_version: NEXT_REVISION,
    };
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [currentRow] })
      .mockResolvedValueOnce({ rows: [submittedRow] });
    auditLogService.record.mockRejectedValueOnce(
      new Error('audit insert failed'),
    );

    await expect(
      service.submitRequest(
        draftRow.id,
        {
          formVersion: activeSchema.version,
          status: 'PSF Created',
          expectedUpdatedAt: CURRENT_REVISION,
        },
        requesterActor,
      ),
    ).rejects.toThrow('audit insert failed');

    expect(
      searchIndexService.upsertSubmittedCanonicalValues,
    ).toHaveBeenCalledWith(
      draftRow.id,
      activeSchema.schema,
      draftRow.requester_data_json,
      dbClient,
    );
    expect(searchIndexService.upsertRequestSearchIndex).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PSF Created' }),
      { product_type: 'New Product', requester: 'Fook' },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('psf_released_at = CASE WHEN $6::boolean'),
      [
        draftRow.id,
        'PSF Created',
        'New Product',
        draftRow.requester_data_json,
        false,
        true,
        CURRENT_REVISION,
      ],
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('records status transitions with trusted actor attribution and preserves request identity and assignment', async () => {
    const existingAssignment = {
      setup_owner: 'Existing Setup Owner MFG',
      setup_owner_role: 'MFG',
    };
    const transitionedRow = {
      ...draftRow,
      ...existingAssignment,
      status: 'Setup In Progress',
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      updated_at: new Date('2026-06-18T01:06:03.000Z'),
      updated_at_version: NEXT_REVISION,
    };
    const currentRow = {
      ...draftRow,
      ...existingAssignment,
      status: 'Submitted',
      updated_at_version: CURRENT_REVISION,
    };
    pool.query
      .mockResolvedValueOnce({ rows: [currentRow] })
      .mockResolvedValueOnce({ rows: [transitionedRow] });
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [currentRow] })
      .mockResolvedValueOnce({ rows: [transitionedRow] })
      .mockResolvedValueOnce({});

    const response = await service.updateRequestStatus(draftRow.id, {
      status: 'Setup In Progress',
      expectedUpdatedAt: CURRENT_REVISION,
      actor: setupOwnerActor,
    });
    expect(response).toMatchObject({
      updatedAt: NEXT_REVISION,
      requester: draftRow.requester,
      requesterUserId: draftRow.requester_user_id,
    });

    expect(auditLogService.record).toHaveBeenCalledWith(
      {
        requestId: draftRow.id,
        actionType: REQUEST_AUDIT_ACTION.REQUEST_STATUS_CHANGED,
        actor: setupOwnerActor,
        metadata: {
          fromStatus: 'Submitted',
          toStatus: 'Setup In Progress',
        },
      },
      dbClient,
    );
    expect(searchIndexService.upsertRequestSearchIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: draftRow.id,
        status: 'Setup In Progress',
        requester: draftRow.requester,
        requesterUserId: draftRow.requester_user_id,
      }),
      { product_type: 'New Product', requester: 'Fook' },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.not.stringMatching(
        /\b(requester|requester_user_id|setup_owner|setup_owner_role)\s*=/i,
      ),
      expect.any(Array),
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(dbClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back status and release changes when the audit insert fails', async () => {
    const existingAssignment = {
      setup_owner: 'Existing Setup Owner MFG',
      setup_owner_role: 'MFG',
    };
    const transitionedRow = {
      ...draftRow,
      ...existingAssignment,
      status: 'PSF Created',
      psf_created_data_json: { file_name_v4: 'request.psf' },
      psf_created_schema_snapshot_json: psfCreatedSchemaSnapshot,
      psf_released_at: new Date('2026-06-18T01:06:03.000Z'),
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      updated_at: new Date('2026-06-18T01:06:03.000Z'),
      updated_at_version: NEXT_REVISION,
    };
    const currentRow = {
      ...draftRow,
      ...existingAssignment,
      status: 'Submitted',
      psf_created_data_json: { file_name_v4: 'request.psf' },
      psf_created_schema_snapshot_json: psfCreatedSchemaSnapshot,
      updated_at_version: CURRENT_REVISION,
    };
    pool.query
      .mockResolvedValueOnce({ rows: [currentRow] })
      .mockResolvedValueOnce({ rows: [transitionedRow] });
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [currentRow] })
      .mockResolvedValueOnce({ rows: [transitionedRow] })
      .mockResolvedValueOnce({});
    auditLogService.record.mockRejectedValueOnce(
      new Error('audit insert failed'),
    );

    await expect(
      service.updateRequestStatus(draftRow.id, {
        status: 'PSF Created',
        expectedUpdatedAt: CURRENT_REVISION,
        actor: setupOwnerActor,
      }),
    ).rejects.toThrow('audit insert failed');

    expect(searchIndexService.upsertRequestSearchIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PSF Created',
        requester: draftRow.requester,
        requesterUserId: draftRow.requester_user_id,
      }),
      { product_type: 'New Product', requester: 'Fook' },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('psf_released_at = CASE WHEN $4::boolean'),
      [draftRow.id, 'PSF Created', false, true, 'Submitted', CURRENT_REVISION],
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.not.stringMatching(
        /\b(requester|requester_user_id|setup_owner|setup_owner_role)\s*=/i,
      ),
      expect.any(Array),
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });
});

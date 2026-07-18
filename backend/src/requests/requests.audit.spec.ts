import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditLogService,
  REQUEST_AUDIT_ACTION,
} from '../audit/audit_log.service';
import { FormSchemaService } from '../admin/form_schema.service';
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
        visibleTo: ['requester'],
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
        ],
      },
    ],
  },
};

const requesterActor = {
  id: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
  username: 'requester.demo',
  displayName: 'Requester Demo',
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
  submitted_at: null,
  psf_created_at: null,
  completed_at: null,
};

describe('RequestsService audit baseline', () => {
  let service: RequestsService;
  let pool: { query: jest.Mock; connect: jest.Mock };
  let dbClient: { query: jest.Mock; release: jest.Mock };
  let formSchemaService: { getActiveSchema: jest.Mock };
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

  it('records requester-data draft updates with the authenticated actor in the same transaction', async () => {
    const updatedRow = {
      ...draftRow,
      product_type: 'Transfer Product',
      requester_data_json: {
        product_type: 'Transfer Product',
        requester_name: 'Fook',
      },
      updated_at: new Date('2026-06-18T01:04:03.000Z'),
    };
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: draftRow.id, status: 'Draft' }] })
      .mockResolvedValueOnce({ rows: [updatedRow] });
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: draftRow.id, status: 'Draft' }] })
      .mockResolvedValueOnce({ rows: [updatedRow] })
      .mockResolvedValueOnce({});

    await service.updateDraftRequesterData(
      draftRow.id,
      {
        requester: 'Client supplied requester',
        requesterData: updatedRow.requester_data_json,
      },
      requesterActor,
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      {
        requestId: draftRow.id,
        actionType: REQUEST_AUDIT_ACTION.DRAFT_REQUESTER_DATA_UPDATED,
        actor: requesterActor,
        metadata: {},
      },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(dbClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('records draft submission with the authenticated actor in the existing submit transaction', async () => {
    const submittedRow = {
      ...draftRow,
      status: 'Submitted',
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      updated_at: new Date('2026-06-18T01:05:03.000Z'),
    };
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: draftRow.id,
            status: 'Draft',
            requester_data_json: draftRow.requester_data_json,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [submittedRow] })
      .mockResolvedValueOnce({});

    await service.submitRequest(
      draftRow.id,
      { formVersion: activeSchema.version },
      requesterActor,
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      {
        requestId: draftRow.id,
        actionType: REQUEST_AUDIT_ACTION.REQUEST_SUBMITTED,
        actor: requesterActor,
        metadata: {},
      },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(dbClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('records status transitions with trusted actor attribution and from/to status metadata', async () => {
    const transitionedRow = {
      ...draftRow,
      status: 'Setup In Progress',
      setup_owner: setupOwnerActor.displayName,
      setup_owner_role: setupOwnerActor.setupOwnerDepartment,
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      updated_at: new Date('2026-06-18T01:06:03.000Z'),
    };
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: draftRow.id, status: 'Submitted' }],
      })
      .mockResolvedValueOnce({ rows: [transitionedRow] });
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: draftRow.id, status: 'Submitted' }],
      })
      .mockResolvedValueOnce({ rows: [transitionedRow] })
      .mockResolvedValueOnce({});

    await service.updateRequestStatus(draftRow.id, {
      status: 'Setup In Progress',
      actor: setupOwnerActor,
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
      }),
      { product_type: 'New Product', requester: 'Fook' },
      dbClient,
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(dbClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back the status mutation and rethrows when its audit insert fails', async () => {
    const transitionedRow = {
      ...draftRow,
      status: 'Setup In Progress',
      setup_owner: setupOwnerActor.displayName,
      setup_owner_role: setupOwnerActor.setupOwnerDepartment,
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      updated_at: new Date('2026-06-18T01:06:03.000Z'),
    };
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: draftRow.id, status: 'Submitted' }],
      })
      .mockResolvedValueOnce({ rows: [transitionedRow] });
    dbClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: draftRow.id, status: 'Submitted' }],
      })
      .mockResolvedValueOnce({ rows: [transitionedRow] })
      .mockResolvedValueOnce({});
    auditLogService.record.mockRejectedValueOnce(
      new Error('audit insert failed'),
    );

    await expect(
      service.updateRequestStatus(draftRow.id, {
        status: 'Setup In Progress',
        actor: setupOwnerActor,
      }),
    ).rejects.toThrow('audit insert failed');

    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dbClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });
});

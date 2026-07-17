import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

describe('RequestsService draft flow', () => {
  let service: RequestsService;
  let pool: { query: jest.Mock; connect: jest.Mock };
  let dbClient: { query: jest.Mock; release: jest.Mock };
  let formSchemaService: { getActiveSchema: jest.Mock };
  let searchIndexService: {
    extractCanonicalValues: jest.Mock;
    queryRequests: jest.Mock;
    upsertRequestSearchIndex: jest.Mock;
    upsertSubmittedCanonicalValues: jest.Mock;
  };

  beforeEach(async () => {
    dbClient = { query: jest.fn(), release: jest.fn() };
    pool = { query: jest.fn(), connect: jest.fn().mockResolvedValue(dbClient) };
    formSchemaService = {
      getActiveSchema: jest.fn().mockResolvedValue(activeSchema),
    };
    searchIndexService = {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: DATABASE_POOL, useValue: pool },
        { provide: FormSchemaService, useValue: formSchemaService },
        { provide: SearchIndexService, useValue: searchIndexService },
      ],
    }).compile();

    service = module.get(RequestsService);
  });

  it('creates a draft request against the active PSF request schema', async () => {
    const insertedRow = {
      id: 'request-1',
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
    pool.query.mockResolvedValueOnce({
      rows: [{ next: 'DRAFT-20260618-0001' }],
    });
    pool.query.mockResolvedValueOnce({ rows: [insertedRow] });

    const draft = await service.createDraft({
      requester: 'Fook',
      requesterData: { product_type: 'New Product', requester_name: 'Fook' },
    });

    expect(formSchemaService.getActiveSchema).toHaveBeenCalledWith(
      'psf-request',
    );
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO psf_requests'),
      [
        expect.any(String),
        'DRAFT-20260618-0001',
        'psf-request',
        3,
        'Draft',
        'Fook',
        'New Product',
        { product_type: 'New Product', requester_name: 'Fook' },
        activeSchema.schema,
      ],
    );
    expect(draft).toMatchObject({
      id: 'request-1',
      requestNo: 'DRAFT-20260618-0001',
      status: 'Draft',
      requesterData: { product_type: 'New Product', requester_name: 'Fook' },
      schemaSnapshot: activeSchema.schema,
    });
  });

  it('queries submitted requests through the search index with normalized pagination values', async () => {
    searchIndexService.queryRequests.mockResolvedValueOnce({
      items: [{ requestId: 'request-1', requestNo: 'DRAFT-1' }],
      total: 1,
      limit: 25,
      offset: 50,
    });

    await expect(
      service.queryRequests({
        keyword: 'probe',
        status: 'Submitted',
        limit: '25' as never,
        offset: '50' as never,
      }),
    ).resolves.toEqual({
      items: [{ requestId: 'request-1', requestNo: 'DRAFT-1' }],
      total: 1,
      limit: 25,
      offset: 50,
    });

    expect(searchIndexService.queryRequests).toHaveBeenCalledWith({
      keyword: 'probe',
      status: 'Submitted',
      limit: 25,
      offset: 50,
    });
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
      description: 'returns the requester cancellation option from Submitted',
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
        'returns the requester resubmit and cancellation options from Need More Information',
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
  ])('$description', async ({ actor, allowedNextStatuses, currentStatus }) => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 'request-1', status: currentStatus }],
    });

    await expect(
      service.getAllowedStatusTransitions('request-1', actor),
    ).resolves.toEqual({ allowedNextStatuses });
  });

  it('allows a setup owner to manually move a submitted request into setup and records the acting owner', async () => {
    const actor = {
      id: 'user-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const updatedRow = {
      id: 'request-1',
      request_no: 'DRAFT-1',
      form_key: 'psf-request',
      form_version: 3,
      status: 'Setup In Progress',
      requester: 'Fook',
      setup_owner: 'Setup Owner GNTC Demo',
      setup_owner_role: 'GNTC',
      product_type: 'Existing Product',
      requester_data_json: {
        product_type: 'Existing Product',
        requester_name: 'Fook',
      },
      psf_created_data_json: {},
      schema_snapshot_json: activeSchema.schema,
      created_at: new Date('2026-06-18T01:02:03.000Z'),
      updated_at: new Date('2026-06-18T01:06:03.000Z'),
      submitted_at: new Date('2026-06-18T01:05:03.000Z'),
      psf_created_at: null,
      completed_at: null,
    };
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 'request-1', status: 'Submitted' }],
    });
    pool.query.mockResolvedValueOnce({ rows: [updatedRow] });

    const result = await service.updateRequestStatus('request-1', {
      status: 'Setup In Progress',
      actor,
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      expect.arrayContaining([
        'request-1',
        'Setup In Progress',
        'Setup Owner GNTC Demo',
        'GNTC',
      ]),
    );
    expect(searchIndexService.upsertRequestSearchIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-1',
        status: 'Setup In Progress',
        setupOwner: 'Setup Owner GNTC Demo',
        setupOwnerRole: 'GNTC',
      }),
      { product_type: 'Existing Product', requester: 'Fook' },
    );
    expect(result).toMatchObject({
      id: 'request-1',
      status: 'Setup In Progress',
      setupOwner: 'Setup Owner GNTC Demo',
      setupOwnerRole: 'GNTC',
    });
  });

  it('rejects a stale status transition when the persisted status changes after validation', async () => {
    const actor = {
      id: 'user-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 'request-1', status: 'Submitted' }],
    });
    pool.query.mockResolvedValueOnce({ rows: [] });

    let error: unknown = undefined;
    try {
      await service.updateRequestStatus('request-1', {
        status: 'Setup In Progress',
        actor,
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty(
      'message',
      'The request status changed before this update. Reload the request and try again.',
    );

    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringMatching(/WHERE id = \$1\s+AND status = \$5/),
      [
        'request-1',
        'Setup In Progress',
        'Setup Owner GNTC Demo',
        'GNTC',
        'Submitted',
      ],
    );
  });

  it('rejects a requester attempting a setup-owner-only transition', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 'request-1', status: 'Submitted' }],
    });

    await expect(
      service.updateRequestStatus('request-1', {
        status: 'Setup In Progress',
        actor: {
          id: 'user-2',
          username: 'requester.demo',
          displayName: 'Requester Demo',
          role: 'requester',
          setupOwnerDepartment: null,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(pool.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      expect.any(Array),
    );
  });

  it('rejects admin manual status changes out of Draft so submit validation cannot be bypassed', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 'request-1', status: 'Draft' }],
    });

    await expect(
      service.updateRequestStatus('request-1', {
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
    expect(pool.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      expect.any(Array),
    );
  });

  it('loads an existing draft request with requester data and schema snapshot', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          request_no: 'DRAFT-1',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Draft',
          requester: 'Fook',
          setup_owner: null,
          setup_owner_role: null,
          product_type: 'Transfer Product',
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

    await expect(service.getRequest('request-1')).resolves.toMatchObject({
      id: 'request-1',
      status: 'Draft',
      requesterData: { product_type: 'Transfer Product' },
      schemaSnapshot: activeSchema.schema,
    });
  });

  it('masks raw PSF Created Information for a requester before PSF Created', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
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
            status,
            requester: 'Fook',
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
          layout: 42,
          unexpected_field: 'must be dropped',
        },
      });
    };

    await expect(invokeUpdate()).resolves.toMatchObject({
      status: 'Setup In Progress',
      setupOwner: 'Setup Owner GNTC Demo',
      setupOwnerRole: 'GNTC',
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
        'Setup Owner GNTC Demo',
        'GNTC',
        currentUpdatedAt,
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
        rows: [{ id: 'request-1', status: 'Setup In Progress' }],
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
      expect(pool.query).toHaveBeenCalledTimes(1);
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
      rows: [{ id: 'request-1', status: 'Setup In Progress' }],
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
    expect(pool.query).toHaveBeenCalledTimes(1);
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
        "updated_at = ($5::timestamptz AT TIME ZONE current_setting('TIMEZONE'))",
      ),
      [
        'request-1',
        { psf_setup_file_name: 'stale-setup.psf' },
        'Setup Owner GNTC Demo',
        'GNTC',
        currentUpdatedAt,
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
      rows: [{ id: 'request-1', status: 'Setup In Progress' }],
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
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a setup owner attempting to save PSF Created Information after Completed', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 'request-1', status: 'Completed' }],
    });
    const actor = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
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
        psfCreatedData: { psf_setup_file_name: 'late-change.psf' },
      });
    };

    await expect(invokeUpdate()).rejects.toBeInstanceOf(ForbiddenException);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('allows an admin to save PSF Created Information after Completed without replacing the saved owner', async () => {
    const currentUpdatedAt = new Date('2026-06-18T01:07:03.000Z');
    const updatedRow = {
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
      setupOwner: 'Setup Owner GNTC Demo',
      setupOwnerRole: 'GNTC',
      psfCreatedData: { psf_setup_file_name: 'admin-corrected.psf' },
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
    });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.not.stringContaining("status <> 'Completed'"),
      [
        'request-1',
        { psf_setup_file_name: 'admin-corrected.psf' },
        null,
        null,
        currentUpdatedAt,
      ],
    );
  });

  it('updates requester-owned draft data while the request status is Draft', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          status: 'Draft',
        },
      ],
    });
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          request_no: 'DRAFT-1',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Draft',
          requester: 'Fook',
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
          updated_at: new Date('2026-06-18T01:04:03.000Z'),
          submitted_at: null,
          psf_created_at: null,
          completed_at: null,
        },
      ],
    });

    const updated = await service.updateDraftRequesterData('request-1', {
      requester: 'Fook',
      requesterData: {
        product_type: 'Existing Product',
        requester_name: 'Fook',
      },
    });

    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      [
        'request-1',
        'Fook',
        'Existing Product',
        { product_type: 'Existing Product', requester_name: 'Fook' },
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

  it('rejects requester-owned updates after Draft status', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 'request-1', status: 'Submitted' }],
    });

    await expect(
      service.updateDraftRequesterData('request-1', {
        requester: 'Fook',
        requesterData: { product_type: 'New Product' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('submits a draft request and refreshes its locked schema snapshot from the active schema', async () => {
    const submittedSchema = {
      ...activeSchema,
      version: 4,
      schema: {
        ...activeSchema.schema,
        version: 4,
        title: 'PSF Request Form v4',
      },
    };
    formSchemaService.getActiveSchema.mockResolvedValueOnce(submittedSchema);
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          status: 'Draft',
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: 'Fook',
          },
        },
      ],
    });
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          request_no: 'DRAFT-1',
          form_key: 'psf-request',
          form_version: 4,
          status: 'Submitted',
          requester: 'Fook',
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

    const submitted = await service.submitRequest('request-1', {
      formVersion: 4,
    });

    expect(formSchemaService.getActiveSchema).toHaveBeenCalledWith(
      'psf-request',
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("status = 'Submitted'"),
      [
        'request-1',
        'Fook',
        'Existing Product',
        { product_type: 'Existing Product', requester_name: 'Fook' },
        4,
        submittedSchema.schema,
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
        setupOwner: null,
        setupOwnerRole: null,
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

  it('drops requester fields that are no longer present in the active schema before locking the submission snapshot', async () => {
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          status: 'Draft',
          requester_data_json: {
            legacy_field: 'remove me',
            product_type: 'Existing Product',
            requester_name: 'Fook',
          },
        },
      ],
    });
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          request_no: 'DRAFT-1',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Submitted',
          requester: 'Fook',
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

    await service.submitRequest('request-1', {
      formVersion: 3,
    });

    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("status = 'Submitted'"),
      [
        'request-1',
        'Fook',
        'Existing Product',
        { product_type: 'Existing Product', requester_name: 'Fook' },
        3,
        activeSchema.schema,
      ],
    );
  });

  it('rolls back the submitted status update when canonical value persistence fails', async () => {
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          status: 'Draft',
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: 'Fook',
          },
        },
      ],
    });
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          request_no: 'DRAFT-1',
          form_key: 'psf-request',
          form_version: 3,
          status: 'Submitted',
          requester: 'Fook',
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
      service.submitRequest('request-1', { formVersion: 3 }),
    ).rejects.toThrow('canonical persistence failed');

    expect(dbClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("status = 'Submitted'"),
      [
        'request-1',
        'Fook',
        'Existing Product',
        { product_type: 'Existing Product', requester_name: 'Fook' },
        3,
        activeSchema.schema,
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
    expect(dbClient.release).toHaveBeenCalledTimes(1);
  });

  it('rejects submission when the latest active schema has required fields the draft has not satisfied', async () => {
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          status: 'Draft',
          requester_data_json: {
            product_type: 'Existing Product',
          },
        },
      ],
    });
    dbClient.query.mockResolvedValueOnce({});

    await expect(
      service.submitRequest('request-1', { formVersion: 3 }),
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
    formSchemaService.getActiveSchema.mockResolvedValueOnce(newerActiveSchema);
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          status: 'Draft',
          requester_data_json: {
            product_type: 'Existing Product',
            requester_name: 'Fook',
          },
        },
      ],
    });
    dbClient.query.mockResolvedValueOnce({});

    await expect(
      service.submitRequest('request-1', { formVersion: 3 }),
    ).rejects.toThrow(
      'The active request schema changed before submit. Reload the draft and submit again.',
    );
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('rejects submitting a request that is already past Draft status', async () => {
    dbClient.query.mockResolvedValueOnce({});
    dbClient.query.mockResolvedValueOnce({
      rows: [{ id: 'request-1', status: 'Submitted' }],
    });
    dbClient.query.mockResolvedValueOnce({});

    await expect(
      service.submitRequest('request-1', { formVersion: 3 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dbClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('raises NotFoundException when loading an unknown request', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.getRequest('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

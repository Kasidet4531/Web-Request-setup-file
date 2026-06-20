import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FormSchemaService } from '../admin/form_schema.service';
import { DATABASE_POOL } from '../database/database.service';
import { RequestsService } from './requests.service';

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
  let pool: { query: jest.Mock };
  let formSchemaService: { getActiveSchema: jest.Mock };

  beforeEach(async () => {
    pool = { query: jest.fn() };
    formSchemaService = {
      getActiveSchema: jest.fn().mockResolvedValue(activeSchema),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: DATABASE_POOL, useValue: pool },
        { provide: FormSchemaService, useValue: formSchemaService },
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
    pool.query.mockResolvedValueOnce({
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
    pool.query.mockResolvedValueOnce({
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
    expect(pool.query).toHaveBeenLastCalledWith(
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
    expect(submitted).toMatchObject({
      id: 'request-1',
      status: 'Submitted',
      formVersion: 4,
      schemaSnapshot: submittedSchema.schema,
      submittedAt: '2026-06-18T01:05:03.000Z',
    });
  });

  it('drops requester fields that are no longer present in the active schema before locking the submission snapshot', async () => {
    pool.query.mockResolvedValueOnce({
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
    pool.query.mockResolvedValueOnce({
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

    expect(pool.query).toHaveBeenLastCalledWith(
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

  it('rejects submission when the latest active schema has required fields the draft has not satisfied', async () => {
    pool.query.mockResolvedValueOnce({
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

    await expect(
      service.submitRequest('request-1', { formVersion: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pool.query).toHaveBeenCalledTimes(1);
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
    pool.query.mockResolvedValueOnce({
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

    await expect(
      service.submitRequest('request-1', { formVersion: 3 }),
    ).rejects.toThrow(
      'The active request schema changed before submit. Reload the draft and submit again.',
    );
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('rejects submitting a request that is already past Draft status', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 'request-1', status: 'Submitted' }],
    });

    await expect(
      service.submitRequest('request-1', { formVersion: 3 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('raises NotFoundException when loading an unknown request', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.getRequest('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

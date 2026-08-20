import ExcelJS from 'exceljs';
import { PayloadTooLargeException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FormSchemaService } from '../admin/form_schema.service';
import { SearchIndexService } from '../requests/search-index.service';
import {
  ExcelExportService,
  formatRequestExportFilename,
} from './excel_export.service';

describe('ExcelExportService', () => {
  const adminActor = {
    id: 'admin-1',
    username: 'admin.demo',
    displayName: 'Admin Demo',
    role: 'admin' as const,
    setupOwnerDepartment: null,
  };
  const requesterActor = {
    id: 'requester-1',
    username: 'requester.demo',
    displayName: 'Requester Demo',
    role: 'requester' as const,
    setupOwnerDepartment: null,
  };
  let searchIndexService: {
    queryExportRequests: jest.Mock;
    extractCanonicalValues: jest.Mock;
    serializeCanonicalValue: jest.Mock;
  };
  let formSchemaService: { getActiveSchema: jest.Mock };
  let service: ExcelExportService;

  beforeEach(() => {
    const canonicalService = new SearchIndexService({
      query: jest.fn(),
    } as never);
    searchIndexService = {
      queryExportRequests: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 2000,
        offset: 0,
      }),
      extractCanonicalValues: jest.fn(
        canonicalService.extractCanonicalValues.bind(canonicalService),
      ),
      serializeCanonicalValue: jest.fn(
        canonicalService.serializeCanonicalValue.bind(canonicalService),
      ),
    };
    formSchemaService = {
      getActiveSchema: jest.fn().mockResolvedValue({
        formKey: 'psf-request',
        version: 1,
        title: 'PSF Request Form',
        description: null,
        status: 'active',
        publishedAt: null,
        schema: {
          formKey: 'psf-request',
          version: 1,
          title: 'PSF Request Form',
          sections: [],
        },
      }),
    };
    service = Reflect.construct(ExcelExportService, [
      searchIndexService,
      formSchemaService,
    ]) as ExcelExportService;
  });

  it('is resolvable by Nest with the export data and schema dependencies', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExcelExportService,
        { provide: SearchIndexService, useValue: searchIndexService },
        { provide: FormSchemaService, useValue: formSchemaService },
      ],
    }).compile();

    expect(module.get(ExcelExportService)).toBeInstanceOf(ExcelExportService);

    await module.close();
  });

  it('uses request-list status and request-date filters with the authenticated actor for a bounded synchronous export query', async () => {
    const exportService = service as unknown as {
      exportRequests: (
        filters: {
          status?: string;
          requestDateFrom?: string;
          requestDateTo?: string;
        },
        actor: typeof adminActor,
      ) => Promise<unknown>;
    };

    await exportService.exportRequests(
      {
        status: 'Submitted',
        requestDateFrom: '2026-06-01',
        requestDateTo: '2026-06-30',
      },
      adminActor,
    );

    expect(searchIndexService.queryExportRequests).toHaveBeenCalledWith(
      {
        status: 'Submitted',
        requestDateFrom: '2026-06-01',
        requestDateTo: '2026-06-30',
        limit: 2000,
        offset: 0,
      },
      adminActor,
      2000,
    );
    expect(formSchemaService.getActiveSchema).toHaveBeenCalledWith(
      'psf-request',
    );
  });

  it('writes the latest active schema in canonical-key order, including bounded fallback values and deterministic cells', async () => {
    const currentSchema = {
      formKey: 'psf-request',
      version: 9,
      title: 'PSF Request Form',
      sections: [
        {
          sectionKey: 'shared',
          title: 'Shared fields',
          visibleTo: ['requester', 'admin'],
          fields: [
            {
              fieldKey: 'title_v9',
              canonicalKey: 'title',
              label: 'Current Title',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
            {
              fieldKey: 'multi_v9',
              canonicalKey: 'multi_value',
              label: 'Multi Value',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
            {
              fieldKey: 'empty_v9',
              canonicalKey: 'empty_value',
              label: 'Empty Array',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
            {
              fieldKey: 'null_v9',
              canonicalKey: 'null_value',
              label: 'Null Value',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
            {
              fieldKey: 'number_v9',
              canonicalKey: 'number_value',
              label: 'Number Value',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
            {
              fieldKey: 'boolean_v9',
              canonicalKey: 'boolean_value',
              label: 'Boolean Value',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
            {
              fieldKey: 'unsupported_v9',
              canonicalKey: 'unsupported_value',
              label: 'Unsupported Value',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
            {
              fieldKey: 'newest_only',
              canonicalKey: 'newest_only',
              label: 'Newest Only',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
          ],
        },
        {
          sectionKey: 'admin_only',
          title: 'Admin fields',
          visibleTo: ['admin'],
          fields: [
            {
              fieldKey: 'admin_v9',
              canonicalKey: 'admin_only',
              label: 'Admin Only',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
          ],
        },
      ],
    };
    const oldSchema = {
      formKey: 'psf-request',
      version: 3,
      title: 'Old PSF Request Form',
      sections: [
        {
          sectionKey: 'legacy',
          title: 'Legacy fields',
          visibleTo: ['requester', 'admin'],
          fields: [
            {
              fieldKey: 'legacy_title',
              canonicalKey: 'title',
              label: 'Old Title',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
            {
              fieldKey: 'legacy_multi',
              canonicalKey: 'multi_value',
              label: 'Old Multi',
              type: 'text' as const,
              required: false,
              exportable: true,
            },
          ],
        },
      ],
    };
    formSchemaService.getActiveSchema.mockResolvedValueOnce({
      formKey: 'psf-request',
      version: 9,
      title: 'PSF Request Form',
      description: null,
      status: 'active',
      publishedAt: null,
      schema: currentSchema,
    });
    searchIndexService.queryExportRequests.mockResolvedValueOnce({
      items: [
        {
          requestId: 'request-1',
          requestNo: 'PSF-0001',
          status: 'Submitted',
          requester: 'Requester Demo',
          setupOwner: 'Setup Owner Demo',
          setupOwnerRole: 'GNTC',
          productType: 'New Product',
          requestDate: '2026-06-18T01:02:03.000Z',
          updatedAt: '2026-06-18T01:05:03.000Z',
          requesterData: { legacy_title: 'Do not use fallback here' },
          psfCreatedData: { psf_setup_file_name: 'admin-visible.psf' },
          schemaSnapshot: oldSchema,
          canonicalValues: {
            title: 'Persisted canonical title',
            multi_value: ['North, East', ' South '],
            empty_value: [],
            null_value: null,
            number_value: 42,
            boolean_value: false,
            unsupported_value: { unexpected: true },
            admin_only: 'Admin value',
          },
        },
        {
          requestId: 'request-2',
          requestNo: 'DRAFT-0002',
          status: 'Draft',
          requester: 'Requester Demo',
          setupOwner: null,
          setupOwnerRole: null,
          productType: 'New Product',
          requestDate: '2026-06-19T01:02:03.000Z',
          updatedAt: '2026-06-19T01:05:03.000Z',
          requesterData: {
            legacy_title: 'Fallback from old field key',
            legacy_multi: ['A, B', ' C '],
          },
          psfCreatedData: { psf_setup_file_name: 'draft-admin-visible.psf' },
          schemaSnapshot: oldSchema,
          canonicalValues: null,
        },
      ],
      total: 2,
      limit: 2000,
      offset: 0,
    });

    const result = await service.exportRequests({}, adminActor);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.content);
    const worksheet = workbook.getWorksheet('PSF Requests');

    if (!worksheet) {
      throw new Error('Expected PSF Requests worksheet');
    }

    const headers = Array.from(
      { length: worksheet.columnCount },
      (_, index) => worksheet.getRow(1).getCell(index + 1).value,
    );
    const cellFor = (rowNumber: number, header: string) => {
      const column = headers.indexOf(header) + 1;
      return worksheet.getRow(rowNumber).getCell(column).value;
    };

    expect(headers).toEqual([
      'Request No',
      'Status',
      'Setup File Owner',
      'Setup File Owner Role',
      'Request Date',
      'Updated At',
      'Current Title',
      'Multi Value',
      'Empty Array',
      'Null Value',
      'Number Value',
      'Boolean Value',
      'Unsupported Value',
      'Newest Only',
      'Admin Only',
      'First Die Ref. (X,Y)',
      'Probe & Coordinate Quadrant',
      'Wafer ID Format',
      'Mirror Die Available',
      'Prepare FPC & Physical Wafer to PSF Cabinet E2',
      'PSF Setup File Name',
      'Job File Name',
      'Template',
      'Layout',
      'Attachment Reference',
    ]);
    expect(headers.filter((header) => header === 'Current Title')).toHaveLength(
      1,
    );
    expect(headers).not.toContain('Old Title');
    expect(cellFor(2, 'Request No')).toBe('PSF-0001');
    expect(cellFor(2, 'Current Title')).toBe('Persisted canonical title');
    expect(cellFor(2, 'Multi Value')).toBe('North, East, South');
    expect(cellFor(2, 'Empty Array')).toBe('');
    expect(cellFor(2, 'Null Value')).toBe('');
    expect(cellFor(2, 'Number Value')).toBe('42');
    expect(cellFor(2, 'Boolean Value')).toBe('false');
    expect(cellFor(2, 'Unsupported Value')).toBe('');
    expect(cellFor(2, 'Newest Only')).toBe('');
    expect(cellFor(2, 'Admin Only')).toBe('Admin value');
    expect(cellFor(2, 'PSF Setup File Name')).toBe('admin-visible.psf');
    expect(cellFor(3, 'Current Title')).toBe('Fallback from old field key');
    expect(cellFor(3, 'Multi Value')).toBe('A, B, C');
    expect(cellFor(3, 'Newest Only')).toBe('');
    expect(cellFor(3, 'PSF Setup File Name')).toBe('draft-admin-visible.psf');
    expect(searchIndexService.extractCanonicalValues).toHaveBeenCalledWith(
      oldSchema,
      {
        legacy_title: 'Fallback from old field key',
        legacy_multi: ['A, B', ' C '],
      },
    );
    expect(searchIndexService.serializeCanonicalValue).toHaveBeenCalledWith([]);
    expect(searchIndexService.serializeCanonicalValue).toHaveBeenCalledWith(
      null,
    );
  });

  it('filters active-schema sections by role and masks requester PSF Created cells before PSF Created', async () => {
    formSchemaService.getActiveSchema.mockResolvedValueOnce({
      formKey: 'psf-request',
      version: 10,
      title: 'PSF Request Form',
      description: null,
      status: 'active',
      publishedAt: null,
      schema: {
        formKey: 'psf-request',
        version: 10,
        title: 'PSF Request Form',
        sections: [
          {
            sectionKey: 'requester',
            title: 'Requester fields',
            visibleTo: ['requester', 'admin'],
            fields: [
              {
                fieldKey: 'title_v10',
                canonicalKey: 'title',
                label: 'Requester Title',
                type: 'text',
                required: false,
                exportable: true,
              },
            ],
          },
          {
            sectionKey: 'requester_only',
            title: 'Requester only fields',
            visibleTo: ['requester'],
            fields: [
              {
                fieldKey: 'requester_only',
                canonicalKey: 'requester_only',
                label: 'Requester Only',
                type: 'text',
                required: false,
                exportable: true,
              },
            ],
          },
          {
            sectionKey: 'admin_only',
            title: 'Admin fields',
            visibleTo: ['admin'],
            fields: [
              {
                fieldKey: 'admin_only',
                canonicalKey: 'admin_only',
                label: 'Admin Only',
                type: 'text',
                required: false,
                exportable: true,
              },
            ],
          },
        ],
      },
    });
    searchIndexService.queryExportRequests.mockResolvedValueOnce({
      items: ['Draft', 'Submitted', 'PSF Created', 'Completed'].map(
        (status, index) => ({
          requestId: `request-${index + 1}`,
          requestNo: `PSF-${index + 1}`,
          status,
          requester: 'Requester Demo',
          setupOwner: null,
          setupOwnerRole: null,
          productType: null,
          requestDate: '2026-06-18T01:02:03.000Z',
          updatedAt: '2026-06-18T01:05:03.000Z',
          requesterData: {},
          psfCreatedData: { psf_setup_file_name: `${status}.psf` },
          schemaSnapshot: {
            formKey: 'psf-request',
            version: 10,
            title: 'PSF Request Form',
            sections: [],
          },
          canonicalValues: {
            title: status,
            requester_only: `${status} requester value`,
            admin_only: `${status} admin value`,
          },
        }),
      ),
      total: 4,
      limit: 2000,
      offset: 0,
    });

    const result = await service.exportRequests({}, requesterActor);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.content);
    const worksheet = workbook.getWorksheet('PSF Requests');

    if (!worksheet) {
      throw new Error('Expected PSF Requests worksheet');
    }

    const headers = Array.from(
      { length: worksheet.columnCount },
      (_, index) => worksheet.getRow(1).getCell(index + 1).value,
    );
    const psfSetupFileColumn = headers.indexOf('PSF Setup File Name') + 1;

    expect(headers).toContain('Requester Title');
    expect(headers).toContain('Requester Only');
    expect(headers).not.toContain('Admin Only');
    expect(worksheet.getRow(2).getCell(psfSetupFileColumn).value).toBe('');
    expect(worksheet.getRow(3).getCell(psfSetupFileColumn).value).toBe('');
    expect(worksheet.getRow(4).getCell(psfSetupFileColumn).value).toBe(
      'PSF Created.psf',
    );
    expect(worksheet.getRow(5).getCell(psfSetupFileColumn).value).toBe(
      'Completed.psf',
    );
  });

  it('rejects an export exceeding the synchronous record ceiling instead of returning a partial workbook', async () => {
    searchIndexService.queryExportRequests.mockResolvedValueOnce({
      items: [],
      total: 2001,
      limit: 2000,
      offset: 0,
    });

    await expect(service.exportRequests({}, adminActor)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });

  it('names the workbook with an Asia/Bangkok timestamp', () => {
    expect(
      formatRequestExportFilename(new Date('2026-06-18T17:05:06.000Z')),
    ).toBe('psf_requests_20260619_000506.xlsx');
  });
});

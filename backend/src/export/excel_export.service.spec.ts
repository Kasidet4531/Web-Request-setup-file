import ExcelJS from 'exceljs';
import { PayloadTooLargeException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FormSchemaService } from '../admin/form_schema.service';
import { LEGACY_PSF_CREATED_INFORMATION_SCHEMA } from '../admin/form_schema.constants';
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
      getActiveSchema: jest.fn().mockImplementation((formKey: string) =>
        Promise.resolve({
          formKey,
          version: 1,
          title:
            formKey === 'psf-request'
              ? 'PSF Request Form'
              : 'PSF Created Information',
          description: null,
          status: 'active',
          publishedAt: null,
          schema:
            formKey === 'psf-request'
              ? {
                  formKey,
                  version: 1,
                  title: 'PSF Request Form',
                  sections: [],
                }
              : LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
        }),
      ),
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
    expect(formSchemaService.getActiveSchema).toHaveBeenCalledWith(
      'psf-created-information',
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
    await workbook.xlsx.load(
      result.content as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
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

  it('exports active PSF fields first and retains historic fields by canonical identity', async () => {
    const requesterSchema = {
      formKey: 'psf-request',
      version: 10,
      title: 'PSF Request Form',
      sections: [],
    };
    const activePsfSchema = {
      formKey: 'psf-created-information',
      version: 8,
      title: 'Current PSF Created Information',
      sections: [
        {
          sectionKey: 'current',
          title: 'Current fields',
          fields: [
            {
              fieldKey: 'setup_file_name_v8',
              canonicalKey: 'psf_setup_file_name',
              label: 'Current Setup File',
              type: 'text' as const,
              required: false,
            },
            {
              fieldKey: 'new_active_field',
              canonicalKey: 'new_active_field',
              label: 'New Active Field',
              type: 'text' as const,
              required: false,
            },
          ],
        },
      ],
    };
    const historicalSchema = {
      formKey: 'psf-created-information',
      version: 3,
      title: 'Historical PSF Created Information',
      sections: [
        {
          sectionKey: 'historic',
          title: 'Historic fields',
          fields: [
            {
              fieldKey: 'old_setup_file_name',
              canonicalKey: 'psf_setup_file_name',
              label: 'Old Setup File',
              type: 'text' as const,
              required: false,
            },
            {
              fieldKey: 'deleted_field',
              canonicalKey: 'deleted_field',
              label: 'Removed From Current',
              type: 'text' as const,
              required: false,
            },
          ],
        },
      ],
    };
    formSchemaService.getActiveSchema.mockImplementation((formKey: string) => ({
      formKey,
      version: formKey === 'psf-request' ? 10 : 8,
      title:
        formKey === 'psf-request'
          ? requesterSchema.title
          : activePsfSchema.title,
      description: null,
      status: 'active',
      publishedAt: null,
      schema: formKey === 'psf-request' ? requesterSchema : activePsfSchema,
    }));
    searchIndexService.queryExportRequests.mockResolvedValueOnce({
      items: [
        {
          requestId: 'request-old',
          requestNo: 'PSF-OLD',
          status: 'PSF Created',
          requester: 'Requester Demo',
          productType: 'New Product',
          requestDate: '2026-06-18T01:02:03.000Z',
          updatedAt: '2026-06-18T01:05:03.000Z',
          requesterData: {},
          psfCreatedData: {
            old_setup_file_name: 'historical.psf',
            deleted_field: 'still exported',
          },
          psfCreatedInformationSchema: historicalSchema,
          schemaSnapshot: requesterSchema,
          canonicalValues: {},
        },
        {
          requestId: 'request-legacy',
          requestNo: 'PSF-LEGACY',
          status: 'PSF Created',
          requester: 'Requester Demo',
          productType: 'New Product',
          requestDate: '2026-06-19T01:02:03.000Z',
          updatedAt: '2026-06-19T01:05:03.000Z',
          requesterData: {},
          psfCreatedData: { psf_setup_file_name: 'legacy.psf' },
          psfCreatedInformationSchema: LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
          schemaSnapshot: requesterSchema,
          canonicalValues: {},
        },
      ],
      total: 2,
      limit: 2000,
      offset: 0,
    });

    const result = await service.exportRequests({}, adminActor);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      result.content as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const worksheet = workbook.getWorksheet('PSF Requests');
    if (!worksheet) throw new Error('Expected PSF Requests worksheet');
    const headers = Array.from(
      { length: worksheet.columnCount },
      (_, index) => worksheet.getRow(1).getCell(index + 1).value,
    );
    const psfHeaders = headers.slice(4);

    expect(psfHeaders.slice(0, 3)).toEqual([
      'Current Setup File',
      'New Active Field',
      'Removed From Current',
    ]);
    expect(
      psfHeaders.filter((header) => header === 'Current Setup File'),
    ).toHaveLength(1);
    expect(
      worksheet.getRow(2).getCell(headers.indexOf('Current Setup File') + 1)
        .value,
    ).toBe('historical.psf');
    expect(
      worksheet.getRow(2).getCell(headers.indexOf('Removed From Current') + 1)
        .value,
    ).toBe('still exported');
    expect(
      worksheet.getRow(3).getCell(headers.indexOf('Current Setup File') + 1)
        .value,
    ).toBe('legacy.psf');
    expect(formSchemaService.getActiveSchema).toHaveBeenCalledWith(
      'psf-created-information',
    );
  });

  it('exports all configured form sections while using sticky release rather than status names to reveal PSF cells', async () => {
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
          psfReleasedAt: index >= 2 ? '2026-06-18T01:05:03.000001Z' : null,
          requester: 'Requester Demo',
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
    await workbook.xlsx.load(
      result.content as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
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
    expect(headers).toContain('Admin Only');
    const additionalColumn = headers.indexOf('Admin Only') + 1;
    expect(worksheet.getRow(2).getCell(additionalColumn).value).toBe(
      'Draft admin value',
    );
    expect(worksheet.getRow(2).getCell(psfSetupFileColumn).value).toBe('');
    expect(worksheet.getRow(3).getCell(psfSetupFileColumn).value).toBe('');
    expect(worksheet.getRow(4).getCell(psfSetupFileColumn).value).toBe(
      'PSF Created.psf',
    );
    expect(worksheet.getRow(5).getCell(psfSetupFileColumn).value).toBe(
      'Completed.psf',
    );
  });

  it.each(['synchronous', 'queued'] as const)(
    'retains historical requester and PSF sections in a %s workbook while masking unreleased PSF cells',
    async (mode) => {
      const currentSchema = {
        formKey: 'psf-request',
        version: 10,
        title: 'Current',
        sections: [
          {
            sectionKey: 'current',
            title: 'Current',
            fields: [
              {
                fieldKey: 'current_title',
                canonicalKey: 'title',
                label: 'Current Title',
                type: 'text' as const,
                required: false,
                exportable: true,
              },
            ],
          },
        ],
      };
      const capturedSchema = {
        formKey: 'psf-request',
        version: 1,
        title: 'Captured',
        sections: [
          {
            sectionKey: 'one',
            title: 'One',
            fields: [
              {
                fieldKey: 'old_title',
                canonicalKey: 'title',
                label: 'Old Title',
                type: 'text' as const,
                required: false,
                exportable: true,
              },
            ],
          },
          {
            sectionKey: 'two',
            title: 'Two',
            fields: [
              {
                fieldKey: 'old_second',
                canonicalKey: 'historical_second',
                label: 'Historical second section',
                type: 'text' as const,
                required: false,
                exportable: true,
              },
            ],
          },
          {
            sectionKey: 'three',
            title: 'Three',
            fields: [
              {
                fieldKey: 'old_third',
                canonicalKey: 'historical_third',
                label: 'Historical third section',
                type: 'text' as const,
                required: false,
                exportable: true,
              },
            ],
          },
        ],
      };
      const capturedPsf = {
        formKey: 'psf-created-information',
        version: 2,
        title: 'Captured PSF',
        sections: [
          {
            sectionKey: 'psf_one',
            title: 'PSF one',
            fields: [
              {
                fieldKey: 'old_file',
                canonicalKey: 'psf_setup_file_name',
                label: 'Old file',
                type: 'text' as const,
                required: false,
              },
            ],
          },
          {
            sectionKey: 'psf_two',
            title: 'PSF two',
            fields: [
              {
                fieldKey: 'old_note',
                canonicalKey: 'historical_note',
                label: 'Historical PSF note',
                type: 'text' as const,
                required: false,
              },
            ],
          },
        ],
      };
      formSchemaService.getActiveSchema.mockImplementation((key: string) =>
        Promise.resolve({
          formKey: key,
          version: 10,
          schema:
            key === 'psf-request'
              ? currentSchema
              : LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
        }),
      );
      searchIndexService.queryExportRequests.mockResolvedValueOnce({
        items: [null, '2026-06-18T01:05:03.000001Z'].map((release, index) => ({
          requestId: `old-${index}`,
          requestNo: `OLD-${index}`,
          status: index === 0 ? 'Completed' : 'Renamed trigger moved back',
          requester: 'Requester Demo',
          productType: null,
          requestDate: '2026-06-18T01:05:03Z',
          updatedAt: '2026-06-18T01:05:03Z',
          requesterData: {
            old_title: 'Captured title',
            old_second: 'Captured two',
            old_third: 'Captured three',
          },
          canonicalValues: null,
          schemaSnapshot: capturedSchema,
          psfCreatedData: {
            old_file: 'captured.psf',
            old_note: 'Captured private note',
          },
          psfCreatedInformationSchema: capturedPsf,
          psfReleasedAt: release,
        })),
        total: 2,
        limit: 500,
        offset: 0,
      });
      const result =
        mode === 'synchronous'
          ? await service.exportRequests({}, requesterActor)
          : await service.exportAllRequests({}, requesterActor);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        result.content as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
      const sheet = workbook.getWorksheet('PSF Requests');
      if (!sheet) throw new Error('Expected worksheet');
      const headers = Array.from(
        { length: sheet.columnCount },
        (_, index) => sheet.getRow(1).getCell(index + 1).value,
      );
      expect(headers).toContain('Historical second section');
      expect(headers).toContain('Historical third section');
      expect(headers).toContain('Historical PSF note');
      expect(
        headers.filter((header) => header === 'Current Title'),
      ).toHaveLength(1);
      for (const rowNumber of [2, 3]) {
        expect(
          sheet
            .getRow(rowNumber)
            .getCell(headers.indexOf('Historical second section') + 1).value,
        ).toBe('Captured two');
        expect(
          sheet
            .getRow(rowNumber)
            .getCell(headers.indexOf('Historical third section') + 1).value,
        ).toBe('Captured three');
      }
      expect(
        sheet.getRow(2).getCell(headers.indexOf('PSF Setup File Name') + 1)
          .value,
      ).toBe('');
      expect(
        sheet.getRow(2).getCell(headers.indexOf('Historical PSF note') + 1)
          .value,
      ).toBe('');
      expect(
        sheet.getRow(3).getCell(headers.indexOf('PSF Setup File Name') + 1)
          .value,
      ).toBe('captured.psf');
      expect(
        sheet.getRow(3).getCell(headers.indexOf('Historical PSF note') + 1)
          .value,
      ).toBe('Captured private note');
      expect(searchIndexService.extractCanonicalValues).toHaveBeenCalledWith(
        capturedSchema,
        {
          old_title: 'Captured title',
          old_second: 'Captured two',
          old_third: 'Captured three',
        },
      );
    },
  );

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

  it('paginates a durable large export through the same workbook rendering and actor scope', async () => {
    const exportItem = (requestNo: string) => ({
      requestId: requestNo,
      requestNo,
      status: 'Submitted',
      requester: 'Requester Demo',
      productType: null,
      requestDate: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
      requesterData: {},
      psfCreatedData: {},
      schemaSnapshot: {
        formKey: 'psf-request',
        version: 1,
        title: 'PSF Request Form',
        sections: [],
      },
      canonicalValues: {},
    });
    searchIndexService.queryExportRequests
      .mockResolvedValueOnce({
        items: [exportItem('PSF-0001')],
        total: 2,
        limit: 500,
        offset: 0,
      })
      .mockResolvedValueOnce({
        items: [exportItem('PSF-0002')],
        total: 2,
        limit: 500,
        offset: 1,
      });

    const result = await service.exportAllRequests(
      { status: 'Submitted' },
      requesterActor,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      result.content as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const worksheet = workbook.getWorksheet('PSF Requests');

    expect(worksheet?.getRow(2).getCell(1).value).toBe('PSF-0001');
    expect(worksheet?.getRow(3).getCell(1).value).toBe('PSF-0002');
    expect(searchIndexService.queryExportRequests).toHaveBeenNthCalledWith(
      1,
      { status: 'Submitted', limit: 500, offset: 0 },
      requesterActor,
      500,
    );
    expect(searchIndexService.queryExportRequests).toHaveBeenNthCalledWith(
      2,
      { status: 'Submitted', limit: 500, offset: 1 },
      requesterActor,
      500,
    );
  });

  it('names the workbook with an Asia/Bangkok timestamp', () => {
    expect(
      formatRequestExportFilename(new Date('2026-06-18T17:05:06.000Z')),
    ).toBe('psf_requests_20260619_000506.xlsx');
  });
});

import ExcelJS from 'exceljs';
import type { FormSchemaService } from '../admin/form_schema.service';
import {
  LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
  type FormSchemaField,
  type FormSchemaJson,
} from '../admin/form_schema.constants';
import type { UserRole } from '../auth/session.types';
import type {
  RequestExportItem,
  SearchIndexService,
} from '../requests/search-index.service';
import { ExcelExportService } from './excel_export.service';

// The exported workbook is the seam: these tests read the file a person
// downloads, whatever builds it.
function requesterForm(
  version: number,
  fields: Array<Partial<FormSchemaField> & { fieldKey: string }>,
): FormSchemaJson {
  return {
    formKey: 'psf-request',
    version,
    title: 'PSF Request Form',
    sections: [
      {
        sectionKey: 'requester',
        title: 'Requester',
        fields: fields.map((field) => ({
          canonicalKey: field.fieldKey,
          label: field.fieldKey,
          type: 'text',
          required: false,
          ...field,
        })),
      },
    ],
  };
}

function request(
  requestNo: string,
  schemaSnapshot: FormSchemaJson,
  requesterData: Record<string, unknown>,
  extra: Partial<RequestExportItem> = {},
): RequestExportItem {
  return {
    requestId: requestNo,
    requestNo,
    status: '10% -- Test Engineer Data Entry',
    requester: 'Requester Demo',
    productType: null,
    requestDate: '2026-10-01T01:02:03.000Z',
    updatedAt: '2026-10-02T01:02:03.000Z',
    requesterData,
    psfCreatedData: {},
    psfReleasedAt: null,
    schemaSnapshot,
    psfCreatedInformationSchema: LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
    ...extra,
  };
}

async function exportSheet(
  activeRequester: FormSchemaJson,
  items: RequestExportItem[],
  role: UserRole = 'admin',
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const search = {
    withExportSnapshot: (
      operation: (query: unknown, runner: unknown) => Promise<unknown>,
    ) => operation(search, undefined),
    queryExportRequests: ({
      limit,
      offset,
    }: {
      limit: number;
      offset: number;
    }) =>
      Promise.resolve({
        items: items.slice(offset, offset + limit),
        total: items.length,
        limit,
        offset,
      }),
  } as unknown as SearchIndexService;
  const schemas = {
    getActiveSchema: (key: string) =>
      Promise.resolve({
        schema:
          key === 'psf-request'
            ? activeRequester
            : LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
      }),
  } as unknown as FormSchemaService;
  const result = await new ExcelExportService(search, schemas).exportRequests(
    {},
    { id: `${role}-1`, role },
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    result.content as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.getWorksheet('PSF Requests');
  if (!sheet) throw new Error('Missing export worksheet');
  const headers = Array.from(
    { length: sheet.columnCount },
    (_, column) => sheet.getCell(1, column + 1).value as string,
  );
  const rows = Array.from({ length: sheet.rowCount - 1 }, (_, row) =>
    Object.fromEntries(
      headers.map((header, column) => [
        header,
        sheet.getCell(row + 2, column + 1).value,
      ]),
    ),
  );
  return { headers, rows };
}

describe('Excel export columns', () => {
  it('exports a requester field an administrator added without the exportable flag', async () => {
    const form = requesterForm(2, [
      { fieldKey: 'title', label: 'Product_Description', exportable: true },
      { fieldKey: 'field_1', label: 'Added By Admin' },
    ]);

    const { headers, rows } = await exportSheet(form, [
      request('PSF-000001', form, { title: 'Chip A', field_1: 'Added value' }),
    ]);

    expect(headers).toContain('Added By Admin');
    expect(rows[0]['Added By Admin']).toBe('Added value');
  });

  it('leaves Field Help Text and choice layouts out of the file, which shows the stored answers as before', async () => {
    const fields = [
      { fieldKey: 'title', label: 'Target 12NC Desc' },
      {
        fieldKey: 'product_type',
        label: 'Request To',
        type: 'radio' as const,
        options: ['Create new PSF', 'Revise from old PSF'],
      },
    ];
    const plain = requesterForm(2, fields);
    const guided = requesterForm(3, [
      { ...fields[0], helpText: 'Put NA if not Motion Sensor' },
      { ...fields[1], helpText: 'Pick one', optionLayout: 'vertical' },
    ]);
    const answers = { title: 'Chip A', product_type: 'Create new PSF' };

    const before = await exportSheet(plain, [
      request('PSF-000001', plain, answers),
    ]);
    const after = await exportSheet(guided, [
      request('PSF-000001', guided, answers),
    ]);

    expect(after).toEqual(before);
    expect(after.rows[0]).toMatchObject({
      'Target 12NC Desc': 'Chip A',
      'Request To': 'Create new PSF',
    });
  });

  it('shows NA in every cell without a value, including fields missing from the request form version', async () => {
    const oldForm = requesterForm(1, [
      { fieldKey: 'title' },
      { fieldKey: 'fpc', label: 'FPC' },
    ]);
    const form = requesterForm(2, [
      { fieldKey: 'title' },
      { fieldKey: 'bump_height', label: 'Bump Height (um)', type: 'number' },
      { fieldKey: 'pad_type', label: 'Pad type' },
      { fieldKey: 'remark', label: 'Remark' },
    ]);

    const { rows } = await exportSheet(form, [
      request('PSF-000002', form, {
        title: 'Chip B',
        bump_height: '',
        pad_type: [],
        remark: null,
      }),
      request('PSF-000001', oldForm, { title: 'Chip A', fpc: '   ' }),
    ]);

    expect(rows[0]).toMatchObject({
      title: 'Chip B',
      'Bump Height (um)': 'NA',
      'Pad type': 'NA',
      Remark: 'NA',
      FPC: 'NA',
      'PSF Setup File Name': 'NA',
    });
    expect(rows[1]).toMatchObject({
      title: 'Chip A',
      'Bump Height (um)': 'NA',
      'Pad type': 'NA',
      Remark: 'NA',
      FPC: 'NA',
    });
  });

  it('always exports Modified By right after Updated At, as the system recorded it', async () => {
    const form = requesterForm(1, [{ fieldKey: 'title' }]);

    const { headers, rows } = await exportSheet(form, [
      request('PSF-000002', form, { title: 'B', modified_by: 'Administrator' }),
      request('PSF-000001', form, { title: 'A' }),
    ]);

    expect(headers.slice(0, 6)).toEqual([
      'Request No',
      'Status',
      'Request Date',
      'Updated At',
      'Modified By',
      'title',
    ]);
    expect(rows.map((row) => row['Modified By'])).toEqual([
      'Administrator',
      'NA',
    ]);
  });

  it('shows Request Date and Updated At in Bangkok time, year first', async () => {
    const form = requesterForm(1, [{ fieldKey: 'title' }]);

    const { rows } = await exportSheet(form, [
      request(
        'PSF-000001',
        form,
        { title: 'A' },
        {
          requestDate: '2025-09-01T03:42:29.000Z',
          updatedAt: '2025-09-01T20:05:00.000Z',
        },
      ),
    ]);

    expect([rows[0]['Request Date'], rows[0]['Updated At']]).toEqual([
      '2025-09-01 10:42:29',
      '2025-09-02 03:05:00',
    ]);
  });

  it('shows Modified By once for requests on form versions with and without the field', async () => {
    const withField = requesterForm(1, [
      { fieldKey: 'product_type', label: 'Request To' },
      { fieldKey: 'modified_by', label: 'Modified By' },
      { fieldKey: 'title' },
    ]);
    const withoutField = requesterForm(2, [
      { fieldKey: 'product_type', label: 'Request To' },
      { fieldKey: 'title' },
    ]);

    const { headers, rows } = await exportSheet(withoutField, [
      request('PSF-000002', withoutField, {
        title: 'New form',
        modified_by: 'Owner A',
      }),
      request('PSF-000001', withField, {
        title: 'Old form',
        modified_by: 'Imported Editor',
      }),
    ]);

    expect(headers.slice(4)).toEqual([
      'Modified By',
      'Request To',
      'title',
      ...headers.slice(7),
    ]);
    expect(headers.filter((header) => header === 'Modified By')).toHaveLength(
      1,
    );
    expect(rows.map((row) => row['Modified By'])).toEqual([
      'Owner A',
      'Imported Editor',
    ]);
  });

  it('shows a Requester every PSF Created Information value, released or not', async () => {
    const form = requesterForm(1, [{ fieldKey: 'title' }]);
    const psf = (name: string) => ({
      psfCreatedData: {
        psf_setup_file_name: name,
        job_file_name: `${name}.job`,
      },
    });

    const { rows } = await exportSheet(
      form,
      [
        request(
          'PSF-000002',
          form,
          { title: 'B' },
          {
            ...psf('UNRELEASED'),
            psfReleasedAt: null,
          },
        ),
        request(
          'PSF-000001',
          form,
          { title: 'A' },
          {
            ...psf('RELEASED'),
            status: '100% -- Completed',
            psfReleasedAt: '2026-10-03T01:02:03.000Z',
          },
        ),
      ],
      'requester',
    );

    expect(
      rows.map((row) => [row['PSF Setup File Name'], row['Job File Name']]),
    ).toEqual([
      ['UNRELEASED', 'UNRELEASED.job'],
      ['RELEASED', 'RELEASED.job'],
    ]);
  });
});

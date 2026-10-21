import ExcelJS from 'exceljs';
import type { FormSchemaService } from '../admin/form_schema.service';
import type { UserRole } from '../auth/session.types';
import {
  SearchIndexService,
  type RequestExportItem,
} from '../requests/search-index.service';
import { ExcelExportService } from './excel_export.service';
import {
  activeCreated,
  activeRequester,
  columns,
  createdColumns,
  headers,
  historicalColumns,
  modifiedByColumn,
  requesterFieldColumns,
  source,
  type Column,
} from '../../test/fixtures/export-scale';

const roles: UserRole[] = ['admin', 'setup_owner', 'requester'];
const modes = ['synchronous', 'queued'] as const;

// Distinct values expose misplaced columns; select values deliberately disagree
// with configured choices. Rejecting unknown choices, dropping captured fields,
// or extracting old data with the active schema must fail these workbook checks.
function storedValue(column: Column, i: number): string | number {
  if (column.type === 'number') return i * 100 + columns.indexOf(column);
  if (column.type === 'select')
    return [
      6,
      '6',
      200,
      '200',
      '0006',
      `LEGACY:${column.key}:${i}`,
      'นอกตัวเลือก 😀 & <legacy>',
    ][i % 7];
  return `VALUE:${column.key}:${i}`;
}

function item(i: number): RequestExportItem {
  const row = source(i);
  const requesterData: Record<string, unknown> = {};
  const psfCreatedData: Record<string, unknown> = {};
  for (const field of row.requesterSchema.sections.flatMap((s) => s.fields)) {
    const column = columns.find((c) => c.key === field.canonicalKey)!;
    const value = storedValue(column, i);
    requesterData[field.fieldKey] = value;
  }
  for (const field of row.createdSchema.sections.flatMap((s) => s.fields)) {
    const column = columns.find((c) => c.key === field.canonicalKey)!;
    psfCreatedData[field.fieldKey] = storedValue(column, i);
  }
  return {
    requestId: row.id,
    requestNo: row.requestNo,
    status: row.status,
    requester: 'Synthetic requester',
    productType: null,
    requestDate: row.createdAt,
    updatedAt: row.updatedAt,
    requesterData,
    psfCreatedData,
    schemaSnapshot: row.requesterSchema,
    psfCreatedInformationSchema: row.createdSchema,
    psfReleasedAt: row.releasedAt,
  };
}

// Version membership is specified independently from source/schema constructors.
// Every role gets the same cells (ADR 0018); a cell without a value shows NA.
function expected(i: number): Array<string | number> {
  const row = source(i);
  return [
    row.requestNo,
    row.status,
    row.createdAt,
    row.updatedAt,
    exportedValue(modifiedByColumn, i),
    ...requesterFieldColumns.map((c) =>
      (c.name === 'Request For' && i % 4 === 0) ||
      (c.name === 'Trench Thickness (um)' && [0, 2].includes(i % 4))
        ? ''
        : exportedValue(c, i),
    ),
    ...historicalColumns.map((c, index) =>
      i % 4 === 0 || (i % 4 === 2 && index < 3) ? exportedValue(c, i) : '',
    ),
    ...createdColumns.map((c) =>
      (c.name === 'Physical Wafer' && i % 3 === 0) ||
      (c.name === 'Wafer ID format' && i % 3 !== 2)
        ? ''
        : exportedValue(c, i),
    ),
  ].map((cell) => (cell === '' ? 'NA' : cell));
}

function exportedValue(column: Column, i: number): string | number {
  const value = storedValue(column, i);
  return column.type === 'number' ? value : String(value);
}

describe('export stored values across choices and form versions', () => {
  it.each(modes.flatMap((mode) => roles.map((role) => ({ mode, role }))))(
    '$mode/$role preserves every cell across three versions with unequal columns and unlisted choices',
    async ({ mode, role }) => {
      // 60 rows cover every requester/PSF version pair, release state and the
      // persisted-canonical/snapshot fallback paths. Seven choice samples use a
      // coprime cycle, so 420 rows cover every sample in each combination.
      const count = 420;
      const items = Array.from({ length: count }, (_, n) => item(count - n));
      const canonicalService = new SearchIndexService({
        query: jest.fn(),
      } as never);
      const search = {
        withExportSnapshot: (
          operation: (query: SearchIndexService) => Promise<unknown>,
        ) => operation(search),
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
        extractCanonicalValues:
          canonicalService.extractCanonicalValues.bind(canonicalService),
        serializeCanonicalValue:
          canonicalService.serializeCanonicalValue.bind(canonicalService),
      } as unknown as SearchIndexService;
      const schemas = {
        getActiveSchema: (key: string) =>
          Promise.resolve({
            schema: key === 'psf-request' ? activeRequester : activeCreated,
          }),
      } as FormSchemaService;
      const exporter = new ExcelExportService(search, schemas);
      const actor = { id: 'synthetic-actor', role };
      const result =
        mode === 'synchronous'
          ? await exporter.exportRequests({}, actor)
          : await exporter.exportAllRequests({}, actor);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        result.content as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
      const sheet = workbook.getWorksheet('PSF Requests');
      if (!sheet) throw new Error('Missing export worksheet');
      expect(sheet.rowCount).toBe(count + 1);
      expect(
        Array.from(
          { length: sheet.columnCount },
          (_, c) => sheet.getCell(1, c + 1).value,
        ),
      ).toEqual(headers);
      for (let i = count; i > 0; i--) {
        const actual = Array.from(
          { length: headers.length },
          (_, c) => sheet.getCell(count - i + 2, c + 1).value ?? '',
        );
        expect({
          requestNo: items[count - i].requestNo,
          cells: actual,
        }).toEqual({
          requestNo: items[count - i].requestNo,
          cells: expected(i),
        });
      }
    },
    30000,
  );
});

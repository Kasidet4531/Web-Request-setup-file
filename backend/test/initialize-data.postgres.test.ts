import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, it } from 'node:test';
import ExcelJS from 'exceljs';
import type { Pool, PoolClient } from 'pg';
import { initialize } from '../scripts/initialize-data';
import { admin, lifecycleFixture } from './draft-lifecycle.fixture';

const REQUEST_TO = [
  'Create new PSF (Require PCSF , E142 or .DPL)',
  'Revise from old PSF (Require reference PSF , PCSF , E142 or DPL)',
  'Product Transfer (Require PSF , PCSF , .LAY)',
];
const STATUSES = [
  'Draft',
  '10% -- Test Engineer Data Entry',
  '100% -- Completed',
  '0% -- Rejected (Cancel Request)',
];

// Fake values only: the real workbook is secret and never used by tests.
async function fakeWorkbook(extraRows: unknown[][] = []): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const mapping = workbook.addWorksheet('Column_Mapping');
  mapping.addRow([
    'For',
    'Column Name',
    'Column Name change',
    'Type',
    'Dropdown Option',
  ]);
  mapping.addRow(['Requester', 'Request To', '', 'Choice', REQUEST_TO[0]]);
  mapping.addRow(['', '', '', '', REQUEST_TO[1]]);
  mapping.addRow(['', '', '', '', REQUEST_TO[2]]);
  mapping.addRow([
    'Requester',
    'Title',
    'Product_Description',
    'Single line of text',
  ]);
  mapping.addRow(['Requester', 'Diameter (Inch)', '', 'Choice', '8']);
  mapping.addRow(['', '', '', '', '12']);
  mapping.addRow(['Requester', 'Tester Type', '', 'Choice', 'J750']);
  for (const option of ['LTX_C', 'MCT', 'UFLEX'])
    mapping.addRow(['', '', '', '', option]);
  mapping.addRow(['Creater', 'Job File Name', '', 'Single line of text']);
  mapping.addRow(['Creater', 'PSF Setup File Name', '', 'Single line of text']);
  mapping.addRow(['Creater', 'Touch down per wafer', '', 'Number']);
  mapping.addRow(['', 'Due Date', '', 'Date and Time']);
  mapping.addRow(['', 'Created By', '', 'Person or Group']);
  mapping.addRow(['', 'Workflow Name', '', 'Single line of text']);
  mapping.addRow(['', 'Status', '', 'Choice', STATUSES[0]]);
  for (const status of STATUSES.slice(1))
    mapping.addRow(['', '', '', '', status]);

  const data = workbook.addWorksheet('Data');
  data.addRow([
    'ID',
    'Content Type',
    'Created',
    'Modified',
    'Status',
    'Request  To',
    'Title',
    'Diameter (Inch)',
    'Tester Type',
    'Job File Name',
    'PSF Setup File Name',
    'Touch down per wafer',
    'Due Date',
    'Created By',
    'Modified By',
  ]);
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  data.addRow([
    100,
    'Item',
    new Date('2024-03-04T05:06:07Z'),
    new Date('2024-03-09T10:11:12Z'),
    '100% -- Completed',
    REQUEST_TO[0],
    '  Chip A ',
    'NA ',
    'MCT',
    'job1',
    'PSF_CHIP_A_01',
    12.5,
    day('2026-08-07'),
    'Somebody',
    'Editor',
  ]);
  data.addRow([
    101,
    'Item',
    new Date('2024-04-01T00:00:00Z'),
    new Date('2024-04-02T00:00:00Z'),
    '30% -- Compare Old and New layout',
    REQUEST_TO[2],
    'Chip B',
    12,
    'ltx_c',
    '',
    '',
    'abc',
    null,
    null,
    null,
  ]);
  data.addRow([
    102,
    'Item',
    new Date('2024-05-01T00:00:00Z'),
    new Date('2024-05-02T00:00:00Z'),
    'Draft',
    REQUEST_TO[1],
    'Chip C',
    '',
    '',
    '',
    '',
    '',
    null,
    null,
    null,
  ]);
  for (const row of extraRows) data.addRow(row);

  const file = join(
    await mkdtemp(join(tmpdir(), 'initialize-data-')),
    'fake.xlsx',
  );
  await workbook.xlsx.writeFile(file);
  return file;
}

interface RequestRow {
  id: string;
  request_no: string;
  requester: string;
  requester_user_id: string | null;
  product_type: string;
  requester_data_json: Record<string, string>;
  psf_created_data_json: Record<string, string>;
  psf_released_at: unknown;
  completed_at: unknown;
}

let db: PGlite;
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;
before(
  async () => {
    db = new PGlite();
    const query = (sql: string, args?: unknown[]) => db.query(sql, args);
    fixture = await lifecycleFixture({
      query,
      connect: () => Promise.resolve({ query, release() {} }),
    } as unknown as Pool);
  },
  { timeout: 30000 },
);
after(async () => db.close());

void it('clears old data, loads forms, catalog and requests, and keeps accounts', async () => {
  await fixture.draft();
  const report = await initialize(
    {
      query: (sql: string, args?: unknown[]) => db.query(sql, args),
    } as unknown as PoolClient,
    await fakeWorkbook(),
  );

  assert.equal(report.imported, 2);
  assert.equal(report.skippedDraft, 1);
  assert.deepEqual(report.outsideCatalog, {
    '30% -- Compare Old and New layout': 1,
  });
  assert.deepEqual(report.mismatches, {
    'Diameter (Inch)': { rows: 1, distinct: 1 },
    'Touch down per wafer': { rows: 1, distinct: 1 },
  });
  assert.deepEqual(report.missingColumns, ['Workflow Name']);

  const rows = (
    await db.query<RequestRow>('SELECT * FROM psf_requests ORDER BY request_no')
  ).rows;
  assert.deepEqual(
    rows.map((r) => r.request_no),
    ['PSF-000100', 'PSF-000101'],
  );
  const [done, other] = rows;
  assert.equal(done.requester, 'Somebody');
  assert.equal(done.requester_user_id, null);
  assert.equal(done.product_type, REQUEST_TO[0]);
  assert.equal(done.requester_data_json.title, 'Chip A');
  assert.equal(done.requester_data_json.requester_name, 'Somebody');
  assert.equal(done.requester_data_json.modified_by, 'Editor');
  assert.equal(done.requester_data_json.diameter_inch, 'NA');
  assert.equal(done.requester_data_json.due_date, '2026-08-07');
  assert.equal('created_by' in done.requester_data_json, false);
  assert.equal(done.requester_data_json.workflow_name, '');
  assert.equal(done.psf_created_data_json.touch_down_per_wafer, '12.5');
  assert.equal(done.psf_created_data_json.psf_setup_file_name, 'PSF_CHIP_A_01');
  assert.ok(done.psf_released_at && done.completed_at);
  assert.equal(other.requester, 'NA');
  assert.equal(other.requester_data_json.requester_name, 'NA');
  assert.equal(other.requester_data_json.modified_by, 'NA');
  assert.equal(other.psf_released_at, null);
  assert.equal(other.requester_data_json.tester_type, 'LTX_C');
  assert.equal(other.requester_data_json.diameter_inch, '12');
  assert.equal(other.psf_created_data_json.touch_down_per_wafer, 'abc');

  const forms = (
    await db.query<{ form_key: string; version: number; status: string }>(
      'SELECT form_key, version, status FROM form_definitions ORDER BY form_key, version',
    )
  ).rows;
  assert.deepEqual(forms, [
    { form_key: 'psf-created-information', version: 1, status: 'active' },
    { form_key: 'psf-request', version: 1, status: 'published' },
    { form_key: 'psf-request', version: 2, status: 'active' },
  ]);
  const v2FieldKeys = (
    await db.query<{ k: string }>(
      `SELECT f->>'fieldKey' AS k FROM form_definitions, jsonb_array_elements(schema_json->'sections'->0->'fields') f
     WHERE form_key = 'psf-request' AND version = 2`,
    )
  ).rows.map((r) => r.k);
  assert.ok(v2FieldKeys.includes('requester_name'));
  assert.ok(v2FieldKeys.includes('modified_by'));
  assert.ok(v2FieldKeys.includes('due_date'));
  assert.equal(v2FieldKeys.includes('workflow_name'), false);

  const types = (
    await db.query<{ t: string }>(
      `SELECT f->>'type' AS t FROM form_definitions, jsonb_array_elements(schema_json->'sections'->0->'fields') f
     WHERE form_key = 'psf-created-information' AND f->>'fieldKey' = 'touch_down_per_wafer'`,
    )
  ).rows;
  assert.deepEqual(types, [{ t: 'number' }]);

  const config = await fixture.workflow.getConfiguration();
  assert.deepEqual(config.statuses, STATUSES.slice(1));
  assert.deepEqual(
    config.entries.filter((e) => e.psfAccessTrigger).map((e) => e.name),
    ['100% -- Completed'],
  );

  assert.equal(
    (await db.query('SELECT 1 FROM canonical_submission_values')).rows.length >
      0,
    true,
  );
  const searchRows = (
    await db.query<{
      request_no: string;
      requester: string;
      psf_setup_file_name: string | null;
    }>(
      'SELECT request_no, requester, psf_setup_file_name FROM psf_request_search_index ORDER BY request_no',
    )
  ).rows;
  assert.deepEqual(searchRows, [
    {
      request_no: 'PSF-000100',
      requester: 'Somebody',
      psf_setup_file_name: 'PSF_CHIP_A_01',
    },
    {
      request_no: 'PSF-000101',
      requester: 'NA',
      psf_setup_file_name: null,
    },
  ]);
  assert.equal((await db.query('SELECT 1 FROM app_users')).rows.length, 4);

  const detail = await fixture.service.getRequest(done.id, admin);
  assert.equal(detail.requestNo, 'PSF-000100');

  const updatedRequester = await fixture.service.updateDraftRequesterData(
    done.id,
    {
      formVersion: detail.formVersion,
      expectedUpdatedAt: detail.updatedAt,
      requesterData: {
        ...detail.requesterData,
        title: 'Chip A Updated',
      },
    },
    admin,
  );
  assert.equal(updatedRequester.requesterData.title, 'Chip A Updated');
  assert.equal(updatedRequester.requesterData.diameter_inch, 'NA');
  assert.equal(updatedRequester.requesterData.requester_name, 'Somebody');
  assert.equal(updatedRequester.requesterData.modified_by, admin.displayName);

  const updatedCreated = await fixture.service.updatePsfCreatedData(done.id, {
    actor: admin,
    expectedUpdatedAt: updatedRequester.updatedAt,
    psfCreatedData: {
      ...updatedRequester.psfCreatedData,
      psf_setup_file_name: 'PSF_CHIP_A_02',
    },
  });
  assert.equal(
    updatedCreated.psfCreatedData.psf_setup_file_name,
    'PSF_CHIP_A_02',
  );
  const updatedSearchRow = (
    await db.query<{ psf_setup_file_name: string | null }>(
      'SELECT psf_setup_file_name FROM psf_request_search_index WHERE request_id = $1',
      [done.id],
    )
  ).rows[0];
  assert.equal(updatedSearchRow.psf_setup_file_name, 'PSF_CHIP_A_02');
});

void it('lenient mode blanks non-fitting values and skips unusable rows', async () => {
  const when = new Date('2024-06-01T00:00:00Z');
  const row = (id: unknown, status: unknown, created: unknown = when) => [
    id,
    'Item',
    created,
    when,
    status,
    REQUEST_TO[0],
    'Chip',
    '',
    '',
    '',
    '',
    '',
    null,
    null,
    null,
  ];
  const file = await fakeWorkbook([
    row('abc', '100% -- Completed'),
    row(103, ''),
    row(104, '100% -- Completed', 'yesterday'),
    row(100, '100% -- Completed'),
  ]);
  const db2 = {
    query: (sql: string, args?: unknown[]) => db.query(sql, args),
  } as unknown as PoolClient;

  await assert.rejects(
    initialize(db2, file),
    /Data row 5: ID is not an integer/,
  );

  const report = await initialize(db2, file, { lenient: true });
  assert.equal(report.imported, 2);
  assert.deepEqual(report.skippedRows, {
    'ID is not an integer': 1,
    'Status is blank': 1,
    'Created or Modified is not a date': 1,
    'ID is duplicated': 1,
  });
  assert.deepEqual(report.mismatches, {
    'Diameter (Inch)': { rows: 1, distinct: 1 },
    'Touch down per wafer': { rows: 1, distinct: 1 },
  });
  const { rows } = await db.query<RequestRow>(
    'SELECT * FROM psf_requests ORDER BY request_no',
  );
  assert.equal(rows[0].requester_data_json.diameter_inch, '');
  assert.equal(rows[1].psf_created_data_json.touch_down_per_wafer, '');
});

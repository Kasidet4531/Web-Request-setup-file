import { PGlite } from '@electric-sql/pglite';
import ExcelJS from 'exceljs';
import assert from 'node:assert/strict';
import { after, before, beforeEach, it } from 'node:test';
import type { Pool } from 'pg';
import type { AuthenticatedUserProfile } from '../src/auth/session.types';
import { ExcelExportService } from '../src/export/excel_export.service';
import {
  admin,
  lifecycleFixture,
  ownerA,
  requester,
  submittedStatus,
} from './draft-lifecycle.fixture';

// Saves go through the real RequestsService and the export reads the same
// database. The fixture's forms carry no exportable flags, like fields an
// administrator adds in the Form Builder.
let db: PGlite;
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;
let exporter: ExcelExportService;
// Every value the database returns while recording.
let received: unknown[] | undefined;

before(
  async () => {
    db = new PGlite();
    const query = async (sql: string, args?: unknown[]) => {
      const result = await db.query<Record<string, unknown>>(sql, args);
      if (received)
        for (const row of result.rows) received.push(...Object.values(row));
      return result;
    };
    fixture = await lifecycleFixture({
      query,
      connect: () => Promise.resolve({ query, release() {} }),
    } as unknown as Pool);
    exporter = new ExcelExportService(fixture.index, fixture.forms);
  },
  { timeout: 30000 },
);
after(async () => {
  await exporter.onModuleDestroy();
  await db.close();
});
beforeEach(() => fixture.reset());

async function exportSheet(
  actor: AuthenticatedUserProfile,
  filters: { status?: string } = {},
) {
  const { content } = await exporter.exportRequests(filters, actor);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    content as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.getWorksheet('PSF Requests');
  assert.ok(sheet);
  const cells = (row: number) =>
    Array.from(
      { length: sheet.columnCount },
      (_, column) => sheet.getCell(row, column + 1).value as string | number,
    );
  const headers = cells(1) as string[];
  return {
    headers,
    rows: Array.from({ length: sheet.rowCount - 1 }, (_, row) =>
      cells(row + 2),
    ),
  };
}

// How many captured form snapshots came back from the database, however
// they were encoded.
function formSnapshotsIn(values: unknown[]): number {
  return values.filter((value) => {
    const parsed: unknown =
      typeof value === 'string' && value.startsWith('{')
        ? JSON.parse(value)
        : value;
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'formKey' in parsed &&
      'sections' in parsed
    );
  }).length;
}

async function exportRows(actor: AuthenticatedUserProfile) {
  const { headers, rows } = await exportSheet(actor);
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, column) => [header, row[column]])),
  );
}

void it('exports fields without an exportable flag and the latest Modified By after each kind of save', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  const edited = await fixture.service.updateDraftRequesterData(
    submitted.id,
    {
      formVersion: submitted.formVersion,
      expectedUpdatedAt: submitted.updatedAt,
      requesterData: { ...submitted.requesterData, title: 'Edited title' },
    },
    requester,
  );
  assert.deepEqual(
    (await exportRows(admin)).map((row) => [row.Title, row['Modified By']]),
    [['Edited title', requester.displayName]],
  );

  const { entries } = await fixture.workflow.getConfiguration();
  const next = entries.find(
    (entry) => entry.kind === 'open' && entry.name !== edited.status,
  );
  assert.ok(next);
  const moved = await fixture.service.updateRequestStatus(submitted.id, {
    actor: admin,
    status: next.name,
    expectedUpdatedAt: edited.updatedAt,
  });
  assert.equal((await exportRows(admin))[0]['Modified By'], admin.displayName);

  await fixture.service.updatePsfCreatedData(submitted.id, {
    actor: ownerA,
    expectedUpdatedAt: moved.updatedAt,
    psfCreatedData: { file: 'SETUP_A.psf' },
  });
  const [row] = await exportRows(admin);
  assert.equal(row['Modified By'], ownerA.displayName);
  assert.equal(row.File, 'SETUP_A.psf');
});

void it('previews the file: its columns, its first 10 rows and its total, for the same filters', async () => {
  const { entries } = await fixture.workflow.getConfiguration();
  const other = entries.find(
    (entry) => entry.kind === 'open' && entry.name !== submittedStatus,
  );
  assert.ok(other);
  for (let n = 1; n <= 13; n++) {
    const submitted = await fixture.submit(await fixture.draft());
    if (n % 4 === 0)
      await fixture.service.updatePsfCreatedData(submitted.id, {
        actor: ownerA,
        expectedUpdatedAt: submitted.updatedAt,
        psfCreatedData: { file: `SETUP_${n}.psf` },
      });
  }
  // A request on an older form version adds its own column to the file.
  await db.query(
    `UPDATE psf_requests SET schema_snapshot_json = jsonb_set(
       schema_snapshot_json, '{sections,0,fields}',
       schema_snapshot_json #> '{sections,0,fields}' ||
       '[{"fieldKey":"fpc","canonicalKey":"fpc","label":"FPC","type":"text","required":false}]'::jsonb)
     WHERE request_no = (SELECT MIN(request_no) FROM psf_requests)`,
  );

  for (const actor of [requester, admin]) {
    const file = await exportSheet(actor);
    const preview = await exporter.previewRequests({});
    assert.deepEqual(preview.headers, file.headers);
    assert.ok(preview.headers.includes('FPC'));
    assert.deepEqual(preview.rows, file.rows.slice(0, 10));
    assert.equal(preview.total, 13);
  }

  const none = await exporter.previewRequests({ status: other.name });
  assert.equal(none.total, 0);
  assert.deepEqual(none.rows, []);
  assert.deepEqual(
    none.headers,
    (await exportSheet(admin, { status: other.name })).headers,
  );
});

void it('reads each distinct captured form once, telling apart forms of the same Form Version with different content', async () => {
  for (let n = 1; n <= 12; n++) await fixture.submit(await fixture.draft());
  // The oldest request, exported last, captured a requester form and a PSF
  // form of the same Form Versions as the others, each with one more field.
  await db.query(
    `UPDATE psf_requests SET
       schema_snapshot_json = jsonb_set(
         schema_snapshot_json, '{sections,0,fields}',
         schema_snapshot_json #> '{sections,0,fields}' ||
         '[{"fieldKey":"fpc","canonicalKey":"fpc","label":"FPC","type":"text","required":false}]'::jsonb),
       requester_data_json = requester_data_json || '{"fpc":"FPC-1"}'::jsonb,
       psf_created_schema_snapshot_json = jsonb_set(
         psf_created_schema_snapshot_json, '{sections,0,fields}',
         psf_created_schema_snapshot_json #> '{sections,0,fields}' ||
         '[{"fieldKey":"probe_card","canonicalKey":"probe_card","label":"Probe Card","type":"text","required":false}]'::jsonb),
       psf_created_data_json = psf_created_data_json || '{"probe_card":"PC-1"}'::jsonb
     WHERE request_no = (SELECT MIN(request_no) FROM psf_requests)`,
  );
  const versions = await db.query<{ versions: number; contents: number }>(
    `SELECT COUNT(DISTINCT schema_snapshot_json->>'version')::int AS versions,
       COUNT(DISTINCT schema_snapshot_json)::int AS contents
     FROM psf_requests
     UNION ALL
     SELECT COUNT(DISTINCT psf_created_schema_snapshot_json->>'version')::int,
       COUNT(DISTINCT psf_created_schema_snapshot_json)::int
     FROM psf_requests`,
  );
  assert.deepEqual(versions.rows, [
    { versions: 1, contents: 2 },
    { versions: 1, contents: 2 },
  ]);
  // Two requester forms, two PSF forms, and the two active forms.
  const forms = 6;

  received = [];
  const file = await exportSheet(admin);
  const exported = formSnapshotsIn(received);
  received = [];
  const preview = await exporter.previewRequests({});
  const previewed = formSnapshotsIn(received);
  received = undefined;

  for (const [label, value] of [
    ['FPC', 'FPC-1'],
    ['Probe Card', 'PC-1'],
  ]) {
    const column = file.headers.indexOf(label);
    assert.ok(column > 0, label);
    assert.deepEqual(
      file.rows.map((row) => row[column]),
      [...Array<string>(11).fill('NA'), value],
    );
  }
  assert.deepEqual(preview.headers, file.headers);
  assert.equal(exported, forms);
  assert.equal(previewed, forms);

  // A form first met on a later page is read then, for that page's request.
  const pages = await fixture.index.withExportSnapshot(async (search) => {
    const read: string[][] = [];
    for (let offset = 0; offset < 12; offset += 5) {
      const page = await search.queryExportRequests({ limit: 5, offset }, 5);
      read.push(
        page.items.map((item) =>
          [
            ...item.schemaSnapshot.sections,
            ...(item.psfCreatedInformationSchema?.sections ?? []),
          ]
            .flatMap((section) => section.fields)
            .filter((field) => ['fpc', 'probe_card'].includes(field.fieldKey))
            .map((field) => field.fieldKey)
            .join(),
        ),
      );
    }
    return read;
  });
  assert.deepEqual(pages, [
    Array<string>(5).fill(''),
    Array<string>(5).fill(''),
    ['', 'fpc,probe_card'],
  ]);
});

void it('maps each request through its own captured form when two forms of the same Form Version differ only in which answer feeds which column', async () => {
  const [first, second] = [
    await fixture.submit(await fixture.draft()),
    await fixture.submit(await fixture.draft()),
  ];
  const field = (n: number, fieldKey: string, canonicalKey: string) => ({
    fieldKey,
    canonicalKey,
    label: `Field ${n}`,
    type: 'text',
    required: false,
    exportable: true,
    placeholder: '',
    helpText: '',
  });
  const form = (fields: ReturnType<typeof field>[]) => ({
    formKey: 'psf-request',
    version: 1,
    title: 'Request',
    sections: [{ sectionKey: 'request', title: 'Request', fields }],
  });
  const capture = (id: string, fields: ReturnType<typeof field>[]) =>
    db.query(
      `UPDATE psf_requests SET schema_snapshot_json = $2::jsonb,
         requester_data_json = '{"answer_a":"A","answer_b":"B","answer_c":"C"}'::jsonb
       WHERE id = $1`,
      [id, JSON.stringify(form(fields))],
    );
  await capture(first.id, [
    field(1, 'answer_a', 'first'),
    field(2, 'answer_b', 'second'),
    field(3, 'answer_c', 'third'),
  ]);
  await capture(second.id, [
    field(1, 'answer_c', 'first'),
    field(2, 'answer_b', 'second'),
    field(3, 'answer_a', 'third'),
  ]);

  const rows = await exportRows(admin);
  const cells = (requestNo: string) => {
    const row = rows.find((candidate) => candidate['Request No'] === requestNo);
    assert.ok(row);
    return [row['Field 1'], row['Field 2'], row['Field 3']];
  };
  assert.deepEqual(cells(first.requestNo), ['A', 'B', 'C']);
  assert.deepEqual(cells(second.requestNo), ['C', 'B', 'A']);
  const preview = await exporter.previewRequests({});
  const fields = ['Field 1', 'Field 2', 'Field 3'].map((label) =>
    preview.headers.indexOf(label),
  );
  assert.deepEqual(
    preview.rows.map((row) => fields.map((column) => row[column])),
    rows.map((row) => [row['Field 1'], row['Field 2'], row['Field 3']]),
  );
});

void it('keeps a content key beside each captured form, and gives an existing database those keys at startup', async () => {
  for (let n = 1; n <= 3; n++) await fixture.submit(await fixture.draft());
  // A database from before the keys were stored.
  await db.exec(
    'ALTER TABLE psf_requests DROP COLUMN IF EXISTS schema_snapshot_key, DROP COLUMN IF EXISTS psf_created_schema_snapshot_key',
  );
  await fixture.service.onModuleInit();
  const unkeyed = () =>
    db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM psf_requests
       WHERE schema_snapshot_key IS DISTINCT FROM md5(schema_snapshot_json::text)
          OR psf_created_schema_snapshot_key IS DISTINCT FROM md5(psf_created_schema_snapshot_json::text)`,
    );
  assert.deepEqual((await unkeyed()).rows, [{ count: 0 }]);

  // A changed form gets a new key, and the export reads it.
  await db.query(
    `UPDATE psf_requests SET schema_snapshot_json = jsonb_set(
       schema_snapshot_json, '{sections,0,fields}',
       schema_snapshot_json #> '{sections,0,fields}' ||
       '[{"fieldKey":"fpc","canonicalKey":"fpc","label":"FPC","type":"text","required":false}]'::jsonb),
       requester_data_json = requester_data_json || '{"fpc":"FPC-1"}'::jsonb
     WHERE request_no = (SELECT MIN(request_no) FROM psf_requests)`,
  );
  assert.deepEqual((await unkeyed()).rows, [{ count: 0 }]);
  const file = await exportSheet(admin);
  const preview = await exporter.previewRequests({});
  const fpc = file.headers.indexOf('FPC');
  assert.ok(fpc > 0);
  assert.deepEqual(
    file.rows.map((row) => row[fpc]),
    ['NA', 'NA', 'FPC-1'],
  );
  assert.deepEqual(preview.headers, file.headers);
  assert.deepEqual(preview.rows, file.rows);
});

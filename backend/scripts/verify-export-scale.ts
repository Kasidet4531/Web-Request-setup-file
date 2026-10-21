/** Synthetic export verification; never loads .env or connects to the configured database.
 * Run: node --require ts-node/register scripts/verify-export-scale.ts [--sizes=5570,100000]
 * Exercises the application exporter; historical reports retain their original mode labels.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { performance } from 'node:perf_hooks';
import ExcelJS from 'exceljs';
import { Pool } from 'pg';
import { SaxesParser } from 'saxes';
import { ExcelExportService } from '../src/export/excel_export.service';
import {
  SearchIndexService,
  type RequestSearchFilters,
} from '../src/requests/search-index.service';
import {
  FormSchemaService,
  type FormSchemaJson,
} from '../src/admin/form_schema.service';
import {
  activeRequester,
  activeCreated,
  capturedRequester,
  oldRequester,
  middleRequester,
  oldCreated,
  middleCreated,
  identity,
  statusOptions,
  columns,
  headers,
  source,
  expectedRow,
  EXPORT_ROLES,
  type Cell,
  type Role,
} from '../test/fixtures/export-scale';

type Mode = 'application' | 'current' | 'candidate';
export interface Case {
  rows: number;
  role: Role;
  mode: Mode;
  port: number;
  output: string;
  mutateDuringExport?: boolean;
  deferVerification?: boolean;
}
const loadDependency = createRequire(__filename);
const unzipper = loadDependency('unzipper') as {
  Open: {
    file(
      path: string,
    ): Promise<{ files: Array<{ path: string; stream(): Readable }> }>;
  };
};
const round = (n: number) => Math.round(n * 10) / 10;
const outputFlag = process.argv.find((arg) => arg.startsWith('--output-dir='));
const reportDir = outputFlag
  ? resolve(outputFlag.slice(13))
  : resolve(__dirname, '../../.cache/export-scale');
const progress = (event: string, data: object = {}) =>
  console.log(JSON.stringify({ event, ...data }));

export function poolFor(port: number, maximumConnections = 1): Pool {
  assert.ok(
    Number.isInteger(port) && port > 0,
    'An explicit local fixture port is required.',
  );
  return new Pool({
    host: '127.0.0.1',
    port,
    database: 'postgres',
    user: 'postgres',
    password: 'synthetic-export-fixture',
    max: maximumConnections,
    statement_timeout: 60_000,
  });
}

async function xml(
  stream: Readable,
  onTag: (name: string, attrs: Record<string, string>) => void,
  onText: (text: string) => void,
  onClose: (name: string) => void,
) {
  const parser = new SaxesParser();
  parser.on('opentag', (tag) =>
    onTag(tag.name, tag.attributes as Record<string, string>),
  );
  parser.on('text', onText);
  parser.on('cdata', onText);
  parser.on('closetag', (tag) => onClose(tag.name));
  stream.setEncoding('utf8');
  for await (const chunk of stream) parser.write(chunk as string);
  parser.close();
}

function checkCell(actual: Cell | undefined, expected: Cell, location: string) {
  // An omitted cell and an explicit empty string are both logical blanks.
  const value = actual === undefined ? '' : actual;
  assert.equal(typeof value, typeof expected, `${location}: cell type`);
  assert.equal(value, expected, `${location}: cell value`);
}

// An independent ZIP + strict XML reader; no ExcelJS reader or exporter helpers.
export async function verify(file: string, rows: number) {
  const start = performance.now();
  const zip = await unzipper.Open.file(file);
  assert.equal(
    zip.files.filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f.path))
      .length,
    1,
  );
  const shared: string[] = [];
  const strings = zip.files.find((f) => f.path === 'xl/sharedStrings.xml');
  if (strings) {
    let value = '',
      inText = false;
    await xml(
      strings.stream(),
      (name) => {
        if (name === 'si') value = '';
        if (name === 't') inText = true;
      },
      (text) => {
        if (inText) value += text;
      },
      (name) => {
        if (name === 't') inText = false;
        if (name === 'si') shared.push(value);
      },
    );
  }
  const workbook = zip.files.find((f) => f.path === 'xl/workbook.xml');
  assert.ok(workbook);
  let sheetCount = 0;
  await xml(
    workbook.stream(),
    (name, attrs) => {
      if (name === 'sheet') {
        assert.equal(attrs.name, 'PSF Requests');
        sheetCount++;
      }
    },
    () => {},
    () => {},
  );
  assert.equal(sheetCount, 1);
  const worksheet = zip.files.find(
    (f) => f.path === 'xl/worksheets/sheet1.xml',
  );
  assert.ok(worksheet);
  let rowNumber = 0,
    cellColumn = 0,
    cellType = '',
    value = '',
    readingValue = false;
  let seenRow = 0,
    row: Array<Cell | undefined> = [],
    cells = 0,
    blanks = 0,
    lineEndingDiffs = 0;
  const differenceExamples: object[] = [];
  const digest = createHash('sha256');
  await xml(
    worksheet.stream(),
    (name, attrs) => {
      assert.notEqual(
        name,
        'f',
        'Formula node found: source text must remain literal text.',
      );
      if (name === 'row') {
        rowNumber = Number(attrs.r);
        assert.equal(
          rowNumber,
          seenRow + 1,
          'Missing, duplicate, or reordered worksheet row.',
        );
        row = [];
      }
      if (name === 'c') {
        const ref = /^([A-Z]+)(\d+)$/.exec(attrs.r);
        assert.ok(ref, `Invalid cell reference ${attrs.r}`);
        assert.equal(Number(ref[2]), rowNumber);
        cellColumn =
          [...ref[1]].reduce(
            (col, letter) => col * 26 + letter.charCodeAt(0) - 64,
            0,
          ) - 1;
        assert.ok(cellColumn < headers.length, 'Unexpected extra column.');
        assert.equal(row[cellColumn], undefined, 'Duplicate cell.');
        cellType = attrs.t || 'n';
        value = '';
      }
      if (name === 'v' || name === 't') readingValue = true;
    },
    (text) => {
      if (readingValue) value += text;
    },
    (name) => {
      if (name === 'v' || name === 't') readingValue = false;
      if (name === 'c') {
        if (cellType === 's') {
          assert.match(value, /^\d+$/);
          assert.ok(
            Number(value) < shared.length,
            'Invalid shared string reference.',
          );
          row[cellColumn] = shared[Number(value)];
        } else if (cellType === 'inlineStr' || cellType === 'str')
          row[cellColumn] = value;
        else {
          assert.equal(cellType, 'n', `Unexpected cell type ${cellType}`);
          if (value !== '') {
            assert.ok(Number.isFinite(Number(value)));
            row[cellColumn] = Number(value);
          }
        }
      }
      if (name === 'row') {
        const expected =
          rowNumber === 1 ? headers : expectedRow(rows - rowNumber + 2);
        for (let c = 0; c < headers.length; c++) {
          const actual = row[c] === undefined ? '' : row[c];
          const wanted = expected[c];
          if (
            typeof actual === 'string' &&
            typeof wanted === 'string' &&
            actual !== wanted &&
            wanted.includes('\r\n') &&
            actual === wanted.replace(/\r\n/g, '\n')
          ) {
            // A baseline finding, counted as a strict difference rather than silently normalized.
            lineEndingDiffs++;
            if (differenceExamples.length < 3)
              differenceExamples.push({
                row: rowNumber,
                column: headers[c],
                actual,
                expected: wanted,
              });
          } else checkCell(actual, wanted, `row ${rowNumber}, ${headers[c]}`);
          cells++;
          if (expected[c] === '') blanks++;
        }
        digest.update(
          JSON.stringify(headers.map((_, c) => row[c] ?? '')) + '\n',
        );
        seenRow++;
      }
    },
  );
  assert.equal(seenRow, rows + 1, 'Wrong final row count.');
  return {
    checkedCells: cells,
    blankCells: blanks,
    diffs: lineEndingDiffs,
    lineEndingDiffs,
    otherDiffs: 0,
    strictPass: lineEndingDiffs === 0,
    differenceExamples,
    logicalSha256: digest.digest('hex'),
    verifyMs: round(performance.now() - start),
  };
}

// Instrument the real driver only. Application query, mapping and worker methods
// execute unchanged; the independent source/oracle remains in the fixture module.
export async function runCase(c: Case, sharedPool?: Pool) {
  assert.equal(
    c.mode,
    'application',
    'Historical prototype modes are read-only reports.',
  );
  const pool = sharedPool || poolFor(c.port);
  let dbMs = 0,
    queryCount = 0,
    countWindows = 0,
    committed = false;
  let concurrentMutationProof: Record<string, boolean> | null = null;
  const exportPool = {
    query: pool.query.bind(pool),
    connect: async () => {
      const client = await pool.connect();
      return {
        release: () => client.release(),
        query: async (sql: string, values?: unknown[]) => {
          const began = performance.now();
          const result = await client.query(sql, values);
          dbMs += performance.now() - began;
          if (sql.includes('WITH export_page AS MATERIALIZED')) {
            queryCount++;
            if (sql.includes('COUNT(*) OVER()')) countWindows++;
            if (c.mutateDuringExport && queryCount === 1)
              concurrentMutationProof = await mutateFixture(c.port, c.rows);
          }
          if (sql === 'COMMIT') committed = true;
          return result;
        },
      };
    },
  } as unknown as Pool;
  const exporter = new ExcelExportService(
    new SearchIndexService(exportPool),
    new FormSchemaService(pool),
  );
  try {
    progress('export-start', c);
    const start = performance.now();
    const result = await exporter.exportAllRequests(
      {},
      { id: 'synthetic-actor', role: c.role },
    );
    const exportMs = performance.now() - start;
    assert.ok(committed && countWindows === 1);
    await writeFile(c.output, result.content);
    const bytes = result.content.length;
    result.content = Buffer.alloc(0);
    if (!c.deferVerification) global.gc?.();
    const verified = c.deferVerification ? {} : await verify(c.output, c.rows);
    const output = {
      ...c,
      success: true,
      exportMs: round(exportMs),
      queryMs: round(dbMs),
      queryCount,
      countWindows,
      bytes,
      consistentReadSnapshot: committed,
      concurrentMutationApplied: concurrentMutationProof !== null,
      concurrentMutationProof,
      ...verified,
      maxRssMiB: round(process.resourceUsage().maxRSS / 1024),
    };
    progress('case-complete', output);
    await writeFile(c.output + '.json', JSON.stringify(output, null, 2) + '\n');
    return output;
  } finally {
    await exporter.onModuleDestroy();
    if (!sharedPool) await pool.end();
  }
}

export async function createFixtureTables(pool: Pool) {
  await pool.query(`CREATE TABLE psf_requests (
    id uuid PRIMARY KEY, request_no text NOT NULL, status text NOT NULL,
    requester text, setup_owner text, setup_owner_role text, product_type text,
    created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    requester_data_json jsonb NOT NULL, psf_created_data_json jsonb NOT NULL,
    psf_released_at timestamptz, requester_user_id uuid,
    psf_created_schema_snapshot_json jsonb, schema_snapshot_json jsonb NOT NULL, canonical_seed jsonb
  ); CREATE INDEX export_order ON psf_requests(updated_at DESC, request_no DESC);
  CREATE TABLE canonical_submission_values (request_id uuid NOT NULL, canonical_key text NOT NULL, value_json jsonb,
    PRIMARY KEY(request_id, canonical_key));
  CREATE TABLE form_definitions (form_key text, version int, status text, schema_json jsonb,
    title text NOT NULL DEFAULT 'Synthetic', description text, published_at timestamptz,
    PRIMARY KEY(form_key,version))`);
}

export async function seed(pool: Pool, count: number) {
  const start = performance.now();
  await pool.query(
    `TRUNCATE canonical_submission_values, psf_requests, form_definitions`,
  );
  for (const schema of [
    oldRequester,
    middleRequester,
    activeRequester,
    oldCreated,
    middleCreated,
    activeCreated,
  ]) {
    await pool.query(
      'INSERT INTO form_definitions (form_key,version,status,schema_json,title) VALUES ($1,$2,$3,$4::jsonb,$5)',
      [
        schema.formKey,
        schema.version,
        schema === activeRequester || schema === activeCreated
          ? 'active'
          : 'published',
        JSON.stringify(schema),
        schema.title,
      ],
    );
  }
  for (let offset = 0; offset < count; offset += 500) {
    const records = Array.from(
      { length: Math.min(500, count - offset) },
      (_, n) => source(offset + n + 1),
    );
    await pool.query(
      `INSERT INTO psf_requests
      SELECT id::uuid, "requestNo", status, NULL, NULL, NULL, NULL, "createdAt"::timestamptz,
        "updatedAt"::timestamptz, "requesterData", "createdData", "releasedAt"::timestamptz, NULL::uuid,
        "createdSchema", "requesterSchema", canonical
      FROM jsonb_to_recordset($1::jsonb) AS x(id text, "requestNo" text, status text,
        "createdAt" text, "updatedAt" text, "requesterData" jsonb, "createdData" jsonb,
        "releasedAt" text, "createdSchema" jsonb, "requesterSchema" jsonb, canonical jsonb)`,
      [JSON.stringify(records)],
    );
    if ((offset + 500) % 10000 === 0)
      progress('seed', { count: Math.min(offset + 500, count), total: count });
  }
  // Draft rows sort before submitted rows and must still never appear in any export.
  await pool.query(
    `INSERT INTO psf_requests
    SELECT ('ffffffff-ffff-4fff-8fff-' || lpad(i::text, 12, '0'))::uuid,
      'DRAFT-' || i, 'Draft', NULL, NULL, NULL, NULL, NOW(), NOW() + interval '10 years',
      '{}'::jsonb, '{}'::jsonb, NULL, NULL, $1::jsonb, $2::jsonb, NULL
    FROM generate_series(1,37) AS i`,
    [JSON.stringify(activeCreated), JSON.stringify(activeRequester)],
  );
  await pool.query(`INSERT INTO canonical_submission_values
    SELECT id, key, value FROM psf_requests CROSS JOIN LATERAL jsonb_each(canonical_seed)
    WHERE canonical_seed IS NOT NULL AND canonical_seed <> 'null'::jsonb`);
  await pool.query('ANALYZE psf_requests; ANALYZE canonical_submission_values');
  const counts = (
    await pool.query<{ total: number; canonical_values: number }>(`SELECT
    (SELECT count(*)::int FROM psf_requests) AS total,
    (SELECT count(*)::int FROM canonical_submission_values) AS canonical_values`)
  ).rows[0];
  assert.equal(counts.total, count + 37);
  progress('seed-complete', {
    count,
    ...counts,
    seedMs: round(performance.now() - start),
  });
  return {
    rows: count,
    drafts: 37,
    ...counts,
    seedMs: round(performance.now() - start),
    compatibilityCoverage: await compatibilityCoverage(pool, count),
  };
}

async function compatibilityCoverage(pool: Pool, count: number) {
  // Read persisted JSON, independently of fixture generation and workbook mapping.
  const probe = await pool.query<{
    requester_data_json: Record<string, unknown>;
    psf_created_data_json: Record<string, unknown>;
    schema_snapshot_json: FormSchemaJson;
    psf_created_schema_snapshot_json: FormSchemaJson;
    canonical_seed: Record<string, unknown> | null;
    status: string;
  }>(`SELECT requester_data_json, psf_created_data_json, schema_snapshot_json,
      psf_created_schema_snapshot_json, canonical_seed, status
      FROM psf_requests WHERE status <> 'Draft' ORDER BY request_no LIMIT 780`);
  const choices = columns.filter(
    (column) => column.type === 'select' && column.side !== 'metadata',
  );
  const coverage = new Map(
    choices.map((column) => [
      column.key,
      {
        column: column.name,
        unlistedInSnapshotAndCurrent: 0,
        canonical: 0,
        fallback: 0,
        psf: 0,
        rawVariants: new Set<string>(),
      },
    ]),
  );
  const schemas = new Map<
    string,
    { formKey: string; version: number; fields: number }
  >();
  for (const row of probe.rows) {
    for (const [schema, data, side] of [
      [row.schema_snapshot_json, row.requester_data_json, 'requester'],
      [row.psf_created_schema_snapshot_json, row.psf_created_data_json, 'psf'],
    ] as const) {
      const fields = schema.sections.flatMap((section) => section.fields);
      schemas.set(
        createHash('sha256').update(JSON.stringify(schema)).digest('hex'),
        {
          formKey: schema.formKey,
          version: schema.version,
          fields: fields.length,
        },
      );
      for (const field of fields) {
        const entry = coverage.get(field.canonicalKey || '');
        if (!entry) continue;
        const column = choices.find((c) => c.key === field.canonicalKey)!;
        const value = data[field.fieldKey];
        entry.rawVariants.add(`${typeof value}:${JSON.stringify(value)}`);
        const values = Array.isArray(value) ? value : [value];
        if (!values.some((v) => !(field.options || []).includes(String(v))))
          continue;
        if (!values.some((v) => !column.options.includes(String(v)))) continue;
        entry.unlistedInSnapshotAndCurrent++;
        if (side === 'psf') entry.psf++;
        else if (row.canonical_seed) entry.canonical++;
        else entry.fallback++;
      }
    }
  }
  if (count >= 780) {
    for (const [key, entry] of coverage) {
      assert.ok(
        entry.unlistedInSnapshotAndCurrent > 0,
        `Missing unlisted choice: ${key}`,
      );
      assert.ok(
        entry.psf > 0 || (entry.canonical > 0 && entry.fallback > 0),
        `Missing data path: ${key}`,
      );
      for (const variant of [
        'number:6',
        'string:"6"',
        'number:200',
        'string:"200"',
      ])
        assert.ok(entry.rawVariants.has(variant), `Missing ${variant}: ${key}`);
    }
    for (const formKey of ['psf-request', 'psf-created-information']) {
      const variants = [...schemas.values()].filter(
        (s) => s.formKey === formKey,
      );
      assert.deepEqual(
        [...new Set(variants.map((s) => s.version))].sort(),
        [1, 2, 3],
      );
      assert.equal(new Set(variants.map((s) => s.fields)).size, 3);
    }
    assert.ok(probe.rows.some((row) => !statusOptions.includes(row.status)));
  }
  return {
    probeRows: probe.rows.length,
    completeChoiceAndVersionCoverage: count >= 780,
    schemas: [...schemas.values()],
    choiceColumns: [...coverage.values()].map((entry) => ({
      ...entry,
      rawVariants: [...entry.rawVariants],
    })),
    unknownStatusPreserved: probe.rows.some(
      (row) => !statusOptions.includes(row.status),
    ),
  };
}

interface FixtureState {
  ids: string[];
  requests: Record<string, unknown>[];
  canonical: Record<string, unknown>[];
  definitions: Record<string, unknown>[];
}

export async function captureFixture(
  pool: Pool,
  rows: number,
): Promise<FixtureState> {
  const ids = [1, 2, 3, 4, rows + 1].map((i) => identity(i).id);
  return {
    ids,
    requests: (
      await pool.query<Record<string, unknown>>(
        'SELECT * FROM psf_requests WHERE id = ANY($1::uuid[])',
        [ids],
      )
    ).rows,
    canonical: (
      await pool.query<Record<string, unknown>>(
        'SELECT * FROM canonical_submission_values WHERE request_id = ANY($1::uuid[])',
        [ids],
      )
    ).rows,
    definitions: (
      await pool.query<Record<string, unknown>>(
        'SELECT * FROM form_definitions',
      )
    ).rows,
  };
}

export async function restoreFixture(pool: Pool, saved: FixtureState) {
  await pool.query('BEGIN');
  try {
    await pool.query(
      'DELETE FROM canonical_submission_values WHERE request_id = ANY($1::uuid[])',
      [saved.ids],
    );
    await pool.query('DELETE FROM psf_requests WHERE id = ANY($1::uuid[])', [
      saved.ids,
    ]);
    await pool.query(
      'INSERT INTO psf_requests SELECT * FROM jsonb_populate_recordset(NULL::psf_requests,$1::jsonb)',
      [JSON.stringify(saved.requests)],
    );
    await pool.query(
      'INSERT INTO canonical_submission_values SELECT * FROM jsonb_populate_recordset(NULL::canonical_submission_values,$1::jsonb)',
      [JSON.stringify(saved.canonical)],
    );
    await pool.query('TRUNCATE form_definitions');
    await pool.query(
      'INSERT INTO form_definitions SELECT * FROM jsonb_populate_recordset(NULL::form_definitions,$1::jsonb)',
      [JSON.stringify(saved.definitions)],
    );
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

export async function mutateFixture(port: number, rows: number) {
  const writer = poolFor(port);
  try {
    await writer.query('BEGIN');
    await writer.query(
      `UPDATE psf_requests SET updated_at = '2040-01-01' WHERE id = $1`,
      [identity(1).id],
    );
    await writer.query(
      `UPDATE canonical_submission_values SET value_json = '"AFTER-SNAPSHOT"'::jsonb
      WHERE request_id = $1 AND canonical_key = 'title'`,
      [identity(4).id],
    );
    await writer.query(
      `UPDATE psf_requests SET psf_released_at = '2040-01-01',
      psf_created_data_json = jsonb_build_object('new_bin_assign_no_pcm','AFTER-SNAPSHOT SECRET') WHERE id = $1`,
      [identity(3).id],
    );
    await writer.query(
      'DELETE FROM canonical_submission_values WHERE request_id = $1',
      [identity(2).id],
    );
    await writer.query('DELETE FROM psf_requests WHERE id = $1', [
      identity(2).id,
    ]);
    await writer.query(
      `INSERT INTO psf_requests SELECT (jsonb_populate_record(NULL::psf_requests,
      to_jsonb(request) || jsonb_build_object('id',$1::text,'request_no','AFTER-SNAPSHOT INSERT','updated_at','2041-01-01'))).*
      FROM psf_requests AS request WHERE id = $2`,
      [identity(rows + 1).id, identity(3).id],
    );
    await writer.query(`UPDATE form_definitions SET schema_json = jsonb_set(schema_json,
      '{sections,0,fields,0,label}', '"AFTER-SNAPSHOT HEADER"'::jsonb) WHERE status = 'active'`);
    await writer.query('COMMIT');
    const proof = (
      await writer.query<Record<string, boolean>>(
        `SELECT
      EXISTS(SELECT FROM psf_requests WHERE id = $1 AND updated_at = '2040-01-01') AS reordered,
      NOT EXISTS(SELECT FROM psf_requests WHERE id = $2) AS deleted,
      EXISTS(SELECT FROM psf_requests WHERE id = $3 AND request_no = 'AFTER-SNAPSHOT INSERT') AS inserted,
      EXISTS(SELECT FROM canonical_submission_values WHERE request_id = $4 AND canonical_key = 'title'
        AND value_json = '"AFTER-SNAPSHOT"'::jsonb) AS canonical_changed,
      EXISTS(SELECT FROM psf_requests WHERE id = $5 AND psf_released_at IS NOT NULL
        AND psf_created_data_json->>'new_bin_assign_no_pcm' = 'AFTER-SNAPSHOT SECRET') AS psf_changed,
      (SELECT count(*) FROM form_definitions WHERE status = 'active'
        AND schema_json#>>'{sections,0,fields,0,label}' = 'AFTER-SNAPSHOT HEADER') = 2 AS schema_changed`,
        [
          identity(1).id,
          identity(2).id,
          identity(rows + 1).id,
          identity(4).id,
          identity(3).id,
        ],
      )
    ).rows[0];
    assert.equal(Object.keys(proof).length, 6);
    assert.ok(
      Object.values(proof).every((value) => value),
      'Concurrent writes must be visible outside the export snapshot.',
    );
    return proof;
  } catch (error) {
    await writer.query('ROLLBACK');
    throw error;
  } finally {
    await writer.end();
  }
}

async function queryChecks(pool: Pool, rows: number) {
  const original = new SearchIndexService(pool);
  const filters: RequestSearchFilters[] = [
    { limit: 7, offset: 4 },
    { status: statusOptions[0], limit: 7, offset: 1 },
    {
      requestDateFrom: '2026-01-01',
      requestDateTo: '2026-01-01',
      limit: 7,
      offset: 1,
    },
    { status: 'Draft', limit: 7, offset: 0 },
  ];
  for (const filter of filters) {
    const total = await original.countExportRequests(filter);
    const expected: number[] = [];
    for (let i = rows; i > 0; i--) {
      const row = identity(i);
      if (filter.status && row.status !== filter.status) continue;
      const day = row.createdAt.slice(0, 10);
      if (filter.requestDateFrom && day < filter.requestDateFrom) continue;
      if (filter.requestDateTo && day > filter.requestDateTo) continue;
      expected.push(i);
    }
    assert.equal(total, expected.length);
    const a = await original.queryExportRequests(filter, 7);
    const b = await original.withExportSnapshot((search) =>
      search.queryExportRequests(filter, 7),
    );
    assert.deepEqual(a, b, 'Candidate changed filtered query results.');
    assert.deepEqual(
      a.items.map((item) => item.requestNo),
      expected
        .slice(filter.offset, (filter.offset || 0) + 7)
        .map((i) => identity(i).requestNo),
    );
  }
  // Expose a pre-existing correctness limit: mutable ordering with OFFSET is not a consistent snapshot.
  const concurrentReorder: object[] = [];
  for (const mode of ['current', 'candidate'] as const) {
    const writer = new Pool(pool.options);
    await pool.query(
      mode === 'candidate'
        ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
        : 'BEGIN',
    );
    try {
      const search = original;
      const first = await search.queryExportRequests(
        { limit: 10, offset: 0 },
        10,
      );
      await writer.query(
        `UPDATE psf_requests SET updated_at = '2040-01-01' WHERE id = $1`,
        [identity(1).id],
      );
      const second = await search.queryExportRequests(
        { limit: 10, offset: 10 },
        10,
      );
      const all = [...first.items, ...second.items].map(
        (item) => item.requestNo,
      );
      const duplicates = all.length - new Set(all).size;
      assert.equal(
        duplicates,
        mode === 'candidate' ? 0 : 1,
        'Candidate must preserve row membership during concurrent reorder.',
      );
      concurrentReorder.push({
        mode,
        duplicatesInFirst20: duplicates,
        consistentSnapshot: duplicates === 0,
      });
    } finally {
      await pool.query('ROLLBACK');
      await writer.query(
        'UPDATE psf_requests SET updated_at = $1 WHERE id = $2',
        [identity(1).updatedAt, identity(1).id],
      );
      await writer.end();
    }
  }
  const snapshot = source(15);
  assert.equal(snapshot.requesterSchema.version, activeRequester.version);
  assert.notDeepEqual(
    original.extractCanonicalValues(
      snapshot.requesterSchema,
      snapshot.requesterData,
    ),
    original.extractCanonicalValues(activeRequester, snapshot.requesterData),
    'Counterexample must reject substituting a schema solely by version.',
  );
  return {
    filterCases: filters.length,
    versionOnlySubstitutionRejected: true,
    concurrentReorder,
  };
}

async function spawnCase(c: Case): Promise<Record<string, unknown>> {
  const stderr: string[] = [];
  let aborted: string | null = null;
  const child = spawn(
    process.execPath,
    [
      '--max-old-space-size=3072',
      '--expose-gc',
      '--require',
      'ts-node/register/transpile-only',
      __filename,
      '--case',
      JSON.stringify(c),
    ],
    { cwd: resolve(__dirname, '..'), stdio: ['ignore', 'inherit', 'pipe'] },
  );
  child.stderr.on('data', (data) => {
    stderr.push(String(data));
    if (stderr.length > 12) stderr.shift();
  });
  // Bound a stress failure without allowing it to exhaust the entire shared environment.
  const timeout = setTimeout(() => {
    aborted = 'case exceeded 240 seconds';
    child.kill('SIGKILL');
  }, 240_000);
  let peakRss = 0;
  const memory = setInterval(() => {
    void readFile(`/proc/${child.pid}/status`, 'utf8')
      .then((status) => {
        const rss = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] || 0) / 1024;
        peakRss = Math.max(peakRss, rss);
        if (rss > 5000) {
          aborted = 'case exceeded 5000 MiB RSS';
          child.kill('SIGKILL');
        }
      })
      .catch(() => {});
  }, 250);
  try {
    const exit = await new Promise<{
      code: number | null;
      signal: string | null;
    }>((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolveExit({ code, signal }));
    });
    if (exit.code === 0)
      return JSON.parse(await readFile(c.output + '.json', 'utf8')) as Record<
        string,
        unknown
      >;
    const failure = {
      ...c,
      success: false,
      ...exit,
      reason: aborted || stderr.join('').slice(-3000),
      maxRssMiB: round(peakRss),
    };
    progress('case-failed', failure);
    return failure;
  } finally {
    clearTimeout(timeout);
    clearInterval(memory);
  }
}

async function main() {
  const crossReadFlag = process.argv.find((arg) =>
    arg.startsWith('--cross-read='),
  );
  if (crossReadFlag) {
    const path = resolve(crossReadFlag.slice(13));
    const report = JSON.parse(await readFile(path, 'utf8')) as {
      cases: Array<
        Case & { success: boolean; logicalSha256: string; strictPass?: boolean }
      >;
    };
    const documentOnly = process.argv.includes('--document-only');
    const results: object[] = [];
    const readerCases = report.cases.filter(
      (c) =>
        c.mode !== 'current' && c.success && (!documentOnly || c.rows < 10000),
    );
    for (const c of readerCases) {
      const start = performance.now();
      const digest = createHash('sha256');
      let rows = 0,
        sheets = 0,
        readerUtf8Diffs = 0;
      const examples: object[] = [];
      const inspect = (row: ExcelJS.Row) => {
        rows++;
        const values = headers.map((_, i) => row.getCell(i + 1).value ?? '');
        const expected =
          row.number === 1 ? headers : expectedRow(c.rows - row.number + 2);
        expected.forEach((cell, i) => {
          const wanted =
            typeof cell === 'string' && !c.strictPass
              ? cell.replace(/\r\n/g, '\n')
              : cell;
          const actual = values[i];
          if (actual === wanted) return;
          // ExcelJS 4.4 streaming reader decodes each UTF-8 chunk without stream:true.
          // Count and expose its replacement characters; the independent reader uses StringDecoder.
          assert.ok(
            typeof actual === 'string' && actual.includes('\ufffd'),
            'Unexplained secondary-reader difference.',
          );
          readerUtf8Diffs++;
          if (examples.length < 3)
            examples.push({
              row: row.number,
              column: headers[i],
              actual: actual.slice(0, 100),
              expected: String(wanted).slice(0, 100),
            });
        });
        digest.update(JSON.stringify(values) + '\n');
      };
      if (c.rows < 10000) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(c.output);
        sheets = workbook.worksheets.length;
        workbook.worksheets[0].eachRow(inspect);
      } else {
        const workbook = new ExcelJS.stream.xlsx.WorkbookReader(c.output, {
          worksheets: 'emit',
          sharedStrings: 'cache',
          styles: 'ignore',
          hyperlinks: 'ignore',
        });
        for await (const sheet of workbook) {
          sheets++;
          for await (const row of sheet) inspect(row);
        }
      }
      const logicalSha256 = digest.digest('hex');
      assert.equal(sheets, 1);
      assert.equal(rows, c.rows + 1);
      if (!readerUtf8Diffs) assert.equal(logicalSha256, c.logicalSha256);
      const result = {
        reader: c.rows < 10000 ? 'ExcelJS document' : 'ExcelJS streaming',
        requests: c.rows,
        role: c.role,
        sheets,
        rows,
        checkedCells: rows * headers.length,
        logicalSha256,
        matchesIndependentReader: logicalSha256 === c.logicalSha256,
        readerUtf8Diffs,
        examples,
        crossReadMs: round(performance.now() - start),
      };
      results.push(result);
      progress('cross-reader', result);
    }
    assert.equal(
      results.length,
      readerCases.length,
      'Required sizes and roles must be checked.',
    );
    await writeFile(
      join(
        dirname(path),
        documentOnly ? 'document-reader.json' : 'cross-reader.json',
      ),
      JSON.stringify(results, null, 2) + '\n',
    );
    if (
      results.some(
        (result) =>
          !(result as { matchesIndependentReader: boolean })
            .matchesIndependentReader,
      )
    )
      process.exitCode = 2;
    return;
  }
  if (process.argv[2] === '--case') {
    await runCase(JSON.parse(process.argv[3]) as Case);
    return;
  }
  // Prove the verifier rejects changes in values, numeric/text types and private data.
  assert.throws(() => checkCell('0', 0, 'type mutation'));
  assert.throws(() => checkCell('secret', '', 'visibility mutation'));
  assert.throws(() =>
    checkCell(undefined, 'required value', 'missing cell mutation'),
  );
  assert.notDeepEqual(capturedRequester, activeRequester);
  assert.equal(capturedRequester.version, activeRequester.version);
  assert.ok(
    oldRequester.sections[2].fields.some(
      (f) => f.canonicalKey === 'notch_direction_for_probe',
    ),
  );
  await mkdir(reportDir, { recursive: true });
  const flag = process.argv.find((a) => a.startsWith('--sizes='));
  const sizes = (flag?.slice(8) || '5570,100000').split(',').map(Number);
  assert.ok(
    sizes.every((n) => Number.isSafeInteger(n) && n > 2 && n <= 100000),
  );
  const roleFlag = process.argv.find((arg) => arg.startsWith('--roles='));
  const roles = roleFlag
    ? (roleFlag.slice(8).split(',') as Role[])
    : EXPORT_ROLES;
  assert.ok(
    roles.length > 0 && roles.every((role) => EXPORT_ROLES.includes(role)),
    'Unknown export role.',
  );
  assert.equal(new Set(roles).size, roles.length, 'Duplicate export roles.');
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  const dir = await mkdtemp(join(reportDir, 'postgres-'));
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const db = new EmbeddedPostgres({
    databaseDir: dir,
    port,
    password: 'synthetic-export-fixture',
    persistent: false,
    postgresFlags: [
      '-k',
      '',
      '-c',
      'listen_addresses=127.0.0.1',
      '-c',
      'shared_buffers=64MB',
    ],
    onLog: () => {},
    onError: (error) => progress('postgres-error', { error: String(error) }),
  });
  const report: {
    [key: string]: unknown;
    datasets: unknown[];
    cases: Record<string, unknown>[];
  } = {
    timestamp: new Date().toISOString(),
    node: process.version,
    exceljs: (
      JSON.parse(
        await readFile(loadDependency.resolve('exceljs/package.json'), 'utf8'),
      ) as { version: string }
    ).version,
    cpu: cpus()[0]?.model,
    memoryLimitMiB: 8192,
    workerHeapLimitMiB: 3072,
    implementation: 'application service and workers (source)',
    fixtureColumns: columns.length,
    outputColumns: headers.length,
    testedRoles: roles,
    historicalFields: columns
      .filter((c) => c.side === 'historical')
      .map((c) => c.name),
    generatedFields: columns.filter((c) => c.generated).map((c) => c.name),
    datasets: [],
    cases: [],
  };
  let pool: Pool | undefined;
  let databaseStarted = false;
  try {
    await db.initialise();
    await db.start();
    databaseStarted = true;
    pool = poolFor(port);
    report.postgres = (
      await pool.query<{ version: string }>('SELECT version()')
    ).rows[0].version;
    await createFixtureTables(pool);
    for (const rows of sizes) {
      report.datasets.push(await seed(pool, rows));
      const fixtureState = await captureFixture(pool, rows);
      const modes: Mode[] = ['application'];
      for (const mode of modes)
        for (const role of roles) {
          const output = join(reportDir, `${rows}-${mode}-${role}.xlsx`);
          const mutateDuringExport = rows >= 20;
          try {
            const result = await spawnCase({
              rows,
              role,
              mode,
              port,
              output,
              mutateDuringExport,
            });
            report.cases.push(result);
          } finally {
            if (mutateDuringExport) await restoreFixture(pool, fixtureState);
          }
          await writeFile(
            join(reportDir, 'report.json'),
            JSON.stringify(report, null, 2) + '\n',
          );
        }
      // Keep the deterministic mutation probes small; they roll back before cleanup.
      if (rows >= 20 && rows <= 5570) {
        report.queryChecks = await queryChecks(pool, rows);
        await writeFile(
          join(reportDir, 'report.json'),
          JSON.stringify(report, null, 2) + '\n',
        );
      }
    }
    assert.ok(
      report.cases
        .filter((c) => c.mode === 'application')
        .every((c) => c.success),
      'An application case failed; inspect report.json.',
    );
    const candidates = report.cases.filter((c) => c.mode === 'application');
    assert.equal(
      candidates.length,
      sizes.length * roles.length,
      'Missing size/role case.',
    );
    report.strictCellAcceptancePassed = candidates.every(
      (c) => c.success && c.strictPass,
    );
    await writeFile(
      join(reportDir, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    progress('all-complete', {
      report: join(reportDir, 'report.json'),
      strictCellAcceptancePassed: report.strictCellAcceptancePassed,
    });
    // Exit 2 records known correctness findings; never make a lossy export a green test.
    if (!report.strictCellAcceptancePassed) process.exitCode = 2;
  } finally {
    await pool?.end();
    if (databaseStarted) await db.stop();
    // The owned throwaway cluster contains synthetic records only.
    await rm(dir, { recursive: true, force: true });
  }
}
if (require.main === module)
  main()
    .then(() => {
      // All owned resources have been closed by main's finally. embedded-postgres's
      // beforeExit hook otherwise forces code 0 and would hide failed correctness gates.
      if (process.exitCode) process.exit(process.exitCode);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });

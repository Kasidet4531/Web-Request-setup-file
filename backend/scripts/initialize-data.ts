/**
 * Initial Data Load: clears request data and form configuration, then reloads the
 * forms, Status catalog and requests from the PSF form detail workbook
 * (sheets Column_Mapping and Data). User accounts are kept.
 *
 *   npm run db:initialize -- <workbook.xlsx>          dry run, rolls everything back
 *   npm run db:initialize -- <workbook.xlsx> --yes    apply
 *
 * The backend must have been started once so its tables exist.
 */
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { Pool, type PoolClient } from 'pg';
import {
  CONFIGURATION_KEY,
  DEFAULT_ENTRIES,
  type StatusKind,
} from '../src/admin/workflow_transition.service';
import type {
  FormSchemaField,
  FormSchemaJson,
} from '../src/admin/form_schema.constants';
import { isNumericText } from '../src/requests/form-data-validation';
import { SearchIndexService } from '../src/requests/search-index.service';

type Db = Pick<PoolClient, 'query'>;
type Side = 'requester' | 'created' | 'legacy';

interface Column {
  name: string;
  label: string;
  key: string;
  side: Side;
  type: FormSchemaField['type'];
  options: string[];
}

export interface Report {
  cleared: string[];
  forms: string[];
  statuses: number;
  imported: number;
  skippedDraft: number;
  outsideCatalog: Record<string, number>;
  mismatches: Record<
    string,
    { rows: number; distinct: number; top?: Record<string, number> }
  >;
  missingColumns: string[];
}

// Tables emptied by the load. app_users and request_data_migrations are kept.
const WIPE = [
  'psf_requests',
  'psf_request_search_index',
  'canonical_submission_values',
  'psf_request_audit_logs',
  'draft_deletion_logs',
  'draft_reminders',
  'email_outbox',
  'psf_export_jobs',
  'form_definitions',
  'autofill_rules',
];
const REQUIRED_TABLES = [
  'psf_requests',
  'psf_request_search_index',
  'canonical_submission_values',
  'form_definitions',
  'workflow_transition_config',
];
const TYPES: Record<string, FormSchemaField['type'] | 'choice'> = {
  'single line of text': 'text',
  'multiple lines of text': 'textarea',
  'person or group': 'text',
  'date and time': 'date',
  number: 'number',
  choice: 'choice',
};
// Keys the app already relies on (search index, autofill, Team Group). Keyed by normalized column name.
const KEY_OVERRIDES: Record<string, string> = {
  'reference old psf name': 'reference_psf_name',
  'fab.': 'wafer_fab',
  'first die ref. ( x,y )': 'first_die_ref_xy',
  'request to': 'product_type',
};
// Column_Mapping name -> header actually used in Data (normalized).
const HEADER_ALIASES: Record<string, string> = {
  'nnr recipe for wt3': 'nnr recipr for wt3',
  'total test die (aras)': 'total test die (enovia)',
  'transfer psf and job file to nas server': 'transfer psf and job file to nas',
};
const MISSING_OK = new Set(['workflow name']);
const SEARCHABLE = new Set([
  'product_type',
  'title',
  'requester',
  'due_date',
  'wafer_fab',
  'probecard_name',
  'reference_psf_name',
  'psf_setup_file_name',
]);

const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
const wallClock = (date: Date) =>
  date.toISOString().slice(0, 19).replace('T', ' ');

// Merged ranges repeat the master's value in every cell; only the master counts.
const own = (cell: ExcelJS.Cell): ExcelJS.CellValue =>
  cell.isMerged && cell.master.address !== cell.address ? null : cell.value;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('text' in value) return cellText(value.text as ExcelJS.CellValue);
    return '';
  }
  return String(value);
}

function readMapping(ws: ExcelJS.Worksheet) {
  const columns: Column[] = [];
  const statuses: string[] = [];
  let current: Column | undefined;
  let inStatus = false;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = cellText(own(row.getCell(2))).trim();
    const option = cellText(own(row.getCell(5))).trim();
    if (name) {
      inStatus = norm(name) === 'status';
      current = undefined;
      if (!inStatus) {
        const audience = norm(cellText(own(row.getCell(1))));
        const type = TYPES[norm(cellText(own(row.getCell(4))))];
        if (!type) throw new Error(`Column_Mapping row ${r}: unknown Type.`);
        current = {
          name,
          label: cellText(own(row.getCell(3))).trim() || name,
          key: KEY_OVERRIDES[norm(name)] ?? slug(name),
          side: /requ/.test(audience)
            ? 'requester'
            : /creat/.test(audience)
              ? 'created'
              : 'legacy',
          type: type === 'choice' ? 'select' : type,
          options: [],
        };
        columns.push(current);
      }
    }
    if (option) (inStatus ? statuses : current?.options)?.push(option);
  }

  for (const column of columns) {
    column.options = [...new Set(column.options)];
    if (column.type === 'select') {
      if (column.options.length === 0)
        throw new Error(`Choice column "${column.name}" has no options.`);
      if (column.options.length <= 3) column.type = 'radio';
    }
  }
  const keys = new Set<string>();
  for (const { key, name } of columns) {
    if (keys.has(key)) throw new Error(`Duplicate field key from "${name}".`);
    keys.add(key);
  }
  if (!columns.some((c) => c.key === 'product_type' && c.side === 'requester'))
    throw new Error('Request To must be a Requester column.');
  if (statuses.length === 0) throw new Error('Status has no options.');
  return { columns, statuses: [...new Set(statuses)] };
}

const toField = (c: Column): FormSchemaField => ({
  fieldKey: c.key,
  canonicalKey: c.key,
  label: c.label,
  type: c.type,
  required: c.key === 'product_type',
  ...(c.options.length ? { options: c.options } : {}),
  ...(SEARCHABLE.has(c.key) ? { searchable: true } : {}),
  exportable: true,
  ...(c.key === 'reference_psf_name' ? { autofillTrigger: true } : {}),
});

const schema = (
  formKey: string,
  version: number,
  title: string,
  sectionKey: string,
  fields: FormSchemaField[],
): FormSchemaJson => ({
  formKey,
  version,
  title,
  sections: [{ sectionKey, title, fields }],
});

function buildSchemas(columns: Column[]) {
  const productType = columns.find((c) => c.key === 'product_type')!;
  const requesterName: FormSchemaField = {
    fieldKey: 'requester_name',
    canonicalKey: 'requester',
    label: 'Requester Name',
    type: 'text',
    required: true,
    searchable: true,
    exportable: true,
  };
  const current = [
    toField(productType),
    requesterName,
    ...columns
      .filter((c) => c.side === 'requester' && c !== productType)
      .map(toField),
  ];
  const requesterV1 = schema(
    'psf-request',
    1,
    'Requester Information',
    'requester_information',
    [...current, ...columns.filter((c) => c.side === 'legacy').map(toField)],
  );
  const requesterV2 = schema(
    'psf-request',
    2,
    'Requester Information',
    'requester_information',
    current,
  );
  const created = schema(
    'psf-created-information',
    1,
    'PSF Created Information',
    'psf_created_information',
    columns.filter((c) => c.side === 'created').map(toField),
  );
  return { requesterV1, requesterV2, created };
}

function buildCatalog(names: string[]) {
  const known = new Map(DEFAULT_ENTRIES.map((e) => [e.name, e]));
  let next = DEFAULT_ENTRIES.length;
  const entries = names.map((name) => {
    const hit = known.get(name);
    return {
      id:
        hit?.id ??
        `00000000-0000-4000-8000-${(++next).toString(16).padStart(12, '0')}`,
      name,
      kind: (hit?.kind ?? 'open') as StatusKind,
      emailPolicy: { enabled: false, to: [] as string[], cc: [] as string[] },
    };
  });
  return { entries, completed: entries.find((e) => e.kind === 'completed') };
}

/** Converts one Data cell to the stored string; counts values that do not fit the field. */
function convert(
  column: Column,
  raw: ExcelJS.CellValue,
  mismatches: Map<string, Map<string, number>>,
): string {
  if (column.type === 'date' && raw instanceof Date)
    return raw.toISOString().slice(0, 10);
  const value = cellText(raw).trim();
  if (!value) return '';
  const textual = column.type === 'text' || column.type === 'textarea';
  if (/^na$/i.test(value)) return textual ? 'NA' : '';
  let fits = true;
  if (column.type === 'select' || column.type === 'radio') {
    const option = column.options.find((o) => norm(o) === norm(value));
    if (option) return option;
    fits = false;
  } else if (column.type === 'number') fits = isNumericText(value);
  else if (column.type === 'date') fits = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!fits) {
    const seen = mismatches.get(column.name) ?? new Map<string, number>();
    seen.set(value, (seen.get(value) ?? 0) + 1);
    mismatches.set(column.name, seen);
  }
  return value;
}

export async function initialize(
  db: Db,
  file: string,
  options: { showValues?: boolean } = {},
): Promise<Report> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const mapping = workbook.getWorksheet('Column_Mapping');
  const data = workbook.getWorksheet('Data');
  if (!mapping || !data)
    throw new Error('Sheets Column_Mapping and Data are required.');
  const { columns, statuses } = readMapping(mapping);
  const schemas = buildSchemas(columns);
  const catalog = buildCatalog(statuses);
  if (!catalog.completed) throw new Error('Status has no completed option.');

  // Data headers, found by name (never by position).
  const header = new Map<string, number>();
  data.getRow(1).eachCell((cell, n) => {
    const key = norm(cellText(cell.value));
    if (header.has(key)) throw new Error(`Duplicate Data header "${key}".`);
    header.set(key, n);
  });
  const find = (name: string) =>
    header.get(HEADER_ALIASES[norm(name)] ?? norm(name));
  const [idCol, createdCol, modifiedCol, statusCol] = [
    'ID',
    'Created',
    'Modified',
    'Status',
  ].map((name) => {
    const n = find(name);
    if (!n) throw new Error(`Data has no ${name} column.`);
    return n;
  });
  const index = new Map(columns.map((c) => [c, find(c.name)] as const));
  const missingColumns = columns
    .filter((c) => !index.get(c))
    .map((c) => c.name);
  const unexpected = missingColumns.filter((n) => !MISSING_OK.has(norm(n)));
  if (unexpected.length)
    throw new Error(`Data has no column for: ${unexpected.join(', ')}`);

  // Clear.
  for (const table of REQUIRED_TABLES) {
    const found = await db.query(`SELECT to_regclass($1) AS t`, [
      `public.${table}`,
    ]);
    if (!found.rows[0].t)
      throw new Error(
        `Table ${table} is missing. Start the backend once first.`,
      );
  }
  const existing = await db.query<{ t: string }>(
    `SELECT t FROM unnest($1::text[]) AS t WHERE to_regclass('public.' || t) IS NOT NULL`,
    [WIPE],
  );
  const cleared = existing.rows.map((r) => r.t);
  await db.query(`TRUNCATE ${cleared.join(', ')}`);

  // Forms and Status catalog.
  const forms = [
    [
      schemas.requesterV1,
      'published',
      'Earlier version including legacy columns.',
    ],
    [schemas.requesterV2, 'active', 'Initial Data Load.'],
    [schemas.created, 'active', 'Initial Data Load.'],
  ] as const;
  for (const [form, status, description] of forms)
    await db.query(
      `INSERT INTO form_definitions (id, form_key, version, title, description, schema_json, status, created_by, created_at, published_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'initial-data-load', NOW(), NOW())`,
      [
        randomUUID(),
        form.formKey,
        form.version,
        form.title,
        description,
        JSON.stringify(form),
        status,
      ],
    );
  await db.query(
    `INSERT INTO workflow_transition_config (config_key, config_json, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (config_key) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = EXCLUDED.updated_at`,
    [
      CONFIGURATION_KEY,
      JSON.stringify({
        entries: catalog.entries,
        psfVisibilityTriggerIds: [catalog.completed.id],
      }),
    ],
  );

  // Requests.
  const searchIndex = new SearchIndexService(db as unknown as Pool);
  const mismatches = new Map<string, Map<string, number>>();
  const outsideCatalog = new Map<string, number>();
  const inCatalog = new Set(statuses);
  let imported = 0;
  let skippedDraft = 0;

  for (let r = 2; r <= data.rowCount; r++) {
    const row = data.getRow(r);
    if (!row.hasValues) continue;
    const id = cellText(own(row.getCell(idCol))).trim();
    const status = cellText(own(row.getCell(statusCol))).trim();
    const created = own(row.getCell(createdCol));
    const modified = own(row.getCell(modifiedCol));
    if (!/^\d+$/.test(id))
      throw new Error(`Data row ${r}: ID is not an integer.`);
    if (!status) throw new Error(`Data row ${r}: Status is blank.`);
    if (!(created instanceof Date) || !(modified instanceof Date))
      throw new Error(`Data row ${r}: Created or Modified is not a date.`);
    if (status.toLowerCase() === 'draft') {
      skippedDraft++;
      continue;
    }
    if (!inCatalog.has(status))
      outsideCatalog.set(status, (outsideCatalog.get(status) ?? 0) + 1);

    const requesterData: Record<string, string> = { requester_name: 'NA' };
    const createdData: Record<string, string> = {};
    for (const column of columns) {
      const cell = index.get(column);
      const value = cell
        ? convert(column, own(row.getCell(cell)), mismatches)
        : '';
      (column.side === 'created' ? createdData : requesterData)[column.key] =
        value;
    }

    const requestId = randomUUID();
    const requestNo = `PSF-${id.padStart(6, '0')}`;
    const createdAt = wallClock(created);
    const modifiedAt = wallClock(modified);
    const productType = requesterData.product_type || null;
    const isCompleted = status === catalog.completed.name;
    await db.query(
      `INSERT INTO psf_requests (
         id, request_no, form_key, form_version, status, requester, product_type,
         requester_data_json, psf_created_data_json, schema_snapshot_json, psf_created_schema_snapshot_json,
         created_at, updated_at, submitted_at, psf_created_at, psf_released_at, completed_at)
       VALUES ($1, $2, 'psf-request', 1, $3, 'NA', $4, $5::jsonb, $6::jsonb,
         (SELECT schema_json FROM form_definitions WHERE form_key = 'psf-request' AND version = 1),
         (SELECT schema_json FROM form_definitions WHERE form_key = 'psf-created-information' AND version = 1),
         $7::timestamp, $8::timestamp, $7::timestamp, $9::timestamp, $10::timestamp, $10::timestamp)`,
      [
        requestId,
        requestNo,
        status,
        productType,
        JSON.stringify(requesterData),
        JSON.stringify(createdData),
        createdAt,
        modifiedAt,
        Object.values(createdData).some(Boolean) ? modifiedAt : null,
        isCompleted ? modifiedAt : null,
      ],
    );
    const canonical = await searchIndex.upsertSubmittedCanonicalValues(
      requestId,
      schemas.requesterV1,
      requesterData,
      db,
    );
    await searchIndex.upsertRequestSearchIndex(
      {
        requestId,
        requestNo,
        status,
        requester: 'NA',
        requesterUserId: null,
        productType,
        requestDate: createdAt,
        updatedAt: modifiedAt,
      },
      canonical,
      db,
    );
    if (++imported % 1000 === 0)
      console.log(`  ${imported} requests loaded...`);
  }

  return {
    cleared,
    forms: forms.map(([f]) => `${f.formKey} v${f.version}`),
    statuses: statuses.length,
    imported,
    skippedDraft,
    outsideCatalog: Object.fromEntries(outsideCatalog),
    mismatches: Object.fromEntries(
      [...mismatches].map(([column, values]) => [
        column,
        {
          rows: [...values.values()].reduce((a, b) => a + b, 0),
          distinct: values.size,
          ...(options.showValues
            ? {
                top: Object.fromEntries(
                  [...values].sort((a, b) => b[1] - a[1]).slice(0, 10),
                ),
              }
            : {}),
        },
      ]),
    ),
    missingColumns,
  };
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error(
      'Usage: npm run db:initialize -- <workbook.xlsx> [--yes] [--show-values]',
    );
    process.exit(1);
  }
  try {
    process.loadEnvFile('.env');
  } catch {
    // Variables may come from the shell instead.
  }
  const apply = flags.includes('--yes');
  const target = {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'psf_setup_db',
  };
  console.log(
    `Target database: ${target.host}:${target.port}/${target.database}`,
  );
  const pool = new Pool(target);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = await initialize(client, file, {
      showValues: flags.includes('--show-values'),
    });
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify(report, null, 2));
    console.log(
      apply
        ? 'APPLIED.'
        : 'DRY RUN: everything was rolled back. Re-run with --yes to apply.',
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

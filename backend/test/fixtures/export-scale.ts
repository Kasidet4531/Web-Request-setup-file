import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UserRole } from '../../src/auth/session.types';
import type {
  FormSchemaField,
  FormSchemaJson,
} from '../../src/admin/form_schema.constants';

// The seven shaded rows in the supplied screenshot, not every row with an empty For.
const HISTORICAL = new Set([
  'Allow to probe on crack pad (bin 103)',
  'Edge die count of EWM Shipped map at DOWN',
  'Edge die count of EWM Shipped map at LEFT',
  'Edge die count of EWM Shipped map at RIGHT',
  'Edge die count of EWM Shipped map at TOP',
  'FPC',
  'Notch Direction for Probe',
]);
const TYPES: Record<string, FormSchemaField['type']> = {
  'Single line of text': 'text',
  'Multiple lines of text': 'textarea',
  'Person or Group': 'text',
  'Date and Time': 'date',
  Number: 'number',
  Choice: 'select',
};
export interface Column {
  name: string;
  label: string;
  key: string;
  side: 'requester' | 'created' | 'historical' | 'metadata';
  generated: boolean;
  type: FormSchemaField['type'];
  options: string[];
}
export type Cell = string | number;
export type Role = UserRole;
const PSF_VISIBLE_WITHOUT_RELEASE: Record<Role, boolean> = {
  admin: true,
  setup_owner: true,
  requester: false,
};
export const EXPORT_ROLES = Object.keys(PSF_VISIBLE_WITHOUT_RELEASE) as Role[];
export const columns: Column[] = [];
let current: Column | undefined;
for (const line of readFileSync(join(__dirname, 'export-columns.tsv'), 'utf8')
  .split(/\r?\n/)
  .slice(1)) {
  if (!line) continue;
  const [audience, name, renamed, type, option] = line.split('\t');
  if (name) {
    assert.ok(TYPES[type], `Unknown column type: ${type}`);
    current = {
      name,
      label: renamed || name,
      key: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, ''),
      side:
        name === 'Status'
          ? 'metadata'
          : HISTORICAL.has(name)
            ? 'historical'
            : /requ/i.test(audience)
              ? 'requester'
              : /creat/i.test(audience)
                ? 'created'
                : 'requester',
      generated: !audience && !HISTORICAL.has(name),
      type: TYPES[type],
      options: [],
    };
    columns.push(current);
  }
  if (option) current?.options.push(option);
}
assert.equal(columns.length, 73);
assert.equal(new Set(columns.map((c) => c.key)).size, columns.length);
assert.equal(columns.filter((c) => c.side === 'historical').length, 7);

export const requesterColumns = columns.filter((c) => c.side === 'requester');
export const historicalColumns = columns.filter((c) => c.side === 'historical');
export const createdColumns = columns.filter((c) => c.side === 'created');
export const statusOptions = columns
  .find((c) => c.name === 'Status')!
  .options.filter((s) => s !== 'Draft');

function makeSchema(
  formKey: string,
  version: number,
  fields: Column[],
  prefix: string,
  oldLabels = false,
): FormSchemaJson {
  return {
    formKey,
    version,
    title: formKey,
    // Multiple sections also exercise historical fields beyond the first section.
    sections: [0, 1, 2].map((section) => ({
      sectionKey: `section_${section}`,
      title: `Section ${section}`,
      fields: fields
        .filter(
          (_, index) => Math.floor((index * 3) / fields.length) === section,
        )
        .map((c) => ({
          fieldKey: `${prefix}${c.key}`,
          canonicalKey: c.key,
          label: oldLabels ? c.name : c.label,
          type: c.type,
          required: false,
          exportable: true,
          ...(c.options.length
            ? {
                options:
                  c.name === 'Diameter (Inch)' && version === 1
                    ? ['6', '8']
                    : c.name === 'Diameter (Inch)' && version === 2
                      ? ['8', '200']
                      : c.options,
              }
            : {}),
        })),
    })),
  };
}
export const activeRequester = makeSchema(
  'psf-request',
  3,
  requesterColumns,
  'new_',
);
export const oldRequester = makeSchema(
  'psf-request',
  1,
  [
    ...requesterColumns.filter(
      (c) => !['Trench Thickness (um)', 'Request For'].includes(c.name),
    ),
    ...historicalColumns,
  ],
  'old_',
  true,
);
export const middleRequester = makeSchema(
  'psf-request',
  2,
  [
    ...requesterColumns
      .filter((c) => c.name !== 'Trench Thickness (um)')
      .toReversed(),
    ...historicalColumns.slice(0, 3),
  ],
  'middle_',
  true,
);
// Same (formKey, version), different field keys: replacing this snapshot with the definition loses values.
export const capturedRequester = makeSchema(
  'psf-request',
  3,
  requesterColumns,
  'captured_',
);
export const activeCreated = makeSchema(
  'psf-created-information',
  3,
  createdColumns,
  'new_',
);
export const oldCreated = makeSchema(
  'psf-created-information',
  1,
  createdColumns.filter(
    (c) => !['Wafer ID format', 'Physical Wafer'].includes(c.name),
  ),
  'old_',
  true,
);
export const middleCreated = makeSchema(
  'psf-created-information',
  2,
  createdColumns.filter((c) => c.name !== 'Wafer ID format').toReversed(),
  'middle_',
  true,
);
export const headers = [
  'Request No',
  'Status',
  'Request Date',
  'Updated At',
  ...requesterColumns.map((c) => c.label),
  ...historicalColumns.map((c) => c.label),
  ...createdColumns.map((c) => c.label),
];
assert.equal(headers.length, 76);

const TEXT_SAMPLES: Array<{ raw: unknown; cell: string }> = [
  {
    raw: 'ทดสอบภาษาไทย 😀 & <xml> "quoted" \'single\'',
    cell: 'ทดสอบภาษาไทย 😀 & <xml> "quoted" \'single\'',
  },
  { raw: '  trim outside, keep  inside  ', cell: 'trim outside, keep  inside' },
  { raw: 'line 1\nline 2\tTabbed', cell: 'line 1\nline 2\tTabbed' },
  { raw: 'line 1\r\nline 2', cell: 'line 1\r\nline 2' },
  { raw: null, cell: '' },
  { raw: '', cell: '' },
  { raw: [' A ', '', 'B', 17], cell: 'A, B' },
  { raw: false, cell: 'false' },
  { raw: { unsupported: 'object' }, cell: '' },
  { raw: '=1+1', cell: '=1+1' },
  { raw: '+SUM(A1:A2)', cell: '+SUM(A1:A2)' },
];
const NUMBER_SAMPLES: Array<{ raw: unknown; cell: Cell }> = [
  { raw: 0, cell: 0 },
  { raw: -17, cell: -17 },
  { raw: '0012.50', cell: 12.5 },
  { raw: 'legacy N/A', cell: 'legacy N/A' },
  { raw: null, cell: '' },
  { raw: '', cell: '' },
  { raw: '1e3', cell: '1e3' },
  { raw: '1,000', cell: '1,000' },
  { raw: ' 2.75 ', cell: 2.75 },
];
const OUTSIDE_CHOICE_SAMPLES: Array<{ raw: unknown; cell: string }> = [
  { raw: 6, cell: '6' },
  { raw: '6', cell: '6' },
  { raw: 200, cell: '200' },
  { raw: '200', cell: '200' },
  { raw: '0006', cell: '0006' },
  { raw: 'Retired choice (legacy)', cell: 'Retired choice (legacy)' },
  { raw: 'นอกตัวเลือก 😀 & <legacy>', cell: 'นอกตัวเลือก 😀 & <legacy>' },
  { raw: ['6', '200'], cell: '6, 200' },
];

export function sample(c: Column, i: number): { raw: unknown; cell: Cell } {
  const salt = columns.indexOf(c);
  if (c.type === 'number')
    return NUMBER_SAMPLES[(i + salt) % NUMBER_SAMPLES.length];
  if (c.type === 'date') {
    const value = `2026-10-${String((i % 28) + 1).padStart(2, '0')}T07:15:00+07:00`;
    return { raw: value, cell: value }; // Existing contract: dates in form data are text cells.
  }
  if (c.options.length) {
    const outside = OUTSIDE_CHOICE_SAMPLES[(i + salt) % 13];
    if (outside) return outside;
    const value = c.options[(i + salt) % c.options.length];
    return { raw: value, cell: value }; // Numeric-looking dropdown values stay text.
  }
  if (c.name.startsWith('12NC')) {
    const value = `00012345678901234567${String(i).padStart(6, '0')}`;
    return { raw: value, cell: value }; // Long identifiers must never become numbers.
  }
  if (c.name === 'Description' && i === 1) {
    const value = 'ก'.repeat(32_767);
    return { raw: value, cell: value };
  }
  if (c.generated) {
    const value = `SYSTEM:${c.key}:${i}`;
    return { raw: value, cell: value };
  }
  if (i % 13 === 0) {
    const value = `${c.key}:${i}`;
    return { raw: value, cell: value };
  }
  return TEXT_SAMPLES[(i + salt) % TEXT_SAMPLES.length];
}

export function identity(i: number) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    requestNo: `SYN-${String(i).padStart(8, '0')}`,
    createdAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
    updatedAt: new Date(
      Date.UTC(2026, 9, 1) + Math.floor(i / 3) * 1000,
    ).toISOString(),
    // Release is deliberately independent of the status name.
    releasedAt: i % 2 === 0 ? '2026-10-01T00:00:00.000Z' : null,
    status:
      i % 41 === 0
        ? 'Legacy status outside current choices'
        : statusOptions[i % statusOptions.length],
  };
}

export function source(i: number) {
  const who = identity(i);
  const requesterSchema =
    i % 4 === 0
      ? oldRequester
      : i % 4 === 1
        ? activeRequester
        : i % 4 === 2
          ? middleRequester
          : capturedRequester;
  const createdSchema =
    i % 3 === 0 ? oldCreated : i % 3 === 1 ? middleCreated : activeCreated;
  const requesterData: Record<string, unknown> = {};
  const createdData: Record<string, unknown> = {};
  const canonical: Record<string, unknown> = {};
  for (const field of requesterSchema.sections.flatMap((s) => s.fields)) {
    const c = columns.find((c) => c.key === field.canonicalKey)!;
    requesterData[field.fieldKey] = sample(c, i).raw;
    // Seed a genuine stored canonical projection, including nulls and arrays.
    const raw = sample(c, i).raw;
    canonical[c.key] =
      typeof raw === 'string'
        ? raw.trim() || null
        : Array.isArray(raw)
          ? raw
              .filter((v) => typeof v === 'string' && v.trim())
              .map((v) => (v as string).trim())
          : typeof raw === 'number' || typeof raw === 'boolean'
            ? raw
            : null;
  }
  if (i % 31 === 0) canonical.title = `CANONICAL:${i}`;
  for (const field of createdSchema.sections.flatMap((s) => s.fields)) {
    const c = columns.find((c) => c.key === field.canonicalKey)!;
    createdData[field.fieldKey] = sample(c, i).raw;
  }
  return {
    ...who,
    requesterSchema,
    createdSchema,
    requesterData,
    createdData,
    canonical: i % 5 === 0 ? null : canonical,
  };
}

// Expected cells come from the fixture specification, never exporter mapping/serialization helpers.
export function expectedRow(i: number, role: Role): Cell[] {
  const who = identity(i);
  const requester = requesterColumns.map((c) => {
    // Specify version membership independently of the schema/source constructors.
    if (c.name === 'Trench Thickness (um)' && [0, 2].includes(i % 4)) return '';
    if (c.name === 'Request For' && i % 4 === 0) return '';
    return c.name === 'Title' && i % 31 === 0 && i % 5 !== 0
      ? `CANONICAL:${i}`
      : sample(c, i).cell;
  });
  return [
    who.requestNo,
    who.status,
    who.createdAt,
    who.updatedAt,
    ...requester,
    ...historicalColumns.map((c, index) =>
      i % 4 === 0 || (i % 4 === 2 && index < 3) ? sample(c, i).cell : '',
    ),
    ...createdColumns.map((c) =>
      (!PSF_VISIBLE_WITHOUT_RELEASE[role] && who.releasedAt === null) ||
      (c.name === 'Wafer ID format' && i % 3 !== 2) ||
      (c.name === 'Physical Wafer' && i % 3 === 0)
        ? ''
        : sample(c, i).cell,
    ),
  ];
}

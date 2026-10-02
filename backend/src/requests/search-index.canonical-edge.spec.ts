import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_PSF_REQUEST_SCHEMA,
  PSF_CREATED_INFORMATION_SCHEMA,
  type FormSchemaField,
  type FormSchemaJson,
} from '../admin/form_schema.constants';
import { FormSchemaService } from '../admin/form_schema.service';
import { validateAndNormalizeFormData } from './form-data-validation';
import { RequestsController } from './requests.controller';
import { RequestsService, type RequesterData } from './requests.service';
import { SearchIndexService } from './search-index.service';

const actor = {
  id: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
  username: 'owner',
  displayName: 'Owner',
  role: 'requester' as const,
  setupOwnerDepartment: null,
};

function capturedSchema(): FormSchemaJson {
  return structuredClone(DEFAULT_PSF_REQUEST_SCHEMA);
}

function mappedField(schema: FormSchemaJson, canonicalKey: string) {
  return schema.sections
    .flatMap((section) => section.fields)
    .find((field) => field.canonicalKey === canonicalKey)!;
}

// Storage double only: production validation, capture, extraction and SQL emission
// execute normally. This suite does not execute or emulate PostgreSQL filtering.
function productionPath(schema: FormSchemaJson) {
  let saved: Record<string, unknown> | undefined;
  const storageQuery = jest.fn((sql: string, params: unknown[] = []) => {
    let rows: Record<string, unknown>[] = [];
    if (sql.includes('FROM form_definitions')) {
      const active =
        params[0] === schema.formKey ? schema : PSF_CREATED_INFORMATION_SCHEMA;
      rows = [
        {
          form_key: active.formKey,
          version: active.version,
          title: active.title,
          description: null,
          status: 'active',
          schema_json: active,
          published_at: '2026-10-01T00:00:00Z',
        },
      ];
    } else if (sql.includes("SELECT 'DRAFT-'")) {
      rows = [{ next: 'DRAFT-20261001-0001' }];
    } else if (sql.includes('INSERT INTO psf_requests')) {
      saved = {
        id: params[0],
        request_no: params[1],
        form_key: params[2],
        form_version: params[3],
        status: params[4],
        requester: params[5],
        requester_user_id: params[6],
        product_type: params[7],
        requester_data_json: params[8],
        schema_snapshot_json: params[9],
        psf_created_schema_snapshot_json: params[10],
        psf_created_data_json: {},
        setup_owner: null,
        setup_owner_role: null,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
        submitted_at: null,
        psf_created_at: null,
        completed_at: null,
        psf_released_at: null,
      };
      rows = [saved];
    } else if (sql.includes('WITH filtered') && saved) {
      rows = [{ ...saved, total_count: 1 }];
    }
    return Promise.resolve({ rows });
  });
  const client = { query: storageQuery, release: jest.fn() };
  const pool = {
    query: storageQuery,
    connect: jest.fn().mockResolvedValue(client),
  };
  const forms = new FormSchemaService(pool as never);
  const runtimeGuard = forms as unknown as {
    assertRuntimeSafeSchema: (
      schema: unknown,
      version: number,
      title: string,
      formKey: string,
    ) => void;
  };
  runtimeGuard.assertRuntimeSafeSchema(
    schema,
    schema.version,
    schema.title,
    schema.formKey,
  );
  const search = new SearchIndexService(pool as never);
  const service = new RequestsService(
    pool as never,
    forms,
    {} as never,
    search,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
  );
  const controller = new RequestsController(service, {
    getProfile: jest.fn().mockResolvedValue(actor),
  } as never);
  return { pool, search, service, controller };
}

describe('private Draft captured canonical edge production paths', () => {
  it.each([
    { flag: 'searchable', value: 'true' },
    { flag: 'searchable', value: true },
    { flag: 'exportable', value: 'true' },
    { flag: 'exportable', value: true },
    { flag: 'autofillTrigger', value: 'true' },
    { flag: 'autofillTrigger', value: true },
  ])(
    'requires JSON boolean eligibility for $flag=$value in both captured filters',
    async ({ flag, value }) => {
      const schema = capturedSchema();
      for (const key of ['priority', 'due_date'] as const) {
        Object.assign(mappedField(schema, key), {
          fieldKey: `legacy_${key}`,
          searchable: false,
          exportable: false,
          autofillTrigger: false,
          [flag]: value,
        });
      }
      // The real runtime guard accepts these optional flags even when strings.
      const path = productionPath(schema);
      const created = await path.service.createDraft(
        {
          requesterData: {
            legacy_priority: ' Urgent ',
            legacy_due_date: '2026-10-02',
          },
        },
        actor,
      );
      expect(created.schemaSnapshot).toEqual(schema);
      const canonical = path.search.extractCanonicalValues(
        schema,
        created.requesterData,
      );
      if (value === true) {
        expect(canonical).toMatchObject({
          priority: 'Urgent',
          due_date: '2026-10-02',
        });
      } else {
        expect(canonical).not.toHaveProperty('priority');
        expect(canonical).not.toHaveProperty('due_date');
      }
      path.pool.query.mockClear();
      const result = await path.controller.queryRequests(
        {
          scope: 'my-drafts',
          priority: 'Urgent',
          dueDateFrom: '2026-10-01',
          dueDateTo: '2026-10-02',
        },
        { session: { userId: actor.id } } as never,
      );
      expect(result.items[0]).toMatchObject({
        priority: value === true ? 'Urgent' : null,
        dueDate: value === true ? '2026-10-02' : null,
      });
      const [sql, params] = path.pool.query.mock.calls.find(([sql]) =>
        sql.includes('WITH filtered'),
      )!;
      expect(params).toEqual([
        actor.id,
        'Urgent',
        '2026-10-01',
        '2026-10-02',
        50,
        0,
      ]);
      const filtered = sql.split('totals AS')[0];
      for (const eligibility of [
        'searchable',
        'exportable',
        'autofillTrigger',
      ]) {
        expect(
          filtered.split(`field.value->'${eligibility}' = 'true'::jsonb`),
        ).toHaveLength(4);
        expect(filtered).not.toContain(
          `field.value->>'${eligibility}' = 'true'`,
        );
      }
      expect(filtered).toContain(
        "status = 'Draft' AND requester_user_id = $1::uuid",
      );
      expect(filtered).toContain("field.value->>'canonicalKey' = 'priority'");
      expect(filtered).toContain("field.value->>'canonicalKey' = 'due_date'");
      expect(filtered).toContain("SELECT field.value->>'fieldKey'");
      expect(sql).not.toContain('psf_request_search_index');
      expect(sql).not.toContain('canonical_submission_values');
      expect(
        path.pool.query.mock.calls.filter(([sql]) =>
          sql.includes('FROM form_definitions'),
        ),
      ).toHaveLength(0);
      expect(path.pool.query).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['populated', 'blank', 'missing'] as const)(
    'keeps the last strictly eligible duplicate mapping for %s historical values',
    async (values) => {
      const original = capturedSchema();
      const schema: FormSchemaJson = {
        ...original,
        sections: [
          {
            sectionKey: 'earlier',
            mappings: [{ prefix: 'early', flags: { searchable: true } }],
          },
          {
            sectionKey: 'later',
            mappings: [
              { prefix: 'other', flags: { exportable: true } },
              { prefix: 'winner', flags: { autofillTrigger: true } },
              {
                prefix: 'ignored',
                flags: {
                  searchable: 'true',
                  exportable: 'true',
                  autofillTrigger: 'true',
                },
              },
            ],
          },
          {
            sectionKey: 'last',
            mappings: [
              {
                prefix: 'last',
                flags: {
                  searchable: 'true',
                  exportable: 'true',
                  autofillTrigger: 'true',
                },
              },
            ],
          },
        ].map(({ sectionKey, mappings }) => ({
          sectionKey,
          title: sectionKey,
          fields: mappings.flatMap(({ prefix, flags }) =>
            (['priority', 'due_date'] as const).map(
              (key): FormSchemaField =>
                Object.assign(
                  {
                    ...mappedField(original, key),
                    fieldKey: `${prefix}_${key}`,
                    searchable: false,
                    exportable: false,
                    autofillTrigger: false,
                  },
                  flags,
                ),
            ),
          ),
        })),
      };
      // Historical capture only; duplicate canonical keys cannot be newly published.
      const data: RequesterData = {
        early_priority: 'Low',
        early_due_date: '2030-01-01',
        other_priority: 'Normal',
        other_due_date: '2026-10-01',
        ignored_priority: 'Low',
        ignored_due_date: '2030-01-01',
        last_priority: 'Low',
        last_due_date: '2030-01-01',
        priority: 'Low',
        due_date: '2030-01-01',
      };
      if (values !== 'missing') {
        data.winner_priority = values === 'blank' ? ' \t\n ' : ' Urgent ';
        data.winner_due_date = values === 'blank' ? ' \t\n ' : ' 2026-10-02 ';
      }
      const pool = {
        query: jest.fn().mockResolvedValue({
          rows: [
            {
              id: 'historical-id',
              request_no: 'DRAFT-historical',
              total_count: 1,
              schema_snapshot_json: schema,
              requester_data_json: data,
              created_at: '2026-10-01T00:00:00Z',
              updated_at: '2026-10-01T00:00:00Z',
            },
          ],
        }),
      };
      const search = new SearchIndexService(pool as never);
      const expected = {
        priority: values === 'populated' ? 'Urgent' : null,
        due_date: values === 'populated' ? '2026-10-02' : null,
      };
      expect(search.extractCanonicalValues(schema, data)).toEqual(expected);
      const result = await search.queryOwnDrafts(actor.id, {
        priority: 'Urgent',
        dueDateFrom: '2026-10-01',
        dueDateTo: '2026-10-02',
        setupOwnerRole: 'GNTC',
        limit: 1,
        offset: 900,
      });
      expect(result.items[0]).toMatchObject({
        priority: expected.priority,
        dueDate: expected.due_date,
      });
      const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual([
        actor.id,
        'Urgent',
        'GNTC',
        '2026-10-01',
        '2026-10-02',
        1,
        900,
      ]);
      const filtered = sql.split('totals AS')[0];
      expect(
        filtered.split(
          'ORDER BY section.position DESC, field.position DESC LIMIT 1',
        ),
      ).toHaveLength(4);
      expect(filtered.split("SELECT field.value->>'fieldKey'")).toHaveLength(4);
      expect(filtered).toContain(
        'NULLIF(REGEXP_REPLACE(requester_data_json ->> (',
      );
      expect(filtered).toContain(
        "'^[[:space:]]+|[[:space:]]+$', '', 'g'), '')",
      );
      expect(filtered).toContain('LOWER(setup_owner_role) = LOWER($3)');
      expect(sql).toContain(
        'totals AS (SELECT COUNT(*)::int AS total_count FROM filtered)',
      );
      expect(sql).toContain('LIMIT $6 OFFSET $7');
      expect(sql).not.toContain('form_definitions');
      expect(sql).not.toContain('psf_request_search_index');
      expect(pool.query).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['text', 'textarea'] as const)(
    'keeps supported %s due_date data but emits guarded calendar conversion for both SQL bounds',
    async (type) => {
      const schema = capturedSchema();
      const due = mappedField(schema, 'due_date');
      due.fieldKey = 'deadline_legacy_7';
      due.type = type;
      const path = productionPath(schema);
      const input = { deadline_legacy_7: '  not-a-date  ' };
      expect(
        validateAndNormalizeFormData(schema, input, {
          allowMissingRequired: true,
        }),
      ).toEqual({ deadline_legacy_7: 'not-a-date' });
      const dateSchema = structuredClone(schema);
      mappedField(dateSchema, 'due_date').type = 'date';
      expect(() =>
        validateAndNormalizeFormData(dateSchema, input, {
          allowMissingRequired: true,
        }),
      ).toThrow(BadRequestException);
      const created = await path.service.createDraft(
        { requesterData: input },
        actor,
      );
      expect(created.requesterData.deadline_legacy_7).toBe('not-a-date');
      expect(created.schemaSnapshot).toEqual(schema);
      expect(path.pool.query).toHaveBeenCalledWith('COMMIT');
      expect(
        path.pool.query.mock.calls.some(([sql]) =>
          sql.includes('INSERT INTO psf_request_search_index'),
        ),
      ).toBe(false);
      const result = await path.controller.queryRequests(
        {
          scope: 'my-drafts',
          dueDateFrom: '2026-10-01',
          dueDateTo: '2026-10-02',
          limit: '1',
          offset: '900',
        },
        { session: { userId: actor.id } } as never,
      );
      // The returned row is the storage double's row, not a claimed SQL match.
      expect(result.items[0].dueDate).toBe('not-a-date');
      const [sql, params] = path.pool.query.mock.calls.find(([sql]) =>
        sql.includes('WITH filtered'),
      )!;
      expect(params).toEqual([actor.id, '2026-10-01', '2026-10-02', 1, 900]);
      const filtered = sql.split('totals AS')[0];
      expect(filtered).toContain(
        "status = 'Draft' AND requester_user_id = $1::uuid",
      );
      expect(filtered).toContain("field.value->>'canonicalKey' = 'due_date'");
      expect(filtered).toContain('CASE');
      expect(filtered).toContain("due_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
      expect(filtered).toContain("LEFT(due_text, 4) <> '0000'");
      expect(filtered).toContain(
        "SUBSTRING(due_text, 6, 2) BETWEEN '01' AND '12'",
      );
      expect(filtered).toContain(
        "SUBSTRING(due_text, 9, 2) BETWEEN '01' AND '31'",
      );
      expect(filtered).toMatch(
        /THEN CASE\s+WHEN SUBSTRING\(due_text, 9, 2\)::int <= EXTRACT\(DAY FROM/,
      );
      expect(filtered).toContain("+ INTERVAL '1 month - 1 day'");
      expect(filtered).toMatch(
        /THEN make_date\([\s\S]*ELSE NULL END\s+ELSE NULL END/,
      );
      expect(filtered).not.toContain(')::date');
      expect(filtered).not.toContain('pg_input_is_valid');
      expect(filtered.match(/SELECT field.value->>'fieldKey'/g)).toHaveLength(
        2,
      );
      expect(filtered).toContain('>= $2::date');
      expect(filtered).toContain("< ($3::date + INTERVAL '1 day')");
      expect(sql).toContain(
        'totals AS (SELECT COUNT(*)::int AS total_count FROM filtered)',
      );
      expect(sql).toContain('LIMIT $4 OFFSET $5');
      expect(sql).toContain('totals LEFT JOIN page ON TRUE');
    },
  );
});

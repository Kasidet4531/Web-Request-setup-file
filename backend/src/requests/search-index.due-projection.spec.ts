import type { Pool } from 'pg';
import {
  DEFAULT_PSF_REQUEST_SCHEMA,
  PSF_CREATED_INFORMATION_SCHEMA,
} from '../admin/form_schema.constants';
import {
  FormSchemaService,
  type FormSchemaJson,
} from '../admin/form_schema.service';
import type { WorkflowTransitionService } from '../admin/workflow_transition.service';
import type { AuditLogService } from '../audit/audit_log.service';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import { validateAndNormalizeFormData } from './form-data-validation';
import { RequestsService } from './requests.service';
import {
  SearchIndexService,
  type CanonicalValue,
  type CanonicalValues,
  type RequestSearchIndexSource,
} from './search-index.service';

const revision = '2026-10-01T00:00:00.123456Z';
const actor: AuthenticatedUserProfile = {
  id: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
  username: 'owner',
  displayName: 'Owner',
  role: 'requester',
  setupOwnerDepartment: null,
};
const source: RequestSearchIndexSource = {
  requestId: actor.id,
  requestNo: 'REQUEST-1',
  status: 'Work',
  requester: actor.displayName,
  requesterUserId: actor.id,
  setupOwner: null,
  setupOwnerRole: null,
  productType: null,
  requestDate: revision,
  updatedAt: revision,
};

const cases: Array<[CanonicalValue | undefined, string | null]> = [
  ['2026-10-02', '2026-10-02'],
  ['2024-02-29', '2024-02-29'],
  ['2000-02-29', '2000-02-29'],
  ['0001-01-01', '0001-01-01'],
  [' 2026-10-02 ', '2026-10-02'],
  ['2023-02-29', null],
  ['1900-02-29', null],
  ['2026-02-30', null],
  ['2026-04-31', null],
  ['2026-13-01', null],
  ['2026-01-00', null],
  ['0000-01-01', null],
  ['not-a-date', null],
  ['2026-1-2', null],
  ['2026-10-02T00:00:00Z', null],
  ['   ', null],
  ['', null],
  [null, null],
  [undefined, null],
  [42, null],
  [true, null],
  [['2026-10-02'], null],
];

describe('shared search-index due-date projection', () => {
  it.each(cases)(
    'projects %p as %p without changing canonical or metadata values',
    async (due, expected) => {
      const query = jest.fn().mockResolvedValue({ rows: [] });
      const service = new SearchIndexService({ query } as unknown as Pool);
      const canonical: CanonicalValues =
        due === undefined ? {} : { due_date: due };
      const original = structuredClone(canonical);
      await service.upsertRequestSearchIndex(source, canonical);
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('$15::timestamp');
      expect(params[14]).toBe(expected);
      expect(params[13]).toBe(revision);
      expect(params[15]).toBe(revision);
      expect(canonical).toEqual(original);
    },
  );
});

function completeData(schema: FormSchemaJson): Record<string, string> {
  const data: Record<string, string> = {};
  for (const field of schema.sections.flatMap((section) => section.fields)) {
    if (field.required) {
      data[field.fieldKey] =
        field.type === 'date'
          ? '2026-10-02'
          : field.type === 'select' || field.type === 'radio'
            ? field.options![0]
            : 'value';
    }
  }
  if (Object.hasOwn(data, 'requester_name'))
    data.requester_name = actor.displayName;
  return data;
}

describe.each(['text', 'textarea'] as const)(
  'captured historical %s due-date through all production callers',
  (type) => {
    it.each(['submit', 'requester-save', 'psf-save', 'status'] as const)(
      '%s preserves raw text and projects NULL in the same transaction',
      async (operation) => {
        const schema = structuredClone(DEFAULT_PSF_REQUEST_SCHEMA);
        const dueField = schema.sections
          .flatMap((section) => section.fields)
          .find((field) => field.canonicalKey === 'due_date')!;
        Object.assign(dueField, {
          fieldKey: 'deadline_legacy_7',
          type,
          searchable: true,
        });
        const runtimeValidator = new FormSchemaService(
          {} as Pool,
        ) as unknown as {
          assertRuntimeSafeSchema: (
            schema: FormSchemaJson,
            version: number,
            title: string,
            formKey: string,
          ) => void;
        };
        runtimeValidator.assertRuntimeSafeSchema(
          schema,
          schema.version,
          schema.title,
          schema.formKey,
        );
        const data: Record<string, string> = {
          ...completeData(schema),
          deadline_legacy_7: 'not-a-date',
        };
        const normalized = validateAndNormalizeFormData(schema, data, {
          allowMissingRequired: false,
        });
        expect(normalized.deadline_legacy_7).toBe('not-a-date');
        const request = {
          id: actor.id,
          request_no: 'REQUEST-1',
          form_key: schema.formKey,
          form_version: schema.version,
          status: operation === 'submit' ? 'Draft' : 'Other work',
          requester: actor.displayName,
          requester_user_id: actor.id,
          setup_owner: null,
          setup_owner_role: null,
          product_type: data.product_type ?? null,
          requester_data_json: data,
          psf_created_data_json: {},
          schema_snapshot_json: schema,
          psf_created_schema_snapshot_json: PSF_CREATED_INFORMATION_SCHEMA,
          created_at: revision,
          updated_at: revision,
          updated_at_version: revision,
          submitted_at: null,
          psf_created_at: null,
          psf_released_at: null,
          completed_at: null,
        };
        const query = jest.fn((sql: string) => {
          if (sql.includes('FROM psf_requests') && sql.includes('FOR UPDATE'))
            return { rows: [request] };
          if (sql.includes('UPDATE psf_requests'))
            return {
              rows: [
                {
                  ...request,
                  status:
                    operation === 'submit' || operation === 'status'
                      ? 'Work'
                      : request.status,
                },
              ],
            };
          return { rows: [], rowCount: 1 };
        });
        const client = { query, release: jest.fn() };
        const pool = { connect: () => client } as unknown as Pool;
        const search = new SearchIndexService(pool);
        const forms = {
          getActiveSchemaForUpdate: () => ({
            version: schema.version,
            schema,
          }),
        };
        const workflow = {
          lockConfiguration: () => ({
            entries: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                name: 'Draft',
                kind: 'draft',
              },
              {
                id: '00000000-0000-4000-8000-000000000002',
                name: 'Work',
                kind: 'open',
              },
            ],
            psfVisibilityTriggerId: null,
          }),
        };
        const record = jest
          .fn<Promise<void>, [unknown, unknown]>()
          .mockResolvedValue(undefined);
        const requests = new RequestsService(
          pool,
          forms as unknown as FormSchemaService,
          workflow as unknown as WorkflowTransitionService,
          search,
          { record } as unknown as AuditLogService,
        );
        let result;
        if (operation === 'submit')
          result = await requests.submitRequest(
            request.id,
            {
              formVersion: schema.version,
              status: 'Work',
              expectedUpdatedAt: revision,
            },
            actor,
          );
        if (operation === 'requester-save')
          result = await requests.updateDraftRequesterData(
            request.id,
            {
              formVersion: schema.version,
              requesterData: normalized,
              expectedUpdatedAt: revision,
            },
            actor,
          );
        if (operation === 'psf-save')
          result = await requests.updatePsfCreatedData(request.id, {
            actor: { ...actor, role: 'admin' },
            psfCreatedData: completeData(PSF_CREATED_INFORMATION_SCHEMA),
            expectedUpdatedAt: revision,
          });
        if (operation === 'status')
          result = await requests.updateRequestStatus(request.id, {
            actor,
            status: 'Work',
            expectedUpdatedAt: revision,
          });
        const calls = query.mock.calls as unknown as Array<
          [string, unknown[]?]
        >;
        const indexWrites = calls.filter(([sql]) =>
          sql.includes('INSERT INTO psf_request_search_index'),
        );
        expect(indexWrites).toHaveLength(1);
        expect(indexWrites[0][1]![14]).toBeNull();
        expect(indexWrites[0][1]![13]).toBe(revision);
        expect(indexWrites[0][1]![15]).toBe(revision);
        expect(result?.requesterData.deadline_legacy_7).toBe('not-a-date');
        expect(request.requester_data_json.deadline_legacy_7).toBe(
          'not-a-date',
        );
        expect(search.extractCanonicalValues(schema, data).due_date).toBe(
          'not-a-date',
        );
        if (operation === 'submit' || operation === 'requester-save') {
          const canonicalWrite = calls.find(([sql]) =>
            sql.includes('INSERT INTO canonical_submission_values'),
          )!;
          const canonicalRows = JSON.parse(
            canonicalWrite[1]![1] as string,
          ) as Array<{ canonicalKey: string; value: unknown }>;
          expect(
            canonicalRows.find((row) => row.canonicalKey === 'due_date')?.value,
          ).toBe('not-a-date');
          const requestWrite = calls.find(([sql]) =>
            sql.includes('UPDATE psf_requests'),
          )!;
          expect(
            (
              requestWrite[1]![operation === 'submit' ? 3 : 2] as Record<
                string,
                unknown
              >
            ).deadline_legacy_7,
          ).toBe('not-a-date');
        }
        const update = calls.find(([sql]) =>
          sql.includes('UPDATE psf_requests'),
        )!;
        expect(update[1]!.at(-1)).toBe(revision);
        expect(
          calls
            .filter(([sql]) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql))
            .map(([sql]) => sql),
        ).toEqual(['BEGIN', 'COMMIT']);
        expect(record).toHaveBeenCalledTimes(1);
        expect(record.mock.calls[0][1]).toBe(client);
        expect(client.release).toHaveBeenCalledTimes(1);
      },
    );
  },
);

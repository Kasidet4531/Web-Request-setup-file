import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { WorkflowTransitionService } from '../admin/workflow_transition.service';
import { ExportController } from '../export/export.controller';
import { ExportJobProcessor } from '../export/export-job.processor';
import { ExportJobRepository } from '../export/export-job.repository';
import { ExcelExportService } from '../export/excel_export.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { SearchIndexService } from './search-index.service';

const STATUS = '  New work  ';
const ACTOR = {
  id: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
  username: 'owner',
  displayName: 'Owner',
  role: 'requester' as const,
  setupOwnerDepartment: null,
};
const SCHEMA = {
  formKey: 'psf-request',
  version: 1,
  title: 'Captured',
  sections: [],
};

describe('verbatim catalog status filter production paths', () => {
  let count: number;
  let storedJob: Record<string, unknown> | undefined;
  let pool: { query: jest.Mock };
  let list: RequestsController;
  let exports: ExportController;
  let processor: ExportJobProcessor;
  let response: Response;
  let end: jest.Mock<void, [Buffer]>;
  const request = { session: { userId: ACTOR.id } };

  beforeEach(() => {
    count = 1;
    storedJob = undefined;
    pool = {
      query: jest.fn((sql: string, params: unknown[] = []) => {
        let rows: Record<string, unknown>[] = [];
        if (sql.includes('SELECT config_json')) {
          rows = [
            {
              config_json: {
                entries: [
                  {
                    id: '00000000-0000-4000-8000-000000000001',
                    name: 'Draft',
                    kind: 'draft',
                  },
                  {
                    id: '00000000-0000-4000-8000-000000000002',
                    name: STATUS,
                    kind: 'open',
                  },
                ],
                psfVisibilityTriggerId: null,
              },
              updated_at_version: '2026-10-01T01:02:03.123456Z',
            },
          ];
        } else if (sql.includes('WITH filtered')) {
          rows = [
            {
              request_id: null,
              total_count: 1,
              open_count: 1,
              overdue_count: 0,
              completed_count: 0,
            },
          ];
        } else if (sql.includes('SELECT COUNT(*)::int AS total')) {
          rows = [{ total: count }];
        } else if (sql.includes('INSERT INTO psf_export_jobs')) {
          storedJob = {
            id: params[0],
            owner_user_id: params[1],
            owner_role: params[2],
            filters_json: params[3],
            status: 'queued',
            attempt_count: 0,
            queued_at: '2026-10-01T01:02:03Z',
            started_at: null,
            claimed_at: null,
            completed_at: null,
            failed_at: null,
            filename: null,
            failure_message: null,
            claim_token: null,
          };
          rows = [storedJob];
        } else if (sql.includes('WITH candidate') && storedJob) {
          storedJob = {
            ...storedJob,
            status: 'running',
            claim_token: params[0],
          };
          rows = [storedJob];
        } else if (sql.includes("SET status = 'completed'") && storedJob) {
          storedJob = {
            ...storedJob,
            status: 'completed',
            filename: params[2],
            content: params[3],
          };
        } else if (sql.includes('request.id AS request_id')) {
          rows = [
            {
              request_id: 'request-1',
              request_no: 'PSF-1',
              status: STATUS,
              requester: 'Owner',
              setup_owner: null,
              setup_owner_role: null,
              product_type: null,
              request_date: '2026-10-01T01:02:03Z',
              updated_at: '2026-10-01T01:02:03.123456Z',
              requester_data_json: {},
              psf_created_data_json: {},
              psf_released_at: null,
              schema_snapshot_json: SCHEMA,
              canonical_values_json: {},
              total_count: 1,
            },
          ];
        }
        return Promise.resolve({ rows, rowCount: 1 });
      }),
    };
    const search = new SearchIndexService(pool as never);
    const workflow = new WorkflowTransitionService(pool as never, {} as never);
    const service = new RequestsService(
      pool as never,
      {} as never,
      workflow,
      search,
      {} as never,
    );
    const auth = { getProfile: jest.fn().mockResolvedValue(ACTOR) };
    list = new RequestsController(service, auth as never);
    const schemas = {
      getActiveSchema: jest.fn().mockResolvedValue({ schema: SCHEMA }),
    };
    const excel = new ExcelExportService(search, schemas as never);
    const jobs = new ExportJobRepository(pool as never);
    const config = new ConfigService({ EXPORT_SYNC_THRESHOLD: 1 });
    exports = new ExportController(excel, auth as never, search, jobs, config);
    processor = new ExportJobProcessor(jobs, excel, config);
    end = jest.fn<void, [Buffer]>();
    response = {
      setHeader: jest.fn(),
      end,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
  });

  it('binds the exact selected token before shared list totals and independent summaries, without changing ordinary text trimming', async () => {
    const result = await list.queryRequests(
      { status: STATUS, requester: '  Owner  ', priority: '  High  ' },
      request as never,
    );
    expect(result).toMatchObject({
      total: 1,
      summary: { open: 1, overdue: 0, completed: 0 },
    });
    const [sql, params] = pool.query.mock.calls.find(([sql]) =>
      String(sql).includes('WITH filtered'),
    ) as [string, unknown[]];
    expect(params).toEqual([STATUS, 'High', 'Owner', [STATUS], [], 50, 0]);
    expect(sql).toContain("status <> 'Draft' AND LOWER(status) = LOWER($1)");
    expect(sql).toContain('FROM filtered');
    expect(sql).toContain(
      'totals AS (SELECT COUNT(*)::int AS total_count FROM visible)',
    );
  });

  it.each([false, true])(
    'preserves count/render query tokens and workbook status for queued=%s',
    async (queued) => {
      count = queued ? 2 : 1;
      await exports.exportRequests(
        { status: STATUS },
        request as never,
        response,
      );
      if (queued) {
        expect(storedJob).toMatchObject({
          owner_user_id: ACTOR.id,
          owner_role: ACTOR.role,
          filters_json: JSON.stringify({ status: STATUS }),
        });
        await processor.processNext();
        expect(storedJob?.status).toBe('completed');
      }
      const queries = pool.query.mock.calls.filter(
        ([sql]) =>
          String(sql).includes('SELECT COUNT(*)::int AS total') ||
          String(sql).includes('request.id AS request_id'),
      ) as [string, unknown[]][];
      expect(queries).toHaveLength(2);
      for (const [sql, params] of queries) {
        expect(params.slice(0, 2)).toEqual([ACTOR.id, STATUS]);
        expect(sql).toContain('LOWER(request.status) = LOWER($2)');
        expect(sql).toContain(
          "request.status <> 'Draft' OR request.requester_user_id = $1::uuid",
        );
      }
      const content = queued ? storedJob?.content : end.mock.calls[0]?.[0];
      expect(content).toBeInstanceOf(Buffer);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(content as never);
      expect(workbook.worksheets[0].getCell('B2').value).toBe(STATUS);
    },
  );

  it.each([['New work'], { value: STATUS }, 42, null])(
    'rejects a nonscalar status %p before request/export query storage',
    async (status) => {
      await expect(
        list.queryRequests({ status }, request as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        exports.exportRequests({ status }, request as never, response),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pool.query).not.toHaveBeenCalled();
    },
  );

  it.each(['requester', 'admin', 'setup_owner'] as const)(
    'routes %s My draft ordinary filters through the actual controller/service to private actor-bound SQL',
    async (role) => {
      const actor = {
        ...ACTOR,
        role,
        setupOwnerDepartment: role === 'setup_owner' ? ('GNTC' as const) : null,
      };
      const draftPool = {
        query: jest.fn().mockResolvedValue({
          rows: [{ id: null, schema_snapshot_json: null, total_count: 2 }],
        }),
      };
      const search = new SearchIndexService(draftPool as never);
      const service = new RequestsService(
        draftPool as never,
        {} as never,
        {} as never,
        search,
        {} as never,
      );
      const controller = new RequestsController(service, {
        getProfile: jest.fn().mockResolvedValue(actor),
      } as never);
      const result = await controller.queryRequests(
        {
          scope: 'my-drafts',
          priority: ' Urgent ',
          dueDateFrom: '2026-10-01',
          dueDateTo: '2026-10-02',
          limit: '1',
          offset: '900',
        },
        request as never,
      );
      expect(result).toEqual({
        items: [],
        total: 2,
        limit: 1,
        offset: 900,
        summary: { open: 0, overdue: 0, completed: 0 },
      });
      const [sql, params] = draftPool.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(params).toEqual([
        actor.id,
        'Urgent',
        '2026-10-01',
        '2026-10-02',
        1,
        900,
      ]);
      expect(sql).toContain(
        "status = 'Draft' AND requester_user_id = $1::uuid",
      );
      expect(sql).toContain("field.value->>'canonicalKey' = 'priority'");
      expect(sql).toContain("field.value->>'canonicalKey' = 'due_date'");
      expect(sql).not.toContain('psf_request_search_index');
      expect(draftPool.query).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { dueDateFrom: '2026-02-30' },
    { dueDateTo: '2026-02-30' },
    { dueDateFrom: ['2026-10-01'] },
    { dueDateTo: ['2026-10-02'] },
    { priority: ['Urgent'] },
    { setupOwnerRole: ['GNTC'] },
    { dueDateFrom: '2026-10-02', dueDateTo: '2026-10-01' },
  ])(
    'keeps My draft scalar/calendar validation %p before SQL',
    async (filters) => {
      await expect(
        list.queryRequests(
          { scope: 'my-drafts', ...filters },
          request as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pool.query).not.toHaveBeenCalled();
    },
  );

  it('keeps export blank-status omission', async () => {
    await exports.exportRequests({ status: '   ' }, request as never, response);
    const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([ACTOR.id]);
  });
});

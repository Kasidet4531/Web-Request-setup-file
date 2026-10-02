import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import type { Pool } from 'pg';
import {
  DEFAULT_PSF_REQUEST_SCHEMA,
  PSF_CREATED_INFORMATION_SCHEMA,
} from '../admin/form_schema.constants';
import type { FormSchemaService } from '../admin/form_schema.service';
import type { AuthService } from '../auth/auth.service';
import type {
  AuthenticatedRequest,
  AuthenticatedUserProfile,
} from '../auth/session.types';
import { SearchIndexService } from '../requests/search-index.service';
import { ExcelExportService } from './excel_export.service';
import { ExportController } from './export.controller';
import { ExportJobProcessor } from './export-job.processor';
import { ExportJobRepository } from './export-job.repository';

const ownerId = '00000000-0000-4000-8000-000000000001';
const foreignId = '00000000-0000-4000-8000-000000000099';
const jobId = '2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49';
const revision = '2026-10-01T00:00:00.123456Z';

// Real controller/repository/processor/mapper/XLSX; only profile/storage are doubled.
function lifecycle(ownerRole: 'admin' | 'requester' = 'admin') {
  let profile: AuthenticatedUserProfile | null = {
    id: ownerId,
    username: 'owner',
    displayName: 'Owner',
    role: ownerRole,
    setupOwnerDepartment: null,
  };
  const stored = {
    id: jobId,
    owner_user_id: ownerId,
    owner_role: ownerRole,
    filters_json: {},
    status: 'queued',
    attempt_count: 0,
    queued_at: revision,
    started_at: null,
    claimed_at: null,
    completed_at: null as string | null,
    failed_at: null,
    filename: null as string | null,
    content: null as Buffer | null,
    failure_message: null,
    claim_token: null as string | null,
  };
  const psfField = PSF_CREATED_INFORMATION_SCHEMA.sections.flatMap(
    (s) => s.fields,
  )[0];
  const pool = {
    query: jest.fn((sql: string, params: unknown[] = []) => {
      if (sql.includes('WITH candidate AS')) {
        stored.status = 'running';
        stored.claim_token = String(params[0]);
        return { rows: [{ ...stored }], rowCount: 1 };
      }
      if (sql.includes("SET status = 'completed'")) {
        stored.status = 'completed';
        stored.completed_at = revision;
        stored.filename = params[2] as string;
        stored.content = params[3] as Buffer;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FROM psf_export_jobs') && sql.includes('WHERE id =')) {
        expect(sql).toContain('owner_user_id = $2::uuid');
        return { rows: params[1] === ownerId ? [{ ...stored }] : [] };
      }
      if (sql.includes('FROM psf_requests AS request')) {
        const requesterScoped = sql.includes('AND request.requester_user_id =');
        return {
          rows: [
            {
              request_id: requesterScoped ? ownerId : foreignId,
              request_no: requesterScoped ? 'OWN-REQUEST' : 'FOREIGN-WORK',
              status: 'Work',
              requester: 'Owner',
              requester_user_id: requesterScoped ? ownerId : foreignId,
              setup_owner: null,
              setup_owner_role: null,
              product_type: null,
              request_date: revision,
              updated_at: revision,
              requester_data_json: {},
              psf_created_data_json: { [psfField.fieldKey]: 'UNRELEASED-PSF' },
              psf_released_at: null,
              psf_created_schema_snapshot_json: PSF_CREATED_INFORMATION_SCHEMA,
              schema_snapshot_json: DEFAULT_PSF_REQUEST_SCHEMA,
              canonical_values_json: null,
              total_count: 1,
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
  const repository = new ExportJobRepository(pool as unknown as Pool);
  const search = new SearchIndexService(pool as unknown as Pool);
  const forms = {
    getActiveSchema: (key: string) => ({
      schema:
        key === 'psf-request'
          ? DEFAULT_PSF_REQUEST_SCHEMA
          : PSF_CREATED_INFORMATION_SCHEMA,
    }),
  };
  const excel = new ExcelExportService(
    search,
    forms as unknown as FormSchemaService,
  );
  const config = new ConfigService();
  const controller = new ExportController(
    excel,
    { getProfile: () => profile } as unknown as AuthService,
    search,
    repository,
    config,
  );
  const processor = new ExportJobProcessor(repository, excel, config);
  const response = { setHeader: jest.fn(), end: jest.fn() };
  const request = (userId: string | undefined = ownerId) =>
    ({ session: { userId }, role: 'admin' }) as unknown as AuthenticatedRequest;
  return {
    controller,
    processor,
    stored,
    pool,
    response,
    request,
    setProfile: (value: AuthenticatedUserProfile | null) => {
      profile = value;
    },
    setRole: (role: AuthenticatedUserProfile['role']) => {
      profile = { ...profile!, role };
    },
    download: () =>
      controller.downloadExportJob(
        jobId,
        request(),
        response as unknown as Response,
      ),
    status: () => controller.getExportJob(jobId, request()),
  };
}

async function expectDenied(
  state: ReturnType<typeof lifecycle>,
  error:
    | typeof NotFoundException
    | typeof ForbiddenException
    | typeof UnauthorizedException,
) {
  await expect(state.status()).rejects.toBeInstanceOf(error);
  await expect(state.download()).rejects.toBeInstanceOf(error);
  expect(state.response.setHeader).not.toHaveBeenCalled();
  expect(state.response.end).not.toHaveBeenCalled();
}

async function cells(content: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(content as unknown as ExcelJS.Buffer);
  return workbook.worksheets[0].getRow(2).values;
}

describe('queued exports current server-profile scope', () => {
  it.each(['queued', 'running'])(
    'denies %s admin-scope metadata after demotion',
    async (status) => {
      const state = lifecycle();
      state.stored.status = status;
      state.setRole('requester');
      await expectDenied(state, NotFoundException);
    },
  );

  it('denies admin-scope status and worker-produced bytes when demoted before processing', async () => {
    const state = lifecycle();
    state.setRole('requester');
    await state.processor.processNext();
    expect(state.stored.status).toBe('completed');
    await expect(state.download()).rejects.toBeInstanceOf(NotFoundException);
    expect(await cells(state.stored.content!)).toEqual(
      expect.arrayContaining(['FOREIGN-WORK', 'UNRELEASED-PSF']),
    );
    await expectDenied(state, NotFoundException);
  });

  it('allows unchanged admin then denies already-completed bytes after demotion', async () => {
    const state = lifecycle();
    await state.processor.processNext();
    await expect(state.status()).resolves.toHaveProperty('downloadUrl');
    await state.download();
    expect(state.response.end).toHaveBeenCalledWith(state.stored.content);
    expect(state.response.setHeader).toHaveBeenCalledTimes(2);
    state.response.end.mockClear();
    state.response.setHeader.mockClear();
    state.setRole('requester');
    await expectDenied(state, NotFoundException);
  });

  it.each(['requester', 'admin'] as const)(
    'allows own requester-scope workbook with current %s role without expanding its scope',
    async (role) => {
      const state = lifecycle('requester');
      state.setRole(role);
      await state.processor.processNext();
      expect(await cells(state.stored.content!)).toContain('OWN-REQUEST');
      expect(await cells(state.stored.content!)).not.toContain(
        'UNRELEASED-PSF',
      );
      await expect(state.status()).resolves.toHaveProperty('downloadUrl');
      await state.download();
      expect(state.response.end).toHaveBeenCalledWith(state.stored.content);
    },
  );

  it.each(['admin', 'requester'] as const)(
    'denies foreign-owner %s even with compatible job scope',
    async (role) => {
      const state = lifecycle('requester');
      state.setProfile({
        id: foreignId,
        username: 'foreign',
        displayName: 'Foreign',
        role,
        setupOwnerDepartment: null,
      });
      await state.processor.processNext();
      await expectDenied(state, NotFoundException);
    },
  );

  it('denies SetupOwner on both lifecycle endpoints before storage', async () => {
    const state = lifecycle();
    state.setRole('setup_owner');
    await expectDenied(state, ForbiddenException);
    expect(state.pool.query).not.toHaveBeenCalled();
  });

  it('denies missing server profile on both endpoints before storage', async () => {
    const state = lifecycle();
    state.setProfile(null);
    await expectDenied(state, UnauthorizedException);
    expect(state.pool.query).not.toHaveBeenCalled();
  });

  it('denies unauthenticated sessions on both endpoints before storage', async () => {
    const state = lifecycle();
    const request = { session: {} } as AuthenticatedRequest;
    await expect(
      state.controller.getExportJob(jobId, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      state.controller.downloadExportJob(
        jobId,
        request,
        state.response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(state.pool.query).not.toHaveBeenCalled();
    expect(state.response.setHeader).not.toHaveBeenCalled();
    expect(state.response.end).not.toHaveBeenCalled();
  });
});

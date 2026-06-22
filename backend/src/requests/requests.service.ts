import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import {
  FormSchemaJson,
  FormSchemaService,
} from '../admin/form_schema.service';
import { DATABASE_POOL } from '../database/database.service';
import {
  RequestSearchFilters,
  RequestSearchResult,
  SearchIndexService,
} from './search-index.service';

const PSF_REQUEST_FORM_KEY = 'psf-request';
const DRAFT_STATUS = 'Draft';
const SUBMITTED_STATUS = 'Submitted';

export type RequesterData = Record<string, unknown>;

export interface CreateDraftRequestDto {
  requester?: string;
  requesterData: RequesterData;
}

export interface UpdateDraftRequesterDataDto {
  requester?: string;
  requesterData: RequesterData;
}

export interface SubmitDraftRequestDto {
  formVersion: number;
}

export type RequestQueryDto = RequestSearchFilters;

export interface PsfRequestResponse {
  id: string;
  requestNo: string;
  formKey: string;
  formVersion: number;
  status: string;
  requester: string | null;
  setupOwner: string | null;
  setupOwnerRole: string | null;
  productType: string | null;
  requesterData: RequesterData;
  psfCreatedData: RequesterData;
  schemaSnapshot: FormSchemaJson;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  psfCreatedAt: string | null;
  completedAt: string | null;
}

interface PsfRequestRow {
  id: string;
  request_no: string;
  form_key: string;
  form_version: number;
  status: string;
  requester: string | null;
  setup_owner: string | null;
  setup_owner_role: string | null;
  product_type: string | null;
  requester_data_json: RequesterData;
  psf_created_data_json: RequesterData;
  schema_snapshot_json: FormSchemaJson;
  created_at: Date | string;
  updated_at: Date | string;
  submitted_at: Date | string | null;
  psf_created_at: Date | string | null;
  completed_at: Date | string | null;
}

@Injectable()
export class RequestsService implements OnModuleInit {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly formSchemaService: FormSchemaService,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureRequestsStorage();
  }

  async createDraft(dto: CreateDraftRequestDto): Promise<PsfRequestResponse> {
    const activeSchema =
      await this.formSchemaService.getActiveSchema(PSF_REQUEST_FORM_KEY);
    const requestNo = await this.nextDraftRequestNo();
    const requester = this.normalizeString(
      dto.requester ?? dto.requesterData.requester_name,
    );
    const productType = this.normalizeString(dto.requesterData.product_type);

    const result = await this.pool.query<PsfRequestRow>(
      `
        INSERT INTO psf_requests (
          id,
          request_no,
          form_key,
          form_version,
          status,
          requester,
          product_type,
          requester_data_json,
          psf_created_data_json,
          schema_snapshot_json,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, '{}'::jsonb, $9::jsonb, NOW(), NOW())
        RETURNING *
      `,
      [
        randomUUID(),
        requestNo,
        activeSchema.formKey,
        activeSchema.version,
        DRAFT_STATUS,
        requester,
        productType,
        dto.requesterData,
        activeSchema.schema,
      ],
    );

    return this.mapRequestRow(result.rows[0]);
  }

  async queryRequests(query: RequestQueryDto): Promise<RequestSearchResult> {
    return this.searchIndexService.queryRequests({
      ...query,
      limit: this.parseOptionalNumber(query.limit),
      offset: this.parseOptionalNumber(query.offset),
    });
  }

  async getRequest(id: string): Promise<PsfRequestResponse> {
    const result = await this.pool.query<PsfRequestRow>(
      `
        SELECT *
        FROM psf_requests
        WHERE id = $1
      `,
      [id],
    );

    const request = result.rows[0];
    if (!request) {
      throw new NotFoundException(`PSF request ${id} was not found`);
    }

    return this.mapRequestRow(request);
  }

  async updateDraftRequesterData(
    id: string,
    dto: UpdateDraftRequesterDataDto,
  ): Promise<PsfRequestResponse> {
    const current = await this.pool.query<Pick<PsfRequestRow, 'id' | 'status'>>(
      `
        SELECT id, status
        FROM psf_requests
        WHERE id = $1
      `,
      [id],
    );

    const request = current.rows[0];
    if (!request) {
      throw new NotFoundException(`PSF request ${id} was not found`);
    }

    if (request.status !== DRAFT_STATUS) {
      throw new ForbiddenException(
        'Requester-owned fields can only be edited while the request is Draft',
      );
    }

    const requester = this.normalizeString(
      dto.requester ?? dto.requesterData.requester_name,
    );
    const productType = this.normalizeString(dto.requesterData.product_type);

    const result = await this.pool.query<PsfRequestRow>(
      `
        UPDATE psf_requests
        SET requester = $2,
            product_type = $3,
            requester_data_json = $4::jsonb,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [id, requester, productType, dto.requesterData],
    );

    return this.mapRequestRow(result.rows[0]);
  }

  async submitRequest(
    id: string,
    dto: SubmitDraftRequestDto,
  ): Promise<PsfRequestResponse> {
    const activeSchema =
      await this.formSchemaService.getActiveSchema(PSF_REQUEST_FORM_KEY);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const current = await client.query<
        Pick<PsfRequestRow, 'id' | 'status' | 'requester_data_json'>
      >(
        `
          SELECT id, status, requester_data_json
          FROM psf_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );

      const request = current.rows[0];
      if (!request) {
        throw new NotFoundException(`PSF request ${id} was not found`);
      }

      if (request.status !== DRAFT_STATUS) {
        throw new ForbiddenException('Only Draft requests can be submitted');
      }

      if (activeSchema.version !== dto.formVersion) {
        throw new BadRequestException(
          'The active request schema changed before submit. Reload the draft and submit again.',
        );
      }
      const normalizedRequesterData = this.normalizeRequesterDataToSchema(
        activeSchema.schema,
        request.requester_data_json ?? {},
      );
      this.assertRequiredRequesterFieldsPresent(
        activeSchema.schema,
        normalizedRequesterData,
      );

      const requester = this.normalizeString(
        normalizedRequesterData.requester_name,
      );
      const productType = this.normalizeString(
        normalizedRequesterData.product_type,
      );
      const result = await client.query<PsfRequestRow>(
        `
          UPDATE psf_requests
          SET status = '${SUBMITTED_STATUS}',
              requester = $2,
              product_type = $3,
              requester_data_json = $4::jsonb,
              form_version = $5,
              schema_snapshot_json = $6::jsonb,
              submitted_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          id,
          requester,
          productType,
          normalizedRequesterData,
          activeSchema.version,
          activeSchema.schema,
        ],
      );

      const submittedRow = result.rows[0];
      const canonicalValues =
        await this.searchIndexService.upsertSubmittedCanonicalValues(
          id,
          activeSchema.schema,
          normalizedRequesterData,
          client,
        );

      await this.searchIndexService.upsertRequestSearchIndex(
        {
          requestId: submittedRow.id,
          requestNo: submittedRow.request_no,
          status: submittedRow.status,
          requester: submittedRow.requester,
          setupOwner: submittedRow.setup_owner,
          setupOwnerRole: submittedRow.setup_owner_role,
          productType: submittedRow.product_type,
          requestDate: submittedRow.created_at,
          updatedAt: submittedRow.updated_at,
        },
        canonicalValues,
        client,
      );

      await client.query('COMMIT');

      return this.mapRequestRow(submittedRow);
    } catch (error) {
      await this.rollbackSubmitTransaction(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private parseOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private async rollbackSubmitTransaction(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original submit error if rollback also fails.
    }
  }

  private async ensureRequestsStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS psf_requests (
        id UUID PRIMARY KEY,
        request_no TEXT NOT NULL UNIQUE,
        form_key TEXT NOT NULL,
        form_version INT NOT NULL,
        status TEXT NOT NULL,
        requester TEXT,
        setup_owner TEXT,
        setup_owner_role TEXT,
        product_type TEXT,
        requester_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        psf_created_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        schema_snapshot_json JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        submitted_at TIMESTAMP,
        psf_created_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_requests_status_updated
      ON psf_requests (status, updated_at DESC)
    `);
  }

  private async nextDraftRequestNo(): Promise<string> {
    const result = await this.pool.query<{ next: string }>(`
      SELECT 'DRAFT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
             LPAD((COUNT(*) + 1)::TEXT, 4, '0') AS next
      FROM psf_requests
      WHERE request_no LIKE 'DRAFT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%'
    `);

    return result.rows[0]?.next ?? `DRAFT-${Date.now()}`;
  }

  private normalizeRequesterDataToSchema(
    schema: FormSchemaJson,
    requesterData: RequesterData,
  ): RequesterData {
    const nextData: RequesterData = {};

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (Object.hasOwn(requesterData, field.fieldKey)) {
          nextData[field.fieldKey] = requesterData[field.fieldKey];
        }
      });
    });

    return nextData;
  }

  private assertRequiredRequesterFieldsPresent(
    schema: FormSchemaJson,
    requesterData: RequesterData,
  ): void {
    const missingLabels = schema.sections.flatMap((section) =>
      section.fields
        .filter(
          (field) =>
            field.required &&
            !this.hasSubmittedValue(requesterData[field.fieldKey]),
        )
        .map((field) => field.label),
    );

    if (missingLabels.length > 0) {
      throw new BadRequestException(
        `Draft request is missing required fields for the active schema: ${missingLabels.join(', ')}`,
      );
    }
  }

  private hasSubmittedValue(value: unknown): boolean {
    return typeof value === 'string'
      ? value.trim().length > 0
      : value !== null && value !== undefined;
  }

  private normalizeString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private mapRequestRow(row: PsfRequestRow): PsfRequestResponse {
    return {
      id: row.id,
      requestNo: row.request_no,
      formKey: row.form_key,
      formVersion: row.form_version,
      status: row.status,
      requester: row.requester,
      setupOwner: row.setup_owner,
      setupOwnerRole: row.setup_owner_role,
      productType: row.product_type,
      requesterData: row.requester_data_json ?? {},
      psfCreatedData: row.psf_created_data_json ?? {},
      schemaSnapshot: row.schema_snapshot_json,
      createdAt: this.serializeTimestamp(row.created_at),
      updatedAt: this.serializeTimestamp(row.updated_at),
      submittedAt: this.serializeNullableTimestamp(row.submitted_at),
      psfCreatedAt: this.serializeNullableTimestamp(row.psf_created_at),
      completedAt: this.serializeNullableTimestamp(row.completed_at),
    };
  }

  private serializeNullableTimestamp(
    value: Date | string | null,
  ): string | null {
    if (value === null) {
      return null;
    }

    return this.serializeTimestamp(value);
  }

  private serializeTimestamp(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }
}

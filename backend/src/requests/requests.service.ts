import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import {
  FormSchemaJson,
  FormSchemaService,
} from '../admin/form_schema.service';
import { DATABASE_POOL } from '../database/database.service';

const PSF_REQUEST_FORM_KEY = 'psf-request';
const DRAFT_STATUS = 'Draft';

export type RequesterData = Record<string, unknown>;

export interface CreateDraftRequestDto {
  requester?: string;
  requesterData: RequesterData;
}

export interface UpdateDraftRequesterDataDto {
  requester?: string;
  requesterData: RequesterData;
}

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

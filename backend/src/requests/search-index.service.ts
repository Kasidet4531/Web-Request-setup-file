import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import type { FormSchemaJson } from '../admin/form_schema.service';
import { DATABASE_POOL } from '../database/database.service';
import type { RequesterData } from './requests.service';

export type CanonicalValue = string | number | boolean | string[] | null;
export type CanonicalValues = Record<string, CanonicalValue>;

export interface RequestSearchIndexSource {
  requestId: string;
  requestNo: string;
  status: string;
  requester: string | null;
  setupOwner: string | null;
  setupOwnerRole: string | null;
  productType: string | null;
  requestDate: Date | string | null;
  updatedAt: Date | string;
}

export interface RequestSearchFilters {
  keyword?: string;
  status?: string;
  priority?: string;
  setupOwner?: string;
  setupOwnerRole?: string;
  productType?: string;
  requester?: string;
  requestDateFrom?: string;
  requestDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  limit?: number;
  offset?: number;
}

export interface RequestSearchIndexItem {
  requestId: string;
  requestNo: string;
  title: string | null;
  referencePsfName: string | null;
  psfSetupFileName: string | null;
  probecardName: string | null;
  status: string;
  priority: string | null;
  requester: string | null;
  setupOwner: string | null;
  setupOwnerRole: string | null;
  productType: string | null;
  requestDate: string | null;
  dueDate: string | null;
  updatedAt: string;
}

export interface RequestSearchResult {
  items: RequestSearchIndexItem[];
  total: number;
  limit: number;
  offset: number;
}

interface RequestSearchIndexRow {
  request_id: string;
  request_no: string;
  title: string | null;
  reference_psf_name: string | null;
  psf_setup_file_name: string | null;
  probecard_name: string | null;
  status: string;
  priority: string | null;
  requester: string | null;
  setup_owner: string | null;
  setup_owner_role: string | null;
  product_type: string | null;
  request_date: Date | string | null;
  due_date: Date | string | null;
  updated_at: Date | string;
  total_count: number;
}

interface CanonicalValueRow {
  canonicalKey: string;
  value: CanonicalValue;
}

type QueryRunner = Pick<Pool | PoolClient, 'query'>;

@Injectable()
export class SearchIndexService implements OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCanonicalValueStorage();
    await this.ensureRequestSearchIndexStorage();
  }

  extractCanonicalValues(
    schema: FormSchemaJson,
    requesterData: RequesterData,
  ): CanonicalValues {
    const canonicalValues: CanonicalValues = {};

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (!this.shouldExtractField(field)) {
          return;
        }

        canonicalValues[field.canonicalKey] = this.normalizeCanonicalValue(
          requesterData[field.fieldKey],
        );
      });
    });

    return canonicalValues;
  }

  async upsertRequestSearchIndex(
    source: RequestSearchIndexSource,
    canonicalValues: CanonicalValues,
    queryRunner: QueryRunner = this.pool,
  ): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO psf_request_search_index (
          request_id,
          request_no,
          title,
          reference_psf_name,
          psf_setup_file_name,
          probecard_name,
          status,
          priority,
          requester,
          setup_owner,
          setup_owner_role,
          product_type,
          request_date,
          due_date,
          updated_at
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13::timestamp, $14::timestamp, $15::timestamp
        )
        ON CONFLICT (request_id)
        DO UPDATE SET
          request_no = EXCLUDED.request_no,
          title = EXCLUDED.title,
          reference_psf_name = EXCLUDED.reference_psf_name,
          psf_setup_file_name = EXCLUDED.psf_setup_file_name,
          probecard_name = EXCLUDED.probecard_name,
          status = EXCLUDED.status,
          priority = EXCLUDED.priority,
          requester = EXCLUDED.requester,
          setup_owner = EXCLUDED.setup_owner,
          setup_owner_role = EXCLUDED.setup_owner_role,
          product_type = EXCLUDED.product_type,
          request_date = EXCLUDED.request_date,
          due_date = EXCLUDED.due_date,
          updated_at = EXCLUDED.updated_at
      `,
      [
        source.requestId,
        source.requestNo,
        this.stringFromCanonical(canonicalValues.title),
        this.stringFromCanonical(canonicalValues.reference_psf_name),
        this.stringFromCanonical(canonicalValues.psf_setup_file_name),
        this.stringFromCanonical(canonicalValues.probecard_name),
        source.status,
        this.stringFromCanonical(canonicalValues.priority),
        source.requester ?? this.stringFromCanonical(canonicalValues.requester),
        source.setupOwner,
        source.setupOwnerRole,
        source.productType ??
          this.stringFromCanonical(canonicalValues.product_type),
        this.serializeDateForQuery(source.requestDate),
        this.serializeDateForQuery(canonicalValues.due_date),
        this.serializeDateForQuery(source.updatedAt),
      ],
    );
  }

  async queryRequests(
    filters: RequestSearchFilters = {},
  ): Promise<RequestSearchResult> {
    const limit = this.normalizeLimit(filters.limit);
    const offset = this.normalizeOffset(filters.offset);
    const where: string[] = [];
    const params: unknown[] = [];

    this.addCaseInsensitiveFilter(where, params, 'status', filters.status);
    this.addCaseInsensitiveFilter(where, params, 'priority', filters.priority);
    this.addCaseInsensitiveFilter(
      where,
      params,
      'setup_owner',
      filters.setupOwner,
    );
    this.addCaseInsensitiveFilter(
      where,
      params,
      'setup_owner_role',
      filters.setupOwnerRole,
    );
    this.addCaseInsensitiveFilter(
      where,
      params,
      'product_type',
      filters.productType,
    );
    this.addCaseInsensitiveFilter(
      where,
      params,
      'requester',
      filters.requester,
    );
    this.addDateFilter(
      where,
      params,
      'request_date',
      '>=',
      filters.requestDateFrom,
    );
    this.addDateFilter(
      where,
      params,
      'request_date',
      '<=',
      filters.requestDateTo,
    );
    this.addDateFilter(where, params, 'due_date', '>=', filters.dueDateFrom);
    this.addDateFilter(where, params, 'due_date', '<=', filters.dueDateTo);

    if (filters.keyword?.trim()) {
      params.push(`%${filters.keyword.trim()}%`);
      const keywordParam = `$${params.length}`;
      where.push(`(
        request_no ILIKE ${keywordParam}
        OR title ILIKE ${keywordParam}
        OR reference_psf_name ILIKE ${keywordParam}
        OR psf_setup_file_name ILIKE ${keywordParam}
        OR probecard_name ILIKE ${keywordParam}
      )`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.pool.query<RequestSearchIndexRow>(
      `
        SELECT
          request_id,
          request_no,
          title,
          reference_psf_name,
          psf_setup_file_name,
          probecard_name,
          status,
          priority,
          requester,
          setup_owner,
          setup_owner_role,
          product_type,
          request_date,
          due_date,
          updated_at,
          COUNT(*) OVER()::int AS total_count
        FROM psf_request_search_index
        ${whereClause}
        ORDER BY updated_at DESC, request_no DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      [...params, limit, offset],
    );

    return {
      items: result.rows.map((row) => this.mapSearchIndexRow(row)),
      total: result.rows[0]?.total_count ?? 0,
      limit,
      offset,
    };
  }

  async upsertSubmittedCanonicalValues(
    requestId: string,
    schema: FormSchemaJson,
    requesterData: RequesterData,
    queryRunner: QueryRunner = this.pool,
  ): Promise<CanonicalValues> {
    const canonicalValues = this.extractCanonicalValues(schema, requesterData);
    const rows: CanonicalValueRow[] = Object.entries(canonicalValues).map(
      ([canonicalKey, value]) => ({ canonicalKey, value }),
    );

    await queryRunner.query(
      `
        INSERT INTO canonical_submission_values (
          request_id,
          canonical_key,
          value_json,
          updated_at
        )
        SELECT $1::uuid, value->>'canonicalKey', value->'value', NOW()
        FROM jsonb_array_elements($2::jsonb) AS value
        ON CONFLICT (request_id, canonical_key)
        DO UPDATE SET
          value_json = EXCLUDED.value_json,
          updated_at = EXCLUDED.updated_at
      `,
      [requestId, JSON.stringify(rows)],
    );

    return canonicalValues;
  }

  private async ensureCanonicalValueStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS canonical_submission_values (
        request_id UUID NOT NULL,
        canonical_key TEXT NOT NULL,
        value_json JSONB,
        updated_at TIMESTAMP NOT NULL,
        PRIMARY KEY (request_id, canonical_key)
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_canonical_submission_values_key_value
      ON canonical_submission_values (canonical_key, value_json)
    `);
  }

  private async ensureRequestSearchIndexStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS psf_request_search_index (
        request_id UUID PRIMARY KEY,
        request_no TEXT NOT NULL,
        title TEXT,
        reference_psf_name TEXT,
        psf_setup_file_name TEXT,
        probecard_name TEXT,
        status TEXT NOT NULL,
        priority TEXT,
        requester TEXT,
        setup_owner TEXT,
        setup_owner_role TEXT,
        product_type TEXT,
        request_date TIMESTAMP,
        due_date TIMESTAMP,
        updated_at TIMESTAMP NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_keyword
      ON psf_request_search_index (
        title,
        reference_psf_name,
        psf_setup_file_name,
        probecard_name
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_status
      ON psf_request_search_index (status)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_product_type
      ON psf_request_search_index (product_type)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_setup_owner_role
      ON psf_request_search_index (setup_owner_role)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_priority
      ON psf_request_search_index (priority)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_updated_at
      ON psf_request_search_index (updated_at DESC)
    `);
  }

  private shouldExtractField(
    field: FormSchemaJson['sections'][number]['fields'][number],
  ): boolean {
    return (
      typeof field.canonicalKey === 'string' &&
      field.canonicalKey.trim().length > 0 &&
      (field.searchable === true ||
        field.exportable === true ||
        field.autofillTrigger === true)
    );
  }

  private stringFromCanonical(
    value: CanonicalValue | undefined,
  ): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value.join(', ');
    }

    return null;
  }

  private serializeDateForQuery(value: unknown): string | null {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    return value.trim();
  }

  private normalizeLimit(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 50;
    }

    return Math.min(Math.max(Math.trunc(value), 1), 100);
  }

  private normalizeOffset(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }

    return Math.max(Math.trunc(value), 0);
  }

  private addCaseInsensitiveFilter(
    where: string[],
    params: unknown[],
    column: string,
    value: string | undefined,
  ): void {
    if (!value?.trim()) {
      return;
    }

    params.push(value.trim());
    where.push(`LOWER(${column}) = LOWER($${params.length})`);
  }

  private addDateFilter(
    where: string[],
    params: unknown[],
    column: string,
    operator: '>=' | '<=',
    value: string | undefined,
  ): void {
    if (!value?.trim()) {
      return;
    }

    params.push(value.trim());
    where.push(`${column} ${operator} $${params.length}::timestamp`);
  }

  private mapSearchIndexRow(
    row: RequestSearchIndexRow,
  ): RequestSearchIndexItem {
    return {
      requestId: row.request_id,
      requestNo: row.request_no,
      title: row.title,
      referencePsfName: row.reference_psf_name,
      psfSetupFileName: row.psf_setup_file_name,
      probecardName: row.probecard_name,
      status: row.status,
      priority: row.priority,
      requester: row.requester,
      setupOwner: row.setup_owner,
      setupOwnerRole: row.setup_owner_role,
      productType: row.product_type,
      requestDate: this.serializeNullableTimestamp(row.request_date),
      dueDate: this.serializeNullableTimestamp(row.due_date),
      updatedAt: this.serializeTimestamp(row.updated_at),
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

  private normalizeCanonicalValue(value: unknown): CanonicalValue {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      const normalized = value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      return normalized.length > 0 ? normalized : null;
    }

    return null;
  }
}

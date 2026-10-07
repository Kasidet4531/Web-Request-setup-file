import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { resolvePsfCreatedInformationSchema } from '../admin/form_schema.constants';
import type { FormSchemaJson } from '../admin/form_schema.service';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import { DATABASE_POOL } from '../database/database.service';
import type { RequesterData } from './requests.service';
import { isCalendarDate } from './form-data-validation';

export type CanonicalValue = string | number | boolean | string[] | null;
export type CanonicalValues = Record<string, CanonicalValue>;

export interface RequestSearchIndexSource {
  requestId: string;
  requestNo: string;
  status: string;
  requester: string | null;
  requesterUserId: string | null;
  productType: string | null;
  requestDate: Date | string | null;
  updatedAt: Date | string;
}

export interface RequestSearchFilters {
  team?: 'all' | 'GNTC' | 'MFG' | 'unclassified';
  keyword?: string;
  status?: string;
  priority?: string;
  productType?: string;
  requester?: string;
  requesterUserId?: string;
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
  requesterUserId?: string | null;
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
  summary: { open: number; overdue: number; completed: number };
}

export interface RequestScopeFilters {
  scope: 'all' | 'related';
  relation: 'all' | 'created';
  workState: 'all' | 'open' | 'overdue' | 'completed';
  actorId: string;
  actorRole: AuthenticatedUserProfile['role'];
  department: AuthenticatedUserProfile['setupOwnerDepartment'];
  openStatuses: string[];
  completedStatuses: string[];
}

export interface RequestExportItem {
  requestId: string;
  requestNo: string;
  status: string;
  requester: string | null;
  productType: string | null;
  requestDate: string;
  updatedAt: string;
  requesterData: RequesterData;
  psfCreatedData: RequesterData;
  psfReleasedAt: string | null;
  psfCreatedInformationSchema?: FormSchemaJson;
  schemaSnapshot: FormSchemaJson;
  canonicalValues: CanonicalValues | null;
}

export interface RequestExportResult {
  items: RequestExportItem[];
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
  requester_user_id: string | null;
  setup_owner_user_id?: string | null;
  setup_owner: string | null;
  setup_owner_role: string | null;
  product_type: string | null;
  request_date: Date | string | null;
  due_date: Date | string | null;
  updated_at: Date | string;
  total_count: number;
  open_count: number;
  overdue_count: number;
  completed_count: number;
}

interface DraftSearchRow {
  id: string | null;
  request_no: string | null;
  requester: string | null;
  requester_user_id: string | null;
  setup_owner_user_id?: string | null;
  setup_owner: string | null;
  setup_owner_role: string | null;
  product_type: string | null;
  requester_data_json: RequesterData | null;
  schema_snapshot_json: FormSchemaJson | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  updated_at_version: string | null;
  total_count: number;
}

interface RequestExportRow {
  request_id: string;
  request_no: string;
  status: string;
  requester: string | null;
  setup_owner: string | null;
  setup_owner_role: string | null;
  product_type: string | null;
  request_date: Date | string;
  updated_at: Date | string;
  requester_data_json: RequesterData;
  psf_created_data_json: RequesterData;
  psf_released_at: Date | string | null;
  requester_user_id: string | null;
  psf_created_schema_snapshot_json?: FormSchemaJson | null;
  schema_snapshot_json: FormSchemaJson;
  canonical_values_json: CanonicalValues | null;
  total_count: number;
}

interface RequestExportCountRow {
  total: number;
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
    const dueDate = this.serializeDateForQuery(canonicalValues.due_date);
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
          requester_user_id,
          setup_owner,
          setup_owner_role,
          product_type,
          request_date,
          due_date,
          updated_at,
          setup_owner_user_id
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid,
          $11, $12, $13, $14::timestamp, $15::timestamp, ($16::timestamptz AT TIME ZONE current_setting('TIMEZONE')), $17::uuid
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
          requester_user_id = EXCLUDED.requester_user_id,
          setup_owner_user_id = EXCLUDED.setup_owner_user_id,
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
        source.requesterUserId,
        null,
        null,
        source.productType ??
          this.stringFromCanonical(canonicalValues.product_type),
        this.serializeDateForQuery(source.requestDate),
        dueDate && !dueDate.startsWith('0000-') && isCalendarDate(dueDate)
          ? dueDate
          : null,
        this.serializeDateForQuery(source.updatedAt),
        null,
      ],
    );
  }

  async queryRequests(
    filters: RequestSearchFilters = {},
    scopeOrMaximum: RequestScopeFilters | number = 100,
    maximumLimit = 100,
  ): Promise<RequestSearchResult> {
    const scope: RequestScopeFilters =
      typeof scopeOrMaximum === 'number'
        ? {
            scope: 'all',
            relation: 'all',
            workState: 'all',
            actorId: '',
            actorRole: 'requester',
            department: null,
            openStatuses: [],
            completedStatuses: [],
          }
        : scopeOrMaximum;
    if (typeof scopeOrMaximum === 'number') {
      maximumLimit = scopeOrMaximum;
    }
    const limit = this.normalizeLimit(filters.limit, maximumLimit);
    const offset = this.normalizeOffset(filters.offset);
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    where.push(`status <> 'Draft'`);
    this.addCaseInsensitiveFilter(
      where,
      params,
      'status',
      filters.status,
      true,
    );
    this.addCaseInsensitiveFilter(where, params, 'priority', filters.priority);
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
    this.addExactFilter(
      where,
      params,
      'requester_user_id',
      filters.requesterUserId,
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

    if (
      scope.scope === 'related' &&
      (scope.relation === 'created' || scope.actorRole !== 'setup_owner')
    ) {
      where.push(`requester_user_id = ${add(scope.actorId)}::uuid`);
    }
    if (filters.team === 'GNTC') where.push("product_type = 'New Product'");
    else if (filters.team === 'MFG')
      where.push("product_type IN ('Transfer Product','Existing Product')");
    else if (filters.team === 'unclassified')
      where.push(
        "(product_type IS NULL OR product_type NOT IN ('New Product','Transfer Product','Existing Product'))",
      );

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

    const openStatusParam = add(scope.openStatuses);
    const completedStatusParam = add(scope.completedStatuses);
    const filterWhere = where.join(' AND ');
    const filtered = `SELECT * FROM psf_request_search_index WHERE ${filterWhere}`;
    const overdue = `due_date IS NOT NULL AND due_date::date < (NOW() AT TIME ZONE 'Asia/Bangkok')::date`;
    let workStatePredicate = '';
    if (scope.workState === 'open') {
      workStatePredicate = `status = ANY(${openStatusParam}::text[])`;
    } else if (scope.workState === 'overdue') {
      workStatePredicate = `status = ANY(${openStatusParam}::text[]) AND ${overdue}`;
    } else if (scope.workState === 'completed') {
      workStatePredicate = `status = ANY(${completedStatusParam}::text[])`;
    }
    const visible = workStatePredicate
      ? `SELECT * FROM filtered WHERE ${workStatePredicate}`
      : 'SELECT * FROM filtered';
    params.push(limit, offset);
    const result = await this.pool.query<RequestSearchIndexRow>(
      `
        WITH filtered AS (${filtered}),
        summary AS (
          SELECT
            COUNT(*) FILTER (WHERE status = ANY(${openStatusParam}::text[]))::int AS open_count,
            COUNT(*) FILTER (WHERE status = ANY(${openStatusParam}::text[]) AND ${overdue})::int AS overdue_count,
            COUNT(*) FILTER (WHERE status = ANY(${completedStatusParam}::text[]))::int AS completed_count
          FROM filtered
        ),
        visible AS (${visible}),
        totals AS (SELECT COUNT(*)::int AS total_count FROM visible),
        page AS (
          SELECT * FROM visible
          ORDER BY updated_at DESC, request_no DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}
        )
        SELECT page.*, totals.total_count,
               summary.open_count, summary.overdue_count, summary.completed_count
        FROM totals CROSS JOIN summary
        LEFT JOIN page ON TRUE
      `,
      params,
    );

    return {
      items: result.rows
        .filter((row) => row.request_id !== null)
        .map((row) => this.mapSearchIndexRow(row)),
      total: result.rows[0]?.total_count ?? 0,
      limit,
      offset,
      summary: {
        open: result.rows[0]?.open_count ?? 0,
        overdue: result.rows[0]?.overdue_count ?? 0,
        completed: result.rows[0]?.completed_count ?? 0,
      },
    };
  }

  async queryOwnDrafts(
    actorId: string,
    filters: RequestSearchFilters = {},
  ): Promise<RequestSearchResult> {
    const limit = this.normalizeLimit(filters.limit, 100);
    const offset = this.normalizeOffset(filters.offset);
    const where = [`status = 'Draft'`, 'requester_user_id = $1::uuid'];
    const params: unknown[] = [actorId];
    this.addCaseInsensitiveFilter(
      where,
      params,
      'requester',
      filters.requester,
    );
    this.addCaseInsensitiveFilter(
      where,
      params,
      this.draftCanonicalText('priority'),
      filters.priority,
    );
    this.addCaseInsensitiveFilter(
      where,
      params,
      'product_type',
      filters.productType,
    );
    this.addDateFilter(
      where,
      params,
      'created_at',
      '>=',
      filters.requestDateFrom,
    );
    this.addDateFilter(
      where,
      params,
      'created_at',
      '<=',
      filters.requestDateTo,
    );
    const dueDate = this.draftCanonicalDate();
    this.addDateFilter(where, params, dueDate, '>=', filters.dueDateFrom);
    this.addDateFilter(where, params, dueDate, '<=', filters.dueDateTo);
    if (filters.status && filters.status.toLowerCase() !== 'draft') {
      where.push('FALSE');
    }
    if (filters.keyword?.trim()) {
      params.push(`%${filters.keyword.trim()}%`);
      where.push(
        `(request_no ILIKE $${params.length} OR requester_data_json::text ILIKE $${params.length})`,
      );
    }
    params.push(limit, offset);
    const result = await this.pool.query<DraftSearchRow>(
      `
        WITH filtered AS (
          SELECT * FROM psf_requests WHERE ${where.join(' AND ')}
        ), totals AS (SELECT COUNT(*)::int AS total_count FROM filtered),
        page AS (
          SELECT id, request_no, requester, requester_user_id, setup_owner_user_id, setup_owner,
                 setup_owner_role, product_type, requester_data_json,
                 schema_snapshot_json, created_at, updated_at,
                 ${`TO_CHAR(updated_at AT TIME ZONE current_setting('TIMEZONE') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`} AS updated_at_version
          FROM filtered ORDER BY updated_at DESC, request_no DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}
        )
        SELECT page.*, totals.total_count FROM totals LEFT JOIN page ON TRUE
      `,
      params,
    );
    const items = result.rows
      .filter((row) => row.id !== null && row.schema_snapshot_json !== null)
      .map((row) => {
        const canonical = this.extractCanonicalValues(
          row.schema_snapshot_json!,
          row.requester_data_json ?? {},
        );
        return {
          requestId: row.id!,
          requestNo: row.request_no!,
          title: this.stringFromCanonical(canonical.title),
          referencePsfName: this.stringFromCanonical(
            canonical.reference_psf_name,
          ),
          psfSetupFileName: this.stringFromCanonical(
            canonical.psf_setup_file_name,
          ),
          probecardName: this.stringFromCanonical(canonical.probecard_name),
          status: 'Draft',
          priority: this.stringFromCanonical(canonical.priority),
          requester: row.requester,
          requesterUserId: row.requester_user_id,
          productType: row.product_type,
          requestDate: this.serializeNullableTimestamp(row.created_at),
          dueDate: this.stringFromCanonical(canonical.due_date),
          updatedAt:
            row.updated_at_version ?? this.serializeTimestamp(row.updated_at!),
        };
      });
    return {
      items,
      total: result.rows[0]?.total_count ?? 0,
      limit,
      offset,
      summary: { open: 0, overdue: 0, completed: 0 },
    };
  }

  async queryExportRequests(
    filters: RequestSearchFilters,
    actor: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
    maximumLimit = 100,
  ): Promise<RequestExportResult> {
    const limit = this.normalizeLimit(filters.limit, maximumLimit);
    const offset = this.normalizeOffset(filters.offset);
    const { whereClause, params } = this.buildExportWhere(filters, actor);
    const result = await this.pool.query<RequestExportRow>(
      `
        SELECT
          request.id AS request_id,
          request.request_no,
          request.status,
          request.requester,
          request.setup_owner,
          request.setup_owner_role,
          request.product_type,
          request.created_at AS request_date,
          request.updated_at,
          request.requester_data_json,
          request.psf_created_data_json,
          request.psf_released_at,
          request.requester_user_id,
          request.psf_created_schema_snapshot_json,
          request.schema_snapshot_json,
          canonical_values.canonical_values_json,
          COUNT(*) OVER()::int AS total_count
        FROM psf_requests AS request
        LEFT JOIN LATERAL (
          SELECT jsonb_object_agg(canonical_key, value_json) AS canonical_values_json
          FROM canonical_submission_values
          WHERE request_id = request.id
        ) AS canonical_values ON TRUE
        ${whereClause}
        ORDER BY request.updated_at DESC, request.request_no DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      [...params, limit, offset],
    );

    return {
      items: result.rows.map((row) => this.mapExportRow(row, actor)),
      total: result.rows[0]?.total_count ?? 0,
      limit,
      offset,
    };
  }

  async countExportRequests(
    filters: RequestSearchFilters,
    actor: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
  ): Promise<number> {
    const { whereClause, params } = this.buildExportWhere(filters, actor);
    const result = await this.pool.query<RequestExportCountRow>(
      `
        SELECT COUNT(*)::int AS total
        FROM psf_requests AS request
        ${whereClause}
      `,
      params,
    );

    return result.rows[0]?.total ?? 0;
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

  async ensureRequestSearchIndexStorage(
    queryRunner: QueryRunner = this.pool,
  ): Promise<void> {
    await queryRunner.query(`
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
        requester_user_id UUID,
        setup_owner_user_id UUID NULL,
        setup_owner TEXT,
        setup_owner_role TEXT,
        product_type TEXT,
        request_date TIMESTAMP,
        due_date TIMESTAMP,
        updated_at TIMESTAMP NOT NULL
      )
    `);

    await queryRunner.query(
      `ALTER TABLE psf_request_search_index ADD COLUMN IF NOT EXISTS setup_owner_user_id UUID NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_setup_owner_user_id ON psf_request_search_index (setup_owner_user_id)`,
    );

    await queryRunner.query(`
      ALTER TABLE psf_request_search_index
      ADD COLUMN IF NOT EXISTS requester_user_id UUID
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.psf_requests') IS NOT NULL THEN
          EXECUTE $backfill_search_requester_owners$
            UPDATE psf_request_search_index AS search_entry
            SET requester_user_id = request.requester_user_id
            FROM psf_requests AS request
            WHERE search_entry.request_id = request.id
              AND search_entry.requester_user_id IS NULL
          $backfill_search_requester_owners$;
        END IF;
      END
      $$;
    `);

    // Upgrade older projections from stored UUIDs only; never infer an assignee from names.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'psf_requests' AND column_name = 'setup_owner_user_id'
        ) THEN
          EXECUTE $backfill_search_assignees$
            UPDATE psf_request_search_index AS search_entry
            SET setup_owner_user_id = request.setup_owner_user_id
            FROM psf_requests AS request
            WHERE search_entry.request_id = request.id
              AND search_entry.setup_owner_user_id IS NULL
              AND request.setup_owner_user_id IS NOT NULL
          $backfill_search_assignees$;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_keyword
      ON psf_request_search_index (
        title,
        reference_psf_name,
        psf_setup_file_name,
        probecard_name
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_status
      ON psf_request_search_index (status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_product_type
      ON psf_request_search_index (product_type)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_requester_user_id
      ON psf_request_search_index (requester_user_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_setup_owner_role
      ON psf_request_search_index (setup_owner_role)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_search_index_priority
      ON psf_request_search_index (priority)
    `);

    await queryRunner.query(`
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
    const serialized = this.serializeCanonicalValue(value);
    return serialized.length > 0 ? serialized : null;
  }

  serializeCanonicalValue(value: unknown): string {
    const normalized = this.normalizeCanonicalValue(value);

    if (typeof normalized === 'string') {
      return normalized;
    }

    if (typeof normalized === 'number' || typeof normalized === 'boolean') {
      return String(normalized);
    }

    if (Array.isArray(normalized)) {
      return normalized.join(', ');
    }

    return '';
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

  private normalizeLimit(
    value: number | undefined,
    maximumLimit: number,
  ): number {
    const normalizedMaximumLimit = Number.isFinite(maximumLimit)
      ? Math.max(Math.trunc(maximumLimit), 1)
      : 100;

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 50;
    }

    return Math.min(Math.max(Math.trunc(value), 1), normalizedMaximumLimit);
  }

  private normalizeOffset(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }

    return Math.max(Math.trunc(value), 0);
  }

  private draftCanonicalText(key: 'priority' | 'due_date'): string {
    return `NULLIF(REGEXP_REPLACE(requester_data_json ->> (
      SELECT field.value->>'fieldKey'
      FROM jsonb_array_elements(schema_snapshot_json->'sections') WITH ORDINALITY AS section(value, position)
      CROSS JOIN LATERAL jsonb_array_elements(section.value->'fields') WITH ORDINALITY AS field(value, position)
      WHERE field.value->>'canonicalKey' = '${key}'
        AND (field.value->'searchable' = 'true'::jsonb
          OR field.value->'exportable' = 'true'::jsonb
          OR field.value->'autofillTrigger' = 'true'::jsonb)
      ORDER BY section.position DESC, field.position DESC LIMIT 1
    ), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '')`;
  }

  private draftCanonicalDate(): string {
    // Captured text controls may contain non-dates; CASE guards every conversion.
    return `(SELECT CASE
      WHEN due_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND LEFT(due_text, 4) <> '0000'
        AND SUBSTRING(due_text, 6, 2) BETWEEN '01' AND '12'
        AND SUBSTRING(due_text, 9, 2) BETWEEN '01' AND '31'
      THEN CASE
        WHEN SUBSTRING(due_text, 9, 2)::int <= EXTRACT(DAY FROM
          make_date(SUBSTRING(due_text, 1, 4)::int, SUBSTRING(due_text, 6, 2)::int, 1)
          + INTERVAL '1 month - 1 day')
        THEN make_date(SUBSTRING(due_text, 1, 4)::int,
                       SUBSTRING(due_text, 6, 2)::int,
                       SUBSTRING(due_text, 9, 2)::int)
        ELSE NULL END
      ELSE NULL END
      FROM (SELECT ${this.draftCanonicalText('due_date')} AS due_text) AS captured_due)`;
  }

  private addCaseInsensitiveFilter(
    where: string[],
    params: unknown[],
    column: string,
    value: string | undefined,
    preserveWhitespace = false,
  ): void {
    if (!value?.trim()) {
      return;
    }

    params.push(preserveWhitespace ? value : value.trim());
    where.push(`LOWER(${column}) = LOWER($${params.length})`);
  }

  private addExactFilter(
    where: string[],
    params: unknown[],
    column: string,
    value: string | undefined,
  ): void {
    if (!value) {
      return;
    }

    params.push(value);
    where.push(`${column} = $${params.length}`);
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
    where.push(
      operator === '<='
        ? `${column} < ($${params.length}::date + INTERVAL '1 day')`
        : `${column} >= $${params.length}::date`,
    );
  }

  private buildExportWhere(
    filters: RequestSearchFilters,
    actor: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
  ): { whereClause: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    params.push(actor.id);
    where.push(
      `(request.status <> 'Draft' OR request.requester_user_id = $${params.length}::uuid)`,
    );

    this.addCaseInsensitiveFilter(
      where,
      params,
      'request.status',
      filters.status,
      true,
    );
    if (actor.role === 'requester') {
      this.addExactFilter(where, params, 'request.requester_user_id', actor.id);
    }
    this.addDateFilter(
      where,
      params,
      'request.created_at',
      '>=',
      filters.requestDateFrom,
    );
    this.addDateFilter(
      where,
      params,
      'request.created_at',
      '<=',
      filters.requestDateTo,
    );

    return {
      whereClause: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
      params,
    };
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
      requesterUserId: row.requester_user_id,
      productType: row.product_type,
      requestDate: this.serializeNullableTimestamp(row.request_date),
      dueDate: this.serializeNullableTimestamp(row.due_date),
      updatedAt: this.serializeTimestamp(row.updated_at),
    };
  }

  private mapExportRow(
    row: RequestExportRow,
    actor: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
  ): RequestExportItem {
    const psfVisible =
      actor.role !== 'requester' ||
      (row.psf_released_at !== null && row.psf_released_at !== undefined);
    return {
      requestId: row.request_id,
      requestNo: row.request_no,
      status: row.status,
      requester: row.requester,
      productType: row.product_type,
      requestDate: this.serializeTimestamp(row.request_date),
      updatedAt: this.serializeTimestamp(row.updated_at),
      requesterData: row.requester_data_json ?? {},
      psfCreatedData: psfVisible ? (row.psf_created_data_json ?? {}) : {},
      psfReleasedAt: this.serializeNullableTimestamp(row.psf_released_at),
      psfCreatedInformationSchema: resolvePsfCreatedInformationSchema(
        row.psf_created_schema_snapshot_json,
      ),
      schemaSnapshot: row.schema_snapshot_json,
      canonicalValues: row.canonical_values_json,
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

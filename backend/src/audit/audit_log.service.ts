import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import { DATABASE_POOL } from '../database/database.service';

type QueryRunner = Pick<Pool | PoolClient, 'query'>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REQUEST_AUDIT_ACTION = {
  DRAFT_CREATED: 'DRAFT_CREATED',
  DRAFT_REQUESTER_DATA_UPDATED: 'DRAFT_REQUESTER_DATA_UPDATED',
  REQUEST_SUBMITTED: 'REQUEST_SUBMITTED',
  REQUEST_STATUS_CHANGED: 'REQUEST_STATUS_CHANGED',
  REQUESTER_INFORMATION_UPDATED: 'REQUESTER_INFORMATION_UPDATED',
  PSF_CREATED_INFORMATION_UPDATED: 'PSF_CREATED_INFORMATION_UPDATED',
  WORKFLOW_CATALOG_UPDATED: 'WORKFLOW_CATALOG_UPDATED',
  ATTACHMENT_UPLOADED: 'ATTACHMENT_UPLOADED',
  ATTACHMENT_DELETED: 'ATTACHMENT_DELETED',
} as const;

export type RequestAuditAction =
  (typeof REQUEST_AUDIT_ACTION)[keyof typeof REQUEST_AUDIT_ACTION];

export interface RecordRequestAuditAction {
  requestId: string | null;
  actionType: string;
  actor: AuthenticatedUserProfile;
  metadata: Record<string, unknown>;
  // Defaults to true: an entry tied to a request stores its Request Snapshot.
  requestSnapshot?: boolean;
}

export interface RequestSnapshot {
  status: string;
  formVersion: number;
  psfFormVersion: number | null;
  requesterData: Record<string, unknown>;
  psfCreatedData: Record<string, unknown>;
}

export interface RequestAuditHistoryEntry {
  id: string;
  hasRequestSnapshot: boolean;
  actionType: string;
  actorDisplayName: string;
  actorRole: AuthenticatedUserProfile['role'];
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface GlobalAuditLogFilters {
  keyword?: string;
  requestId?: string;
  user?: string;
  actionType?: string;
  from?: string;
  to?: string;
  limit?: unknown;
  offset?: unknown;
}

export interface GlobalAuditLogEntry {
  id: string;
  hasRequestSnapshot: boolean;
  requestId: string | null;
  requestNo: string | null;
  // The request's Product_Description, or `Untitled Draft (#ID)` while blank.
  requestLabel: string | null;
  actionType: string;
  actorDisplayName: string;
  actorRole: AuthenticatedUserProfile['role'];
  createdAt: string;
  metadata: Record<string, unknown>;
}

interface RequestAuditHistoryRow {
  id: string;
  has_request_snapshot: boolean;
  action_type: string;
  actor_display_name: string;
  actor_role: AuthenticatedUserProfile['role'];
  created_at: Date | string;
  metadata_json: Record<string, unknown>;
}

interface GlobalAuditLogRow {
  id: string;
  has_request_snapshot: boolean;
  request_id: string | null;
  request_no: string | null;
  request_status: string | null;
  request_numeric_id: number | null;
  request_title: string | null;
  action_type: string;
  actor_display_name: string;
  actor_role: AuthenticatedUserProfile['role'];
  created_at: Date | string;
  metadata_json: Record<string, unknown>;
}

@Injectable()
export class AuditLogService implements OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.ensureStorage();
  }

  async record(
    event: RecordRequestAuditAction,
    queryRunner: QueryRunner = this.pool,
  ): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO psf_request_audit_logs (
          id,
          request_id,
          action_type,
          actor_id,
          actor_username,
          actor_display_name,
          actor_role,
          metadata_json,
          request_snapshot_json,
          created_at
        )
        VALUES (
          $1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8::jsonb,
          CASE WHEN $9::boolean THEN (
            SELECT jsonb_build_object(
              'status', status,
              'formVersion', form_version,
              'psfFormVersion', psf_created_schema_snapshot_json->'version',
              'requesterData', requester_data_json,
              'psfCreatedData', psf_created_data_json
            )
            FROM psf_requests
            WHERE id = $2::uuid
          ) END,
          NOW()
        )
      `,
      [
        randomUUID(),
        event.requestId,
        event.actionType,
        event.actor.id,
        event.actor.username,
        event.actor.displayName,
        event.actor.role,
        event.metadata,
        event.requestSnapshot !== false,
      ],
    );
  }

  async findByRequestId(
    requestId: string,
    includePsfHistory = true,
  ): Promise<RequestAuditHistoryEntry[]> {
    const result = await this.pool.query<RequestAuditHistoryRow>(
      `
        SELECT
          id,
          request_snapshot_json IS NOT NULL AS has_request_snapshot,
          action_type,
          actor_display_name,
          actor_role,
          created_at,
          metadata_json
        FROM psf_request_audit_logs
        WHERE request_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [requestId],
    );

    return result.rows
      .filter(
        (row) =>
          includePsfHistory ||
          row.action_type !==
            REQUEST_AUDIT_ACTION.PSF_CREATED_INFORMATION_UPDATED,
      )
      .map((row) => this.toHistoryEntry(row));
  }

  async findRequestSnapshot(
    requestId: string,
    entryId: string,
  ): Promise<
    | { entry: RequestAuditHistoryEntry; requestSnapshot: RequestSnapshot }
    | undefined
  > {
    if (!UUID_PATTERN.test(entryId)) return undefined;
    const result = await this.pool.query<
      RequestAuditHistoryRow & { request_snapshot_json: RequestSnapshot }
    >(
      `
        SELECT
          id,
          TRUE AS has_request_snapshot,
          action_type,
          actor_display_name,
          actor_role,
          created_at,
          metadata_json,
          request_snapshot_json
        FROM psf_request_audit_logs
        WHERE request_id = $1
          AND id = $2::uuid
          AND request_snapshot_json IS NOT NULL
      `,
      [requestId, entryId],
    );
    const row = result.rows[0];
    return (
      row && {
        entry: this.toHistoryEntry(row),
        requestSnapshot: row.request_snapshot_json,
      }
    );
  }

  private toHistoryEntry(
    row: RequestAuditHistoryRow,
  ): RequestAuditHistoryEntry {
    return {
      id: row.id,
      hasRequestSnapshot: row.has_request_snapshot,
      actionType: row.action_type,
      actorDisplayName: row.actor_display_name,
      actorRole: row.actor_role,
      createdAt: this.serializeTimestamp(row.created_at),
      metadata: row.metadata_json,
    };
  }

  parsePage(filters: GlobalAuditLogFilters): { limit: number; offset: number } {
    const read = (value: unknown, fallback: number): number => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || !/^\d+$/.test(value))
        throw new BadRequestException('Invalid pagination.');
      return Number(value);
    };
    const limit = read(filters.limit, 25);
    const offset = read(filters.offset, 0);
    if (limit < 1 || limit > 100)
      throw new BadRequestException('Invalid pagination.');
    return { limit, offset };
  }

  async countGlobalAuditLogs(
    filters: GlobalAuditLogFilters = {},
    actor?: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
  ): Promise<number> {
    const { whereSql, values } = this.buildGlobalWhere(filters, actor);
    const result = await this.pool.query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM psf_request_audit_logs AS audit_log
        LEFT JOIN psf_requests AS psf_request ON psf_request.id = audit_log.request_id
        ${whereSql}
      `,
      values,
    );
    return result.rows[0]?.total ?? 0;
  }

  async findGlobalAuditLogs(
    filters: GlobalAuditLogFilters = {},
    actor?: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
    page?: { limit: number; offset: number },
  ): Promise<GlobalAuditLogEntry[]> {
    const { whereSql, values } = this.buildGlobalWhere(filters, actor);
    const paging = page
      ? `LIMIT $${values.push(page.limit)} OFFSET $${values.push(page.offset)}`
      : '';

    const result = await this.pool.query<GlobalAuditLogRow>(
      `
        SELECT
          audit_log.id,
          audit_log.request_snapshot_json IS NOT NULL AS has_request_snapshot,
          audit_log.request_id,
          psf_request.request_no,
          psf_request.status AS request_status,
          psf_request.numeric_id AS request_numeric_id,
          psf_request.requester_data_json->>'title' AS request_title,
          audit_log.action_type,
          audit_log.actor_display_name,
          audit_log.actor_role,
          audit_log.created_at,
          audit_log.metadata_json
        FROM psf_request_audit_logs AS audit_log
        LEFT JOIN psf_requests AS psf_request ON psf_request.id = audit_log.request_id
        ${whereSql}
        ORDER BY audit_log.created_at DESC, audit_log.id DESC
        ${paging}
      `,
      values,
    );

    return result.rows.map((row) => ({
      id: row.id,
      hasRequestSnapshot: row.has_request_snapshot,
      requestId: row.request_id,
      requestNo: row.request_no,
      requestLabel: this.requestLabel(row),
      actionType: row.action_type,
      actorDisplayName: row.actor_display_name,
      actorRole: row.actor_role,
      createdAt: this.serializeTimestamp(row.created_at),
      metadata:
        row.action_type === REQUEST_AUDIT_ACTION.WORKFLOW_CATALOG_UPDATED &&
        actor?.role !== 'admin'
          ? this.publicCatalogMetadata(row.metadata_json)
          : row.metadata_json,
    }));
  }

  private requestLabel(row: GlobalAuditLogRow): string | null {
    if (row.request_numeric_id === null || row.request_numeric_id === undefined)
      return null;
    const title = row.request_title?.trim();
    if (title) return title;
    return `Untitled ${row.request_status === 'Draft' ? 'Draft' : 'Request'} (#${row.request_numeric_id})`;
  }

  private buildGlobalWhere(
    filters: GlobalAuditLogFilters,
    actor?: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
  ): { whereSql: string; values: unknown[] } {
    const requestId = this.parseOptionalUuid(filters.requestId);
    if (filters.keyword !== undefined && typeof filters.keyword !== 'string') {
      throw new BadRequestException('keyword must be text.');
    }
    const keyword = this.normalizeOptionalString(filters.keyword);
    const user = this.normalizeOptionalString(filters.user);
    const actionType = this.normalizeOptionalString(filters.actionType);
    const from = this.parseBangkokDay(filters.from, 'from');
    const to = this.parseBangkokDay(filters.to, 'to');
    if (from && to && from > to) {
      throw new BadRequestException('to must be on or after from.');
    }
    const values: unknown[] = [];
    const where: string[] = [];
    const addParameter = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (
      actionType &&
      !Object.values(REQUEST_AUDIT_ACTION).includes(
        actionType as RequestAuditAction,
      )
    ) {
      throw new BadRequestException(
        'actionType must be a supported audit action.',
      );
    }

    if (requestId) {
      where.push(`audit_log.request_id = ${addParameter(requestId)}`);
    }

    if (user) {
      where.push(`audit_log.actor_username ILIKE ${addParameter(`%${user}%`)}`);
    }

    if (keyword) {
      const match = addParameter(`%${keyword}%`);
      where.push(`(
        psf_request.request_no ILIKE ${match}
        OR psf_request.requester_data_json->>'title' ILIKE ${match}
        OR audit_log.actor_display_name ILIKE ${match}
        OR audit_log.actor_username ILIKE ${match}
      )`);
    }

    if (actionType) {
      where.push(`audit_log.action_type = ${addParameter(actionType)}`);
    }

    if (actor) {
      values.push(actor.id);
      where.push(`(
        audit_log.request_id IS NULL
        OR psf_request.id IS NULL
        OR psf_request.status <> 'Draft'
        OR psf_request.requester_user_id = $${values.length}::uuid
      )`);
    }

    // Apply visibility before results are selected, including explicit action filters.
    // Request-specific history uses the same event suppression before PSF release.
    if (actor?.role === 'requester') {
      where.push(`(
        audit_log.action_type <> ${addParameter(REQUEST_AUDIT_ACTION.PSF_CREATED_INFORMATION_UPDATED)}
        OR psf_request.psf_released_at IS NOT NULL
      )`);
    }

    if (from) {
      where.push(`audit_log.created_at >= ${addParameter(from)}`);
    }

    if (to) {
      where.push(
        `audit_log.created_at < ${addParameter(new Date(to.getTime() + 86_400_000))}`,
      );
    }

    // Workflow catalog updates are still recorded but left out of Audit History.
    where.push(
      `audit_log.action_type <> ${addParameter(REQUEST_AUDIT_ACTION.WORKFLOW_CATALOG_UPDATED)}`,
    );

    return {
      whereSql:
        where.length > 0 ? `WHERE ${where.join('\n          AND ')}` : '',
      values,
    };
  }

  private publicCatalogMetadata(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    const redact = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(redact);
      if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== 'emailPolicy')
            .map(([key, item]) => [key, redact(item)]),
        );
      }
      return value;
    };
    return redact(metadata) as Record<string, unknown>;
  }

  private async ensureStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS psf_request_audit_logs (
        id UUID PRIMARY KEY,
        request_id UUID,
        action_type TEXT NOT NULL,
        actor_id UUID NOT NULL,
        actor_username TEXT NOT NULL,
        actor_display_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      ALTER TABLE psf_request_audit_logs
      ALTER COLUMN request_id DROP NOT NULL
    `);

    await this.pool.query(`
      ALTER TABLE psf_request_audit_logs
      ADD COLUMN IF NOT EXISTS request_snapshot_json JSONB NULL
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_audit_logs_request_created_at
      ON psf_request_audit_logs (request_id, created_at DESC)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_audit_logs_created_at
      ON psf_request_audit_logs (created_at DESC, id DESC)
    `);
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized || undefined;
  }

  private parseOptionalUuid(value: unknown): string | undefined {
    if (value !== undefined && typeof value !== 'string') {
      throw new BadRequestException('requestId must be a UUID.');
    }

    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return undefined;
    }

    if (!UUID_PATTERN.test(normalized)) {
      throw new BadRequestException('requestId must be a UUID.');
    }

    return normalized;
  }

  private parseBangkokDay(
    value: unknown,
    name: 'from' | 'to',
  ): Date | undefined {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return undefined;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(
        `${name} must be an ISO calendar date (Asia/Bangkok).`,
      );
    }

    const day = new Date(`${normalized}T00:00:00.000Z`);

    if (
      Number.isNaN(day.getTime()) ||
      day.toISOString().slice(0, 10) !== normalized
    ) {
      throw new BadRequestException(
        `${name} must be an ISO calendar date (Asia/Bangkok).`,
      );
    }

    // Bangkok is UTC+07:00 year-round; local midnight is the previous UTC day.
    return new Date(day.getTime() - 7 * 60 * 60 * 1000);
  }

  private serializeTimestamp(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }
}

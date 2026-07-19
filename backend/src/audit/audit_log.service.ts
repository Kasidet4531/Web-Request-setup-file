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

export const REQUEST_AUDIT_ACTION = {
  DRAFT_CREATED: 'DRAFT_CREATED',
  DRAFT_REQUESTER_DATA_UPDATED: 'DRAFT_REQUESTER_DATA_UPDATED',
  REQUEST_SUBMITTED: 'REQUEST_SUBMITTED',
  REQUEST_STATUS_CHANGED: 'REQUEST_STATUS_CHANGED',
} as const;

export type RequestAuditAction =
  (typeof REQUEST_AUDIT_ACTION)[keyof typeof REQUEST_AUDIT_ACTION];

export interface RecordRequestAuditAction {
  requestId: string;
  actionType: RequestAuditAction;
  actor: AuthenticatedUserProfile;
  metadata: Record<string, unknown>;
}

export interface RequestAuditHistoryEntry {
  actionType: RequestAuditAction;
  actorDisplayName: string;
  actorRole: AuthenticatedUserProfile['role'];
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface GlobalAuditLogFilters {
  requestId?: string;
  user?: string;
  actionType?: string;
  from?: string;
  to?: string;
}

export interface GlobalAuditLogEntry {
  requestId: string;
  requestNo: string;
  actionType: RequestAuditAction;
  actorDisplayName: string;
  actorRole: AuthenticatedUserProfile['role'];
  createdAt: string;
  metadata: Record<string, unknown>;
}

interface RequestAuditHistoryRow {
  action_type: RequestAuditAction;
  actor_display_name: string;
  actor_role: AuthenticatedUserProfile['role'];
  created_at: Date | string;
  metadata_json: Record<string, unknown>;
}

interface GlobalAuditLogRow {
  request_id: string;
  request_no: string;
  action_type: RequestAuditAction;
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
          created_at
        )
        VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8::jsonb, NOW())
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
      ],
    );
  }

  async findByRequestId(
    requestId: string,
  ): Promise<RequestAuditHistoryEntry[]> {
    const result = await this.pool.query<RequestAuditHistoryRow>(
      `
        SELECT
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

    return result.rows.map((row) => ({
      actionType: row.action_type,
      actorDisplayName: row.actor_display_name,
      actorRole: row.actor_role,
      createdAt: this.serializeTimestamp(row.created_at),
      metadata: row.metadata_json,
    }));
  }

  // ponytail: unpaged global audit list; add cursor pagination when audit volume is measured.
  async findGlobalAuditLogs(
    filters: GlobalAuditLogFilters = {},
  ): Promise<GlobalAuditLogEntry[]> {
    const requestId = this.parseOptionalUuid(filters.requestId);
    const user = this.normalizeOptionalString(filters.user);
    const actionType = this.normalizeOptionalString(filters.actionType);
    const from = this.parseUtcDay(filters.from, 'from');
    const to = this.parseUtcDay(filters.to, 'to');
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

    if (actionType) {
      where.push(`audit_log.action_type = ${addParameter(actionType)}`);
    }

    if (from) {
      where.push(`audit_log.created_at >= ${addParameter(from)}`);
    }

    if (to) {
      where.push(`audit_log.created_at < ${addParameter(this.nextUtcDay(to))}`);
    }

    const result = await this.pool.query<GlobalAuditLogRow>(
      `
        SELECT
          audit_log.request_id,
          psf_request.request_no,
          audit_log.action_type,
          audit_log.actor_display_name,
          audit_log.actor_role,
          audit_log.created_at,
          audit_log.metadata_json
        FROM psf_request_audit_logs AS audit_log
        JOIN psf_requests AS psf_request ON psf_request.id = audit_log.request_id
        ${where.length > 0 ? `WHERE ${where.join('\n          AND ')}` : ''}
        ORDER BY audit_log.created_at DESC, audit_log.id DESC
      `,
      values,
    );

    return result.rows.map((row) => ({
      requestId: row.request_id,
      requestNo: row.request_no,
      actionType: row.action_type,
      actorDisplayName: row.actor_display_name,
      actorRole: row.actor_role,
      createdAt: this.serializeTimestamp(row.created_at),
      metadata: row.metadata_json,
    }));
  }

  private async ensureStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS psf_request_audit_logs (
        id UUID PRIMARY KEY,
        request_id UUID NOT NULL,
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

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        normalized,
      )
    ) {
      throw new BadRequestException('requestId must be a UUID.');
    }

    return normalized;
  }

  private parseUtcDay(value: unknown, name: 'from' | 'to'): Date | undefined {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return undefined;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(
        `${name} must be an ISO UTC calendar date.`,
      );
    }

    const day = new Date(`${normalized}T00:00:00.000Z`);

    if (
      Number.isNaN(day.getTime()) ||
      day.toISOString().slice(0, 10) !== normalized
    ) {
      throw new BadRequestException(
        `${name} must be an ISO UTC calendar date.`,
      );
    }

    return day;
  }

  private nextUtcDay(day: Date): Date {
    return new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1),
    );
  }

  private serializeTimestamp(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }
}

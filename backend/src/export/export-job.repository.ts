import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import { DATABASE_POOL } from '../database/database.service';
import type {
  RequestExportFilters,
  RequestExportWorkbook,
} from './excel_export.service';

export const STALE_EXPORT_FAILURE_MESSAGE =
  'Export processing did not finish. Please start a new export.';

export type ExportJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type ExportJobActor = Pick<AuthenticatedUserProfile, 'id'> & {
  role: 'admin' | 'requester';
};

export interface ExportJob {
  id: string;
  ownerUserId: string;
  ownerRole: ExportJobActor['role'];
  filters: RequestExportFilters;
  status: ExportJobStatus;
  attemptCount: number;
  queuedAt: string;
  startedAt: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  filename: string | null;
  content: Buffer | null;
  failureMessage: string | null;
  claimToken: string | null;
}

interface ExportJobRow {
  id: string;
  owner_user_id: string;
  owner_role: ExportJobActor['role'];
  filters_json: unknown;
  status: ExportJobStatus;
  attempt_count: number;
  queued_at: Date | string;
  started_at: Date | string | null;
  claimed_at: Date | string | null;
  completed_at: Date | string | null;
  failed_at: Date | string | null;
  filename: string | null;
  content?: Buffer | null;
  failure_message: string | null;
  claim_token: string | null;
}

@Injectable()
export class ExportJobRepository implements OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS psf_export_jobs (
        id UUID PRIMARY KEY,
        owner_user_id UUID NOT NULL,
        owner_role TEXT NOT NULL CHECK (owner_role IN ('admin', 'requester')),
        filters_json JSONB NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        claimed_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        failed_at TIMESTAMPTZ,
        claim_token UUID,
        filename TEXT,
        content BYTEA,
        failure_message TEXT
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_export_jobs_queued
      ON psf_export_jobs (queued_at ASC)
      WHERE status = 'queued'
    `);
  }

  async enqueue(
    filters: RequestExportFilters,
    actor: ExportJobActor,
  ): Promise<ExportJob> {
    const result = await this.pool.query<ExportJobRow>(
      `
        INSERT INTO psf_export_jobs (
          id,
          owner_user_id,
          owner_role,
          filters_json,
          status
        )
        VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, 'queued')
        RETURNING ${this.selectColumns(true)}
      `,
      [randomUUID(), actor.id, actor.role, JSON.stringify(filters)],
    );

    return this.toJob(this.requireRow(result.rows[0]));
  }

  async findOwned(id: string, ownerUserId: string): Promise<ExportJob | null> {
    const result = await this.pool.query<ExportJobRow>(
      `
        SELECT ${this.selectColumns(false)}
        FROM psf_export_jobs
        WHERE id = $1::uuid AND owner_user_id = $2::uuid
      `,
      [id, ownerUserId],
    );

    return result.rows[0] ? this.toJob(result.rows[0]) : null;
  }

  async findOwnedContent(
    id: string,
    ownerUserId: string,
  ): Promise<ExportJob | null> {
    const result = await this.pool.query<ExportJobRow>(
      `
        SELECT ${this.selectColumns(true)}
        FROM psf_export_jobs
        WHERE id = $1::uuid AND owner_user_id = $2::uuid
      `,
      [id, ownerUserId],
    );

    return result.rows[0] ? this.toJob(result.rows[0]) : null;
  }

  async claimNext(
    staleBefore: Date,
    maximumAttempts: number,
  ): Promise<ExportJob | null> {
    await this.pool.query(
      `
        UPDATE psf_export_jobs
        SET status = 'queued',
            started_at = NULL,
            claimed_at = NULL,
            claim_token = NULL
        WHERE status = 'running'
          AND claimed_at < $1::timestamptz
          AND attempt_count < $2
      `,
      [staleBefore, maximumAttempts],
    );
    await this.pool.query(
      `
        UPDATE psf_export_jobs
        SET status = 'failed',
            claimed_at = NULL,
            claim_token = NULL,
            failed_at = NOW(),
            failure_message = $2
        WHERE status = 'running'
          AND claimed_at < $1::timestamptz
          AND attempt_count >= $3
      `,
      [staleBefore, STALE_EXPORT_FAILURE_MESSAGE, maximumAttempts],
    );

    const result = await this.pool.query<ExportJobRow>(
      `
        WITH candidate AS (
          SELECT id
          FROM psf_export_jobs
          WHERE status = 'queued'
          ORDER BY queued_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE psf_export_jobs AS job
        SET status = 'running',
            started_at = NOW(),
            claimed_at = NOW(),
            claim_token = $1::uuid,
            attempt_count = job.attempt_count + 1
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING ${this.selectColumns(false)}
      `,
      [randomUUID()],
    );

    return result.rows[0] ? this.toJob(result.rows[0]) : null;
  }

  async refreshClaim(id: string, claimToken: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        UPDATE psf_export_jobs
        SET claimed_at = NOW()
        WHERE id = $1::uuid
          AND status = 'running'
          AND claim_token = $2::uuid
      `,
      [id, claimToken],
    );

    return result.rowCount === 1;
  }

  async complete(
    id: string,
    claimToken: string,
    workbook: RequestExportWorkbook,
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE psf_export_jobs
        SET status = 'completed',
            completed_at = NOW(),
            filename = $3,
            content = $4,
            failure_message = NULL
        WHERE id = $1::uuid
          AND status = 'running'
          AND claim_token = $2::uuid
      `,
      [id, claimToken, workbook.filename, workbook.content],
    );
  }

  async fail(
    id: string,
    claimToken: string,
    failureMessage: string,
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE psf_export_jobs
        SET status = 'failed',
            failed_at = NOW(),
            failure_message = $3
        WHERE id = $1::uuid
          AND status = 'running'
          AND claim_token = $2::uuid
      `,
      [id, claimToken, failureMessage],
    );
  }

  private selectColumns(includeContent: boolean): string {
    return [
      'id',
      'owner_user_id',
      'owner_role',
      'filters_json',
      'status',
      'attempt_count',
      'queued_at',
      'started_at',
      'claimed_at',
      'completed_at',
      'failed_at',
      'filename',
      ...(includeContent ? ['content'] : []),
      'failure_message',
      'claim_token',
    ].join(', ');
  }

  private requireRow(row: ExportJobRow | undefined): ExportJobRow {
    if (!row) {
      throw new Error('Unable to persist export job.');
    }

    return row;
  }

  private toJob(row: ExportJobRow): ExportJob {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      ownerRole: row.owner_role,
      filters: this.parseFilters(row.filters_json),
      status: row.status,
      attemptCount: row.attempt_count,
      queuedAt: this.serializeTimestamp(row.queued_at) ?? '',
      startedAt: this.serializeTimestamp(row.started_at),
      claimedAt: this.serializeTimestamp(row.claimed_at),
      completedAt: this.serializeTimestamp(row.completed_at),
      failedAt: this.serializeTimestamp(row.failed_at),
      filename: row.filename,
      content: row.content ?? null,
      failureMessage: row.failure_message,
      claimToken: row.claim_token,
    };
  }

  private parseFilters(value: unknown): RequestExportFilters {
    let candidate = value;

    if (typeof candidate === 'string') {
      try {
        candidate = JSON.parse(candidate) as unknown;
      } catch {
        candidate = {};
      }
    }

    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      return {};
    }

    const filters = candidate as Record<string, unknown>;
    return {
      ...(typeof filters.status === 'string' ? { status: filters.status } : {}),
      ...(typeof filters.requestDateFrom === 'string'
        ? { requestDateFrom: filters.requestDateFrom }
        : {}),
      ...(typeof filters.requestDateTo === 'string'
        ? { requestDateTo: filters.requestDateTo }
        : {}),
    };
  }

  private serializeTimestamp(value: Date | string | null): string | null {
    if (value === null) {
      return null;
    }

    return value instanceof Date ? value.toISOString() : value;
  }
}

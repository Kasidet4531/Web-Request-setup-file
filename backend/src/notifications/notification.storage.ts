import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.service';
import { MAIL_FROM } from './mail.config';
import { safeMailError } from './soap-mail';
import {
  renderFailureAlert,
  type FailureAlertJob,
} from './notification.template';
import type {
  NotificationClient,
  OutboxJob,
  OutboxSnapshot,
  OutboxStatus,
} from './notification.types';
export const RETRY_MINUTES = [1, 5, 15, 60] as const;
export const OUTBOX_SCHEMA = `
CREATE TABLE IF NOT EXISTS email_outbox (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 event_type TEXT NOT NULL CHECK (event_type IN ('REQUEST_SUBMITTED','REQUEST_STATUS_CHANGED','ADMIN_ALERT','ADMIN_TEST')),
 request_id UUID REFERENCES psf_requests(id) ON DELETE SET NULL,
 from_address TEXT NOT NULL CHECK (from_address = 'noreply-psf@nxp.com'),
 to_recipients TEXT NOT NULL CHECK (length(trim(to_recipients)) > 0),
 cc_recipients TEXT NOT NULL DEFAULT '', bcc_recipients TEXT NOT NULL DEFAULT '', sent_to TEXT,
 subject TEXT NOT NULL, body_html TEXT NOT NULL,
 target_status_id TEXT, target_status_name TEXT, from_status_name TEXT, request_no TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
 is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
 failure_alerted BOOLEAN NOT NULL DEFAULT FALSE,
 attempts INT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), locked_at TIMESTAMPTZ,
 claim_token UUID, last_error TEXT, sent_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS failure_alerted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_email_outbox_unreported_failures ON email_outbox (created_at,id) WHERE status='failed' AND attempts>=5 AND event_type<>'ADMIN_ALERT' AND NOT failure_alerted;
CREATE INDEX IF NOT EXISTS idx_email_outbox_polling ON email_outbox (next_attempt_at,created_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_email_outbox_stuck_recovery ON email_outbox (locked_at) WHERE status='sending';
CREATE INDEX IF NOT EXISTS idx_email_outbox_request_id ON email_outbox (request_id);
CREATE INDEX IF NOT EXISTS idx_email_outbox_admin_list ON email_outbox (created_at DESC,status,is_fallback);
`;
export interface OutboxListFilters {
  page?: string;
  limit?: string;
  status?: string;
  isFallback?: string;
}
@Injectable()
export class NotificationStorage {
  private initialization: Promise<void> | undefined;
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}
  initialize(): Promise<void> {
    this.initialization ??= this.pool
      .query(OUTBOX_SCHEMA)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.initialization = undefined;
        throw error;
      });
    return this.initialization;
  }
  async insert(
    client: NotificationClient,
    snapshot: OutboxSnapshot,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO email_outbox
      (event_type,request_id,from_address,to_recipients,cc_recipients,bcc_recipients,subject,body_html,target_status_id,target_status_name,from_status_name,request_no)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        snapshot.event_type,
        snapshot.request_id,
        MAIL_FROM,
        snapshot.to_recipients,
        snapshot.cc_recipients,
        snapshot.bcc_recipients,
        snapshot.subject,
        snapshot.body_html,
        snapshot.target_status_id ?? null,
        snapshot.target_status_name ?? null,
        snapshot.from_status_name ?? null,
        snapshot.request_no ?? null,
      ],
    );
    return result.rows[0].id;
  }
  insertStandalone(snapshot: OutboxSnapshot): Promise<string> {
    return this.insert(this.pool, snapshot);
  }
  async insertClaimedTest(snapshot: OutboxSnapshot): Promise<OutboxJob> {
    const result = await this.pool.query<OutboxJob>(
      `INSERT INTO email_outbox
      (event_type,from_address,to_recipients,cc_recipients,bcc_recipients,subject,body_html,status,attempts,claim_token,locked_at)
      VALUES ('ADMIN_TEST',$1,$2,$3,$4,$5,$6,'sending',1,$7,NOW()) RETURNING *`,
      [
        MAIL_FROM,
        snapshot.to_recipients,
        snapshot.cc_recipients,
        snapshot.bcc_recipients,
        snapshot.subject,
        snapshot.body_html,
        randomUUID(),
      ],
    );
    return result.rows[0];
  }
  async claim(limit = 10, id?: string): Promise<OutboxJob[]> {
    const bounded = Math.min(10, Math.max(1, Math.trunc(limit)));
    const result = await this.pool.query<OutboxJob>(
      `WITH picked AS (
      SELECT id FROM email_outbox WHERE status='pending' AND next_attempt_at<=NOW() AND attempts<5
      AND ($3::uuid IS NULL OR id=$3::uuid) ORDER BY next_attempt_at,created_at
      LIMIT $1 FOR UPDATE SKIP LOCKED)
      UPDATE email_outbox e SET status='sending', attempts=e.attempts+1,locked_at=NOW(),claim_token=$2,updated_at=NOW()
      FROM picked WHERE e.id=picked.id RETURNING e.*`,
      [bounded, randomUUID(), id ?? null],
    );
    return result.rows;
  }
  async recover(): Promise<OutboxJob[]> {
    const result = await this.pool.query<OutboxJob>(`UPDATE email_outbox SET
      status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
      next_attempt_at=NOW() + (CASE attempts WHEN 1 THEN 1 WHEN 2 THEN 5 WHEN 3 THEN 15 ELSE 60 END)*INTERVAL '1 minute',
      last_error='Delivery claim expired before completion',locked_at=NULL,claim_token=NULL,updated_at=NOW()
      WHERE status='sending' AND locked_at < NOW()-INTERVAL '5 minutes'
      RETURNING *`);
    return result.rows.filter((job) => job.status === 'failed');
  }
  async markSent(job: OutboxJob, sentTo: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE email_outbox SET status='sent',sent_to=$3,sent_at=NOW(),last_error=NULL,
      locked_at=NULL,claim_token=NULL,updated_at=NOW() WHERE id=$1 AND status='sending' AND claim_token=$2`,
      [job.id, job.claim_token, sentTo],
    );
    return result.rowCount === 1;
  }
  async markFailed(
    job: OutboxJob,
    error: unknown,
    terminal = false,
  ): Promise<'pending' | 'failed' | null> {
    const status = terminal || job.attempts >= 5 ? 'failed' : 'pending';
    const delay = RETRY_MINUTES[Math.min(Math.max(job.attempts - 1, 0), 3)];
    const result = await this.pool.query(
      `UPDATE email_outbox SET status=$3,last_error=$4,
      next_attempt_at=NOW()+$5*INTERVAL '1 minute',locked_at=NULL,claim_token=NULL,updated_at=NOW()
      WHERE id=$1 AND status='sending' AND claim_token=$2`,
      [job.id, job.claim_token, status, safeMailError(error), delay],
    );
    return result.rowCount === 1 ? status : null;
  }
  async enqueueFailureAlert(to: string): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const failures = await client.query<FailureAlertJob>(
        `SELECT id,event_type,request_id,request_no,to_recipients,cc_recipients,attempts,last_error
        FROM email_outbox WHERE status='failed' AND attempts>=5
        AND event_type<>'ADMIN_ALERT' AND NOT failure_alerted
        ORDER BY created_at,id LIMIT 10 FOR UPDATE SKIP LOCKED`,
      );
      if (!failures.rows.length) {
        await client.query('COMMIT');
        return null;
      }
      const rendered = renderFailureAlert(failures.rows);
      const id = await this.insert(client, {
        event_type: 'ADMIN_ALERT',
        request_id: null,
        to_recipients: to,
        cc_recipients: '',
        bcc_recipients: '',
        subject: rendered.subject,
        body_html: rendered.html,
      });
      await client.query(
        'UPDATE email_outbox SET failure_alerted=TRUE WHERE id=ANY($1::uuid[])',
        [failures.rows.map((job) => job.id)],
      );
      await client.query('COMMIT');
      return id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async resend(id: string) {
    this.validateId(id);
    const result = await this.pool.query<Record<string, unknown>>(
      `UPDATE email_outbox SET status='pending',attempts=0,next_attempt_at=NOW(),
      locked_at=NULL,claim_token=NULL,last_error=NULL,sent_at=NULL,sent_to=NULL,failure_alerted=FALSE,updated_at=NOW()
      WHERE id=$1 AND status='failed' RETURNING id,event_type,request_id,from_address,to_recipients,cc_recipients,bcc_recipients,sent_to,subject,status,is_fallback,attempts,next_attempt_at,locked_at,last_error,sent_at,created_at,updated_at,target_status_id,target_status_name,from_status_name,request_no`,
      [id],
    );
    if (!result.rowCount) {
      const existing = await this.pool.query(
        'SELECT id FROM email_outbox WHERE id=$1',
        [id],
      );
      if (!existing.rowCount)
        throw new NotFoundException('Notification not found');
      throw new BadRequestException(
        'Only failed notifications can be reset for resending',
      );
    }
    return this.summary(result.rows[0]);
  }
  async list(filters: OutboxListFilters) {
    const page = this.positiveInteger(filters.page, 1, 1_000_000, 'page');
    const limit = this.positiveInteger(filters.limit, 20, 100, 'limit');
    const status = filters.status as OutboxStatus | undefined;
    if (
      status !== undefined &&
      !['pending', 'sending', 'sent', 'failed'].includes(status)
    )
      throw new BadRequestException('Invalid notification status');
    if (
      filters.isFallback !== undefined &&
      !['true', 'false'].includes(filters.isFallback)
    )
      throw new BadRequestException('isFallback must be true or false');
    const values = [
      status ?? null,
      filters.isFallback === undefined ? null : filters.isFallback === 'true',
    ];
    const where =
      'WHERE ($1::text IS NULL OR status=$1) AND ($2::boolean IS NULL OR is_fallback=$2)';
    const result = await this.pool.query(
      `SELECT id,event_type,request_id,from_address,to_recipients,cc_recipients,bcc_recipients,
      sent_to,subject,status,is_fallback,attempts,next_attempt_at,locked_at,last_error,sent_at,created_at,updated_at,target_status_id,target_status_name,from_status_name,request_no
      FROM email_outbox ${where} ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4`,
      [...values, limit, (page - 1) * limit],
    );
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM email_outbox ${where}`,
      values,
    );
    return {
      items: result.rows.map((row: Record<string, unknown>) =>
        this.summary(row),
      ),
      total: Number(count.rows[0].total),
      page,
      limit,
    };
  }
  private summary(row: Record<string, unknown>) {
    return {
      id: row.id,
      eventType: row.event_type,
      requestId: row.request_id,
      requestNo: row.request_no,
      fromAddress: row.from_address,
      to: row.to_recipients,
      cc: row.cc_recipients,
      bcc: row.bcc_recipients,
      sentTo: row.sent_to,
      subject: row.subject,
      status: row.status,
      isFallback: row.is_fallback,
      attempts: row.attempts,
      nextAttemptAt: row.next_attempt_at,
      lockedAt: row.locked_at,
      lastError: row.last_error,
      sentAt: row.sent_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      targetStatusId: row.target_status_id,
      targetStatusName: row.target_status_name,
      fromStatusName: row.from_status_name,
    };
  }
  private positiveInteger(
    raw: string | undefined,
    fallback: number,
    max: number,
    name: string,
  ): number {
    if (raw === undefined) return fallback;
    if (
      typeof raw !== 'string' ||
      !/^\d+$/.test(raw) ||
      Number(raw) < 1 ||
      Number(raw) > max
    )
      throw new BadRequestException(`Invalid ${name}`);
    return Number(raw);
  }
  private validateId(id: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new BadRequestException('Invalid notification id');
  }
}

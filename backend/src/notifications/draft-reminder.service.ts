import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../database/database.service';
import { MailConfig, emailAddresses } from './mail.config';
import { NotificationStorage } from './notification.storage';
import { escapeHtml } from './notification.template';
import type { OutboxJob } from './notification.types';

export interface SkippedDraftRecipient {
  userId: string | null;
  displayName: string;
  reason: string;
}
interface DraftRow {
  id: string;
  request_no: string;
  requester: string;
  requester_user_id: string | null;
  created_at: Date | string;
  age_hours: string;
}
interface RecipientRow {
  id: string;
  display_name: string;
  email: string | null;
}
@Injectable()
export class DraftReminderService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly storage: NotificationStorage,
    private readonly config: MailConfig,
  ) {}
  async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS draft_reminders (
      request_id UUID PRIMARY KEY REFERENCES psf_requests(id) ON DELETE CASCADE,
      outbox_id UUID REFERENCES email_outbox(id) ON DELETE SET NULL,
      state TEXT NOT NULL DEFAULT 'unresolved' CHECK (state IN ('unresolved','queued','cancelled')),
      queued_at TIMESTAMPTZ,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      skipped_recipients JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    ALTER TABLE draft_reminders ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  }
  async scan(): Promise<void> {
    await this.transaction(async (client) => {
      const drafts =
        await client.query<DraftRow>(`SELECT r.id,r.request_no,r.requester,r.requester_user_id,r.created_at,
        EXTRACT(EPOCH FROM (NOW()-r.created_at))/3600 AS age_hours
        FROM psf_requests r LEFT JOIN draft_reminders d ON d.request_id=r.id
        WHERE r.status='Draft' AND r.created_at<=NOW()-INTERVAL '168 hours'
        AND (d.request_id IS NULL OR d.state='unresolved')
        ORDER BY d.checked_at NULLS FIRST,r.created_at,r.id LIMIT 50 FOR UPDATE OF r SKIP LOCKED`);
      for (const draft of drafts.rows) {
        const marker = await client.query<{ state: string }>(
          'SELECT state FROM draft_reminders WHERE request_id=$1',
          [draft.id],
        );
        if (marker.rows[0] && marker.rows[0].state !== 'unresolved') continue;
        const accounts = await client.query<RecipientRow>(
          `SELECT id,display_name,email FROM app_users
          WHERE id=$1 OR role='admin' ORDER BY id`,
          [draft.requester_user_id],
        );
        const skipped: SkippedDraftRecipient[] = [];
        const addresses = new Map<string, string>();
        for (const account of accounts.rows) {
          let email: string | undefined;
          try {
            const parsed = emailAddresses(account.email ?? '');
            if (parsed.length === 1) email = parsed[0];
          } catch {
            /* Invalid account addresses remain visible for correction. */
          }
          if (email) addresses.set(account.id, email);
          else
            skipped.push({
              userId: account.id,
              displayName: account.display_name,
              reason: account.email?.trim()
                ? 'Invalid email address'
                : 'Missing email address',
            });
        }
        if (
          !accounts.rows.some(
            (account) => account.id === draft.requester_user_id,
          )
        )
          skipped.push({
            userId: draft.requester_user_id,
            displayName: draft.requester,
            reason: 'Creator account unavailable',
          });
        const creator = draft.requester_user_id
          ? addresses.get(draft.requester_user_id)
          : undefined;
        const adminAddresses = [...new Set(addresses.values())].filter(
          (address) => address !== creator,
        );
        const to = creator ? [creator] : adminAddresses;
        const cc = creator ? adminAddresses : [];
        await client.query(
          `INSERT INTO draft_reminders(request_id,skipped_recipients) VALUES ($1,$2::jsonb)
          ON CONFLICT(request_id) DO UPDATE SET skipped_recipients=EXCLUDED.skipped_recipients,checked_at=NOW() WHERE draft_reminders.state='unresolved'`,
          [draft.id, JSON.stringify(skipped)],
        );
        // Disabled mail may still prepare a durable snapshot when APP_BASE_URL is configured.
        if (!to.length || !this.config.baseUrl) continue;
        const created = new Date(draft.created_at).toLocaleString('en-GB', {
          timeZone: 'Asia/Bangkok',
        });
        const creatorLink = `${this.config.baseUrl}/requests/${draft.id}`;
        const adminLink = `${this.config.baseUrl}/admin/drafts/${draft.id}`;
        const id = await this.storage.insert(client, {
          event_type: 'DRAFT_REMINDER',
          request_id: draft.id,
          request_no: draft.request_no,
          to_recipients: to.join(','),
          cc_recipients: cc.join(','),
          bcc_recipients: '',
          subject: `Draft reminder: ${draft.request_no}`,
          body_html: `<h1>Draft reminder</h1><p>${escapeHtml(draft.request_no)}</p><p>Creator: ${escapeHtml(draft.requester)}</p><p>Created: ${escapeHtml(created)} (Asia/Bangkok)</p><p>Age: ${Math.floor(Number(draft.age_hours))} hours</p><p><a href="${escapeHtml(creatorLink)}">Open your Draft</a></p><p><a href="${escapeHtml(adminLink)}">Admin Draft Management</a></p>`,
        });
        await client.query(
          "UPDATE draft_reminders SET state='queued',outbox_id=$2,queued_at=NOW() WHERE request_id=$1",
          [draft.id, id],
        );
      }
    });
  }
  async list() {
    const result = await this.pool.query<{
      request_id: string;
      request_no: string;
      state: string;
      queued_at: Date | string | null;
      skipped_recipients: SkippedDraftRecipient[];
    }>(`SELECT d.request_id,r.request_no,
      CASE WHEN d.state='queued' THEN COALESCE(e.status,'cancelled') ELSE d.state END AS state,
      d.queued_at,d.skipped_recipients FROM draft_reminders d JOIN psf_requests r ON r.id=d.request_id
      LEFT JOIN email_outbox e ON e.id=d.outbox_id WHERE r.status='Draft' ORDER BY r.created_at,r.id`);
    return {
      items: result.rows.map((row) => ({
        requestId: row.request_id,
        requestNo: row.request_no,
        state: row.state,
        queuedAt:
          row.queued_at instanceof Date
            ? row.queued_at.toISOString()
            : row.queued_at,
        skippedRecipients: row.skipped_recipients,
      })),
    };
  }
  async dispatch(
    job: OutboxJob,
    send: (job: OutboxJob) => Promise<string>,
  ): Promise<void> {
    await this.transaction(async (client) => {
      // Draft delivery shares the request-first lock order with Submit/Delete.
      // Aggregate alerts carry no request content; their row lock fences purged claims.
      const request =
        job.event_type === 'DRAFT_REMINDER'
          ? await client.query<{ eligible: boolean }>(
              `SELECT status='Draft' AND created_at<=NOW()-INTERVAL '168 hours' AS eligible FROM psf_requests WHERE id=$1 FOR UPDATE`,
              [job.request_id],
            )
          : undefined;
      const current = await client.query<OutboxJob>(
        "SELECT * FROM email_outbox WHERE id=$1 AND status='sending' AND claim_token=$2 FOR UPDATE",
        [job.id, job.claim_token],
      );
      if (!current.rows[0]) return;
      const legacyDraftAlert =
        current.rows[0].event_type === 'ADMIN_ALERT' &&
        current.rows[0].body_html.includes('<td>DRAFT_REMINDER</td>');
      if (
        legacyDraftAlert ||
        (job.event_type === 'DRAFT_REMINDER' && !request?.rows[0]?.eligible)
      ) {
        await client.query('DELETE FROM email_outbox WHERE id=$1', [job.id]);
        await client.query(
          "UPDATE draft_reminders SET state='cancelled' WHERE request_id=$1",
          [job.request_id],
        );
        return;
      }
      let sentTo: string;
      try {
        sentTo = await send(current.rows[0]);
      } catch (error) {
        await this.storage.markFailed(current.rows[0], error, false, client);
        return;
      }
      await this.storage.markSent(current.rows[0], sentTo, client);
    });
  }
  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

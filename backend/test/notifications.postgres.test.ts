import 'reflect-metadata';
import { PGlite } from '@electric-sql/pglite';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { MailConfig } from '../src/notifications/mail.config';
import { NotificationService } from '../src/notifications/notification.service';
import { NotificationStorage } from '../src/notifications/notification.storage';
import { NotificationWorker } from '../src/notifications/notification.worker';
import type {
  NotificationClient,
  OutboxSnapshot,
  RequestNotificationEvent,
} from '../src/notifications/notification.types';

const requestId = '00000000-0000-4000-8000-000000000010';
const actor = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'tester',
  displayName: 'Tester',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};
const event: RequestNotificationEvent = {
  eventType: 'REQUEST_STATUS_CHANGED',
  requestId,
  fromStatus: 'A',
  actor,
  targetStatus: {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'B',
    kind: 'open',
    emailPolicy: { enabled: true, to: ['team@nxp.com'], cc: ['copy@nxp.com'] },
  },
};
const snapshot: OutboxSnapshot = {
  event_type: 'REQUEST_STATUS_CHANGED',
  request_id: requestId,
  to_recipients: 'team@nxp.com',
  cc_recipients: 'copy@nxp.com',
  bcc_recipients: '',
  subject: 'SQL test',
  body_html: '<p>Safe requester data</p>',
};
const baseSchema = `CREATE TABLE psf_requests (id UUID PRIMARY KEY, request_no TEXT, status TEXT, requester TEXT, product_type TEXT, requester_data_json JSONB, psf_created_data_json JSONB, schema_snapshot_json JSONB)`;

Logger.overrideLogger(false);

void describe('notification SQL on an isolated in-memory PostgreSQL engine', () => {
  let db: PGlite;
  let query: NotificationClient['query'];
  let storage: NotificationStorage;
  let service: NotificationService;

  before(async () => {
    db = new PGlite();
    await db.exec(baseSchema);
    query = (async (sql: string, values?: unknown[]) => {
      if (!values && sql.includes('CREATE TABLE')) {
        await db.exec(sql);
        return { rows: [], rowCount: 0 };
      }
      const result = await db.query(sql, values);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    }) as NotificationClient['query'];
    storage = new NotificationStorage({
      query,
      connect: () => Promise.resolve({ query, release: () => undefined }),
    } as unknown as Pool);
    await storage.initialize();
    service = new NotificationService(
      storage,
      new MailConfig({ APP_BASE_URL: 'http://127.0.0.1:5173' }),
    );
  });
  beforeEach(async () => {
    await db.exec('TRUNCATE email_outbox, psf_requests');
    await db.query(
      `INSERT INTO psf_requests (id,request_no,status,requester,product_type,requester_data_json,psf_created_data_json) VALUES ($1,'PSF-0010','A','Requester','IC',$2::jsonb,$3::jsonb)`,
      [
        requestId,
        JSON.stringify({ description: 'Safe title' }),
        JSON.stringify({ secret: 'NEVER-EMAIL-PSF' }),
      ],
    );
  });
  after(async () => {
    await db.close();
  });

  void it('commits the business transition and destination recipient snapshot together', async () => {
    await db.exec('BEGIN');
    await db.query('UPDATE psf_requests SET status=$1 WHERE id=$2', [
      'B',
      requestId,
    ]);
    await service.enqueueRequest({ query }, event);
    await db.exec('COMMIT');
    const result = await db.query<{
      status: string;
      from_address: string;
      to_recipients: string;
      cc_recipients: string;
      body_html: string;
    }>('SELECT * FROM email_outbox');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].status, 'pending');
    assert.equal(result.rows[0].from_address, 'noreply-psf@nxp.com');
    assert.equal(result.rows[0].to_recipients, 'team@nxp.com');
    assert.equal(result.rows[0].cc_recipients, 'copy@nxp.com');
    assert.equal(result.rows[0].body_html.includes('NEVER-EMAIL-PSF'), false);
  });

  void it('rolls back outbox writes when the business transaction rolls back', async () => {
    await db.exec('BEGIN');
    await service.enqueueRequest({ query }, event);
    await db.exec('ROLLBACK');
    assert.equal(
      (await db.query('SELECT id FROM email_outbox')).rows.length,
      0,
    );
  });

  void it('does not enqueue a disabled destination', async () => {
    await service.enqueueRequest(
      { query },
      {
        ...event,
        targetStatus: {
          ...event.targetStatus,
          emailPolicy: { enabled: false, to: ['remembered@nxp.com'], cc: [] },
        },
      },
    );
    assert.equal(
      (await db.query('SELECT id FROM email_outbox')).rows.length,
      0,
    );
  });

  void it('recovers a real failed INSERT through savepoint without losing the status write', async () => {
    await db.exec(
      'ALTER TABLE email_outbox ADD CONSTRAINT deliberate_enqueue_failure CHECK (FALSE)',
    );
    try {
      await db.exec('BEGIN');
      await db.query('UPDATE psf_requests SET status=$1 WHERE id=$2', [
        'B',
        requestId,
      ]);
      await service.enqueueRequest({ query }, event);
      await db.exec('COMMIT');
      assert.equal(
        (await db.query<{ status: string }>('SELECT status FROM psf_requests'))
          .rows[0].status,
        'B',
      );
      assert.equal(
        (await db.query('SELECT id FROM email_outbox')).rows.length,
        0,
      );
    } finally {
      await db.exec(
        'ALTER TABLE email_outbox DROP CONSTRAINT deliberate_enqueue_failure',
      );
    }
  });

  void it('claims atomically and persists actual recipients without changing intended recipients', async () => {
    const id = await storage.insert({ query }, snapshot);
    const [job] = await storage.claim();
    assert.equal(job.id, id);
    assert.equal(job.attempts, 1);
    assert.equal(job.status, 'sending');
    assert.equal((await storage.claim()).length, 0);
    assert.equal(
      await storage.markSent(job, 'To: test@nxp.com; CC: -; BCC: -'),
      true,
    );
    const row = (
      await db.query<{
        status: string;
        to_recipients: string;
        cc_recipients: string;
        sent_to: string;
        claim_token: string | null;
      }>('SELECT * FROM email_outbox')
    ).rows[0];
    assert.equal(row.status, 'sent');
    assert.equal(row.to_recipients, 'team@nxp.com');
    assert.equal(row.cc_recipients, 'copy@nxp.com');
    assert.equal(row.sent_to, 'To: test@nxp.com; CC: -; BCC: -');
    assert.equal(row.claim_token, null);
  });

  void it('reschedules retries then stops at five attempts and supports failed-only resend', async () => {
    const id = await storage.insert({ query }, snapshot);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await db.query(
        'UPDATE email_outbox SET next_attempt_at=NOW() WHERE id=$1',
        [id],
      );
      const [job] = await storage.claim();
      assert.equal(job.attempts, attempt);
      assert.equal(
        await storage.markFailed(job, new Error('SOAP unavailable')),
        attempt === 5 ? 'failed' : 'pending',
      );
      const row = (
        await db.query<{ delay: number; status: string }>(
          'SELECT status,EXTRACT(EPOCH FROM next_attempt_at-NOW())::float AS delay FROM email_outbox WHERE id=$1',
          [id],
        )
      ).rows[0];
      if (attempt < 5)
        assert.ok(Math.abs(row.delay - [60, 300, 900, 3600][attempt - 1]) < 5);
    }
    assert.equal((await storage.claim()).length, 0);
    await storage.resend(id);
    const [job] = await storage.claim();
    assert.equal(job.attempts, 1);
    await assert.rejects(storage.resend(id));
  });

  void it('recovers stale claims and fences updates from the old worker', async () => {
    const id = await storage.insert({ query }, snapshot);
    const [oldJob] = await storage.claim();
    await db.query(
      "UPDATE email_outbox SET locked_at=NOW()-INTERVAL '6 minutes' WHERE id=$1",
      [id],
    );
    await storage.recover();
    await db.query(
      'UPDATE email_outbox SET next_attempt_at=NOW() WHERE id=$1',
      [id],
    );
    const [newJob] = await storage.claim();
    assert.notEqual(newJob.claim_token, oldJob.claim_token);
    assert.equal(await storage.markSent(oldJob, 'stale'), false);
    assert.equal(await storage.markFailed(oldJob, 'stale'), null);
    assert.equal(await storage.markSent(newJob, 'To: accepted@nxp.com'), true);
  });

  void it('marks an exhausted stale claim failed rather than claiming a sixth attempt', async () => {
    const id = await storage.insert({ query }, snapshot);
    await db.query(
      "UPDATE email_outbox SET status='sending',attempts=5,locked_at=NOW()-INTERVAL '6 minutes',claim_token=$2 WHERE id=$1",
      [id, randomUUID()],
    );
    const failed = await storage.recover();
    assert.equal(failed.length, 1);
    assert.equal(failed[0].status, 'failed');
    assert.equal((await storage.claim()).length, 0);
  });

  const deliveryConfig = () =>
    new MailConfig({
      MAIL_ENABLED: 'true',
      NODE_ENV: 'test',
      MAIL_SOAP_URL: 'http://localhost/mail',
      MAIL_SMTP_SERVER: 'smtp.local',
      MAIL_DEFAULT_TO: 'admin@example.com',
      MAIL_REDIRECT_TO: 'test@example.com',
      APP_BASE_URL: 'http://localhost',
    });
  const noDispatch = {
    send: () => Promise.reject(new Error('Unexpected SOAP call')),
  };

  void it('durably alerts recovered exhaustion even if the following claim fails once', async () => {
    const id = await storage.insert({ query }, snapshot);
    await db.query(
      "UPDATE email_outbox SET status='sending',attempts=5,locked_at=NOW()-INTERVAL '6 minutes',claim_token=$2 WHERE id=$1",
      [id, randomUUID()],
    );
    let claimFails = true;
    const interruptedQuery = (async (sql: string, values?: unknown[]) => {
      if (claimFails && sql.includes('WITH picked AS')) {
        claimFails = false;
        throw new Error('Transient claim failure');
      }
      return query(sql, values);
    }) as NotificationClient['query'];
    const interruptedStorage = new NotificationStorage({
      query: interruptedQuery,
      connect: () =>
        Promise.resolve({
          query: interruptedQuery,
          release: () => undefined,
        }),
    } as unknown as Pool);
    const worker = new NotificationWorker(
      interruptedStorage,
      noDispatch as never,
      deliveryConfig(),
    );
    await assert.rejects(worker.poll(), /Transient claim failure/);
    const alerts = await db.query<{ body_html: string }>(
      "SELECT body_html FROM email_outbox WHERE event_type='ADMIN_ALERT'",
    );
    assert.equal(alerts.rows.length, 1);
    assert.equal(
      alerts.rows[0].body_html.includes('Safe requester data'),
      false,
    );
    // A healthy subsequent pass must not create a duplicate summary.
    await db.exec(
      "UPDATE email_outbox SET next_attempt_at=NOW()+INTERVAL '1 day' WHERE event_type='ADMIN_ALERT'",
    );
    await worker.poll();
    assert.equal(
      (
        await db.query(
          "SELECT id FROM email_outbox WHERE event_type='ADMIN_ALERT'",
        )
      ).rows.length,
      1,
    );
  });

  void it('retries failed summary creation on the next poll and reports each failure cycle once', async () => {
    const id = await storage.insert({ query }, snapshot);
    await db.query(
      "UPDATE email_outbox SET status='failed',attempts=5 WHERE id=$1",
      [id],
    );
    await db.exec(
      "ALTER TABLE email_outbox ADD CONSTRAINT reject_alert_once CHECK (event_type <> 'ADMIN_ALERT')",
    );
    const worker = new NotificationWorker(
      storage,
      noDispatch as never,
      deliveryConfig(),
    );
    try {
      await assert.rejects(worker.poll());
    } finally {
      await db.exec(
        'ALTER TABLE email_outbox DROP CONSTRAINT reject_alert_once',
      );
    }
    assert.equal(
      (
        await db.query(
          "SELECT id FROM email_outbox WHERE event_type='ADMIN_ALERT'",
        )
      ).rows.length,
      0,
    );
    await worker.poll();
    assert.equal(
      (
        await db.query(
          "SELECT id FROM email_outbox WHERE event_type='ADMIN_ALERT'",
        )
      ).rows.length,
      1,
    );
    // Defer delivery so further polls exercise summary eligibility only.
    await db.exec(
      "UPDATE email_outbox SET next_attempt_at=NOW()+INTERVAL '1 day' WHERE event_type='ADMIN_ALERT'",
    );
    await worker.poll();
    assert.equal(
      (
        await db.query(
          "SELECT id FROM email_outbox WHERE event_type='ADMIN_ALERT'",
        )
      ).rows.length,
      1,
    );
    await storage.resend(id);
    await db.query(
      "UPDATE email_outbox SET status='failed',attempts=5 WHERE id=$1",
      [id],
    );
    await worker.poll();
    assert.equal(
      (
        await db.query(
          "SELECT id FROM email_outbox WHERE event_type='ADMIN_ALERT'",
        )
      ).rows.length,
      2,
    );
  });

  void it('aggregates persisted failures with escaped summaries without original request bodies', async () => {
    const ids = [
      await storage.insert({ query }, snapshot),
      await storage.insert({ query }, snapshot),
    ];
    await db.query(
      "UPDATE email_outbox SET status='failed',attempts=5,last_error='<bad mail>',request_no='PSF-0010' WHERE id=ANY($1::uuid[])",
      [ids],
    );
    const alertId = await storage.enqueueFailureAlert('admin@example.com');
    assert.ok(alertId);
    const alert = (
      await db.query<{
        subject: string;
        body_html: string;
        to_recipients: string;
        from_address: string;
      }>(
        'SELECT subject,body_html,to_recipients,from_address FROM email_outbox WHERE id=$1',
        [alertId],
      )
    ).rows[0];
    assert.equal(
      alert.subject,
      '[PSF System Alert] Notification Delivery Failures: 2 failed',
    );
    assert.equal(alert.to_recipients, 'admin@example.com');
    assert.equal(alert.from_address, 'noreply-psf@nxp.com');
    assert.ok(alert.body_html.includes('&lt;bad mail&gt;'));
    assert.ok(alert.body_html.includes('PSF-0010'));
    assert.equal(alert.body_html.includes('Safe requester data'), false);
    assert.equal(await storage.enqueueFailureAlert('admin@example.com'), null);
  });

  void it('adds the durable reporting marker to a pre-existing outbox schema', async () => {
    await db.exec('ALTER TABLE email_outbox DROP COLUMN failure_alerted');
    const upgraded = new NotificationStorage({
      query,
      connect: () => Promise.resolve({ query, release: () => undefined }),
    } as unknown as Pool);
    await upgraded.initialize();
    const id = await upgraded.insert({ query }, snapshot);
    assert.equal(
      (
        await db.query<{ failure_alerted: boolean }>(
          'SELECT failure_alerted FROM email_outbox WHERE id=$1',
          [id],
        )
      ).rows[0].failure_alerted,
      false,
    );
  });

  void it('excludes alert failures and first-attempt terminal admin tests from automatic summaries', async () => {
    await storage.insert(
      { query },
      { ...snapshot, event_type: 'ADMIN_ALERT', request_id: null },
    );
    await db.exec("UPDATE email_outbox SET status='failed',attempts=5");
    const adminTest = await storage.insertClaimedTest({
      ...snapshot,
      event_type: 'ADMIN_TEST',
      request_id: null,
    });
    await storage.markFailed(adminTest, new Error('Rejected test'), true);
    const worker = new NotificationWorker(
      storage,
      noDispatch as never,
      deliveryConfig(),
    );
    await worker.poll();
    assert.equal(
      (
        await db.query(
          "SELECT id FROM email_outbox WHERE event_type='ADMIN_ALERT'",
        )
      ).rows.length,
      1,
    );
  });

  void it('inserts an admin test already claimed so the worker cannot race immediate dispatch', async () => {
    const job = await storage.insertClaimedTest({
      ...snapshot,
      event_type: 'ADMIN_TEST',
      request_id: null,
    });
    assert.equal(job.status, 'sending');
    assert.equal(job.attempts, 1);
    assert.ok(job.claim_token);
    assert.equal((await storage.claim()).length, 0);
    assert.equal(
      await storage.markFailed(job, new Error('Test rejected'), true),
      'failed',
    );
    const row = (
      await db.query<{ status: string; attempts: number }>(
        'SELECT status,attempts FROM email_outbox WHERE id=$1',
        [job.id],
      )
    ).rows[0];
    assert.deepEqual(row, { status: 'failed', attempts: 1 });
  });
});

const localUrl = process.env.NOTIFICATION_TEST_DATABASE_URL;
void describe(
  'notification worker claims on real local PostgreSQL connections',
  { skip: !localUrl },
  () => {
    let pool: Pool;
    let storage: NotificationStorage;
    let schema: string;
    before(async () => {
      const url = new URL(localUrl!);
      assert.ok(
        ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname),
        'This suite only permits a local database',
      );
      assert.match(url.pathname, /^\/notification_test/);
      schema = `notification_test_${randomUUID().replace(/-/g, '')}`;
      const bootstrap = new Pool({ connectionString: localUrl });
      await bootstrap.query(`CREATE SCHEMA ${schema}`);
      await bootstrap.end();
      pool = new Pool({
        connectionString: localUrl,
        max: 5,
        options: `-c search_path=${schema}`,
      });
      await pool.query(baseSchema);
      await pool.query(
        "INSERT INTO psf_requests (id,request_no,status) VALUES ($1,'PSF-0010','B')",
        [requestId],
      );
      storage = new NotificationStorage(pool);
      await storage.initialize();
    });
    beforeEach(async () => {
      await pool.query('TRUNCATE email_outbox');
    });
    after(async () => {
      if (pool) {
        await pool.query(`DROP SCHEMA ${schema} CASCADE`);
        await pool.end();
      }
    });

    void it('skips a pending row locked by another connection and later claims it', async () => {
      const heldId = await storage.insert(pool, snapshot);
      const availableId = await storage.insert(pool, snapshot);
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN');
        await holder.query(
          'SELECT id FROM email_outbox WHERE id=$1 FOR UPDATE',
          [heldId],
        );
        const jobs = await storage.claim();
        assert.deepEqual(
          jobs.map((job) => job.id),
          [availableId],
        );
        await holder.query('COMMIT');
        assert.deepEqual(
          (await storage.claim()).map((job) => job.id),
          [heldId],
        );
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
      }
    });

    void it('concurrent summary aggregators cannot report the same failure twice', async () => {
      const ids = await Promise.all(
        Array.from({ length: 4 }, () => storage.insert(pool, snapshot)),
      );
      await pool.query(
        "UPDATE email_outbox SET status='failed',attempts=5,request_no='failure-' || id::text WHERE id=ANY($1::uuid[])",
        [ids],
      );
      const second = new NotificationStorage(pool);
      await Promise.all([
        storage.enqueueFailureAlert('admin@example.com'),
        second.enqueueFailureAlert('admin@example.com'),
      ]);
      const alerts = await pool.query<{ body_html: string }>(
        "SELECT body_html FROM email_outbox WHERE event_type='ADMIN_ALERT'",
      );
      assert.ok(alerts.rows.length > 0 && alerts.rows.length <= 2);
      const summaries = alerts.rows.map((row) => row.body_html).join('');
      for (const id of ids)
        assert.equal(summaries.split(`<td>failure-${id}</td>`).length - 1, 1);
      const reported = await pool.query<{ id: string }>(
        "SELECT id FROM email_outbox WHERE event_type<>'ADMIN_ALERT' AND failure_alerted",
      );
      assert.deepEqual(
        new Set(reported.rows.map((row) => row.id)),
        new Set(ids),
      );
    });

    void it('skips a locked failed source until its summary obligation can be claimed', async () => {
      const heldId = await storage.insert(pool, snapshot);
      const availableId = await storage.insert(pool, snapshot);
      await pool.query("UPDATE email_outbox SET status='failed',attempts=5");
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN');
        await holder.query(
          'SELECT id FROM email_outbox WHERE id=$1 FOR UPDATE',
          [heldId],
        );
        assert.ok(await storage.enqueueFailureAlert('admin@example.com'));
        const reported = await pool.query<{ id: string }>(
          'SELECT id FROM email_outbox WHERE failure_alerted',
        );
        assert.deepEqual(
          reported.rows.map((row) => row.id),
          [availableId],
        );
        await holder.query('COMMIT');
        assert.ok(await storage.enqueueFailureAlert('admin@example.com'));
        assert.equal(
          await storage.enqueueFailureAlert('admin@example.com'),
          null,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT id FROM email_outbox WHERE event_type='ADMIN_ALERT'",
            )
          ).rows.length,
          2,
        );
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
      }
    });

    void it('gives simultaneous workers disjoint jobs without losing any jobs', async () => {
      const ids = await Promise.all(
        Array.from({ length: 4 }, () => storage.insert(pool, snapshot)),
      );
      const [first, second] = await Promise.all([
        storage.claim(2),
        storage.claim(2),
      ]);
      const claimed = [...first, ...second].map((job) => job.id);
      assert.equal(new Set(claimed).size, 4);
      assert.deepEqual(new Set(claimed), new Set(ids));
      assert.equal((await storage.claim()).length, 0);
    });
  },
);

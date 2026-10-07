import 'reflect-metadata';
import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { DraftReminderService } from '../src/notifications/draft-reminder.service';
import { NotificationStorage } from '../src/notifications/notification.storage';
import { MailConfig } from '../src/notifications/mail.config';

void describe('Draft reminder concurrency with independent PostgreSQL sessions', () => {
  let directory: string;
  let postgres: EmbeddedPostgres;
  let pool: Pool;
  let storage: NotificationStorage;
  let first: DraftReminderService;
  let second: DraftReminderService;
  const requestId = '00000000-0000-4000-8000-000000000010';
  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'draft-reminder-pg-'));
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const port = address.port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    postgres = new EmbeddedPostgres({
      databaseDir: join(directory, 'data'),
      user: 'postgres',
      password: 'offline-only',
      port,
      persistent: false,
      createPostgresUser: false,
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => undefined,
      onError: () => undefined,
    });
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('notification_test_draft_reminders');
    pool = new Pool({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password: 'offline-only',
      database: 'notification_test_draft_reminders',
      max: 8,
    });
    await pool.query(`CREATE TABLE app_users(id UUID PRIMARY KEY,display_name TEXT,role TEXT,email TEXT);
      CREATE TABLE psf_requests(id UUID PRIMARY KEY,request_no TEXT,status TEXT,requester TEXT,requester_user_id UUID,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
      INSERT INTO app_users VALUES ('00000000-0000-4000-8000-000000000001','Creator','admin','creator@nxp.com');`);
    storage = new NotificationStorage(pool);
    await storage.initialize();
    const config = new MailConfig({ APP_BASE_URL: 'http://localhost:5173' });
    first = new DraftReminderService(pool, storage, config);
    second = new DraftReminderService(pool, storage, config);
    await first.initialize();
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE email_outbox,draft_reminders,psf_requests');
    await pool.query(
      `INSERT INTO psf_requests VALUES ($1,'DRAFT-RACE','Draft','Creator','00000000-0000-4000-8000-000000000001',NOW()-INTERVAL '169 hours',NOW())`,
      [requestId],
    );
  });
  after(async () => {
    await pool?.end();
    if (postgres) await postgres.stop();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  void it('creates one durable logical reminder across parallel scans and restart', async () => {
    await Promise.all([
      first.scan(),
      second.scan(),
      first.scan(),
      second.scan(),
    ]);
    const restarted = new DraftReminderService(
      pool,
      new NotificationStorage(pool),
      new MailConfig({ APP_BASE_URL: 'http://localhost:5173' }),
    );
    await restarted.initialize();
    await restarted.scan();
    assert.equal((await storage.list({})).total, 1);
    assert.equal((await restarted.list()).items.length, 1);
  });
  void it('holds the request lifecycle lock until external delivery completes', async () => {
    await first.scan();
    const [job] = await storage.claim();
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let complete!: () => void;
    const gate = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const dispatch = first.dispatch(job, async () => {
      started();
      await gate;
      return 'creator@nxp.com';
    });
    await entered;
    const lifecycle = await pool.connect();
    try {
      await lifecycle.query('BEGIN');
      await assert.rejects(
        lifecycle.query(
          'SELECT id FROM psf_requests WHERE id=$1 FOR UPDATE NOWAIT',
          [requestId],
        ),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '55P03',
      );
      await lifecycle.query('ROLLBACK');
      complete();
      await dispatch;
      assert.equal((await first.list()).items[0].state, 'sent');
      await lifecycle.query('BEGIN');
      await lifecycle.query(
        'SELECT id FROM psf_requests WHERE id=$1 FOR UPDATE',
        [requestId],
      );
      await lifecycle.query('DELETE FROM email_outbox WHERE request_id=$1', [
        requestId,
      ]);
      await lifecycle.query('DELETE FROM psf_requests WHERE id=$1', [
        requestId,
      ]);
      await lifecycle.query('COMMIT');
      assert.equal((await first.list()).items.length, 0);
    } finally {
      complete();
      await dispatch;
      await lifecycle.query('ROLLBACK');
      lifecycle.release();
    }
  });
  void it('does not deliver when submission commits before the dispatch gate', async () => {
    await first.scan();
    const [job] = await storage.claim();
    const lifecycle = await pool.connect();
    try {
      await lifecycle.query('BEGIN');
      await lifecycle.query(
        "UPDATE psf_requests SET status='Submitted' WHERE id=$1",
        [requestId],
      );
      let sent = false;
      const dispatch = first.dispatch(job, () => {
        sent = true;
        return Promise.resolve('creator@nxp.com');
      });
      await lifecycle.query('COMMIT');
      await dispatch;
      assert.equal(sent, false);
      assert.equal((await storage.list({})).total, 0);
    } finally {
      await lifecycle.query('ROLLBACK');
      lifecycle.release();
    }
  });
});

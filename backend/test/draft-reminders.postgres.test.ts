import 'reflect-metadata';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { MailConfig } from '../src/notifications/mail.config';
import { NotificationStorage } from '../src/notifications/notification.storage';
import { DraftReminderService } from '../src/notifications/draft-reminder.service';
import type { NotificationClient } from '../src/notifications/notification.types';
void describe('Draft reminder module on PostgreSQL', () => {
  let db: PGlite;
  let storage: NotificationStorage;
  let reminders: DraftReminderService;
  let pool: Pool;
  before(async () => {
    db = new PGlite();
    await db.exec(`CREATE TABLE app_users(id UUID PRIMARY KEY,display_name TEXT,role TEXT,email TEXT);
 CREATE TABLE psf_requests(id UUID PRIMARY KEY,request_no TEXT,status TEXT,requester TEXT,requester_user_id UUID,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
 INSERT INTO app_users VALUES ('00000000-0000-4000-8000-000000000001','Creator','admin',' CREATOR@nxp.com '),('00000000-0000-4000-8000-000000000002','Other Admin','admin','admin@nxp.com'),('00000000-0000-4000-8000-000000000003','Missing Admin','admin',NULL);
 INSERT INTO psf_requests VALUES ('00000000-0000-4000-8000-000000000010','DRAFT-10','Draft','Creator','00000000-0000-4000-8000-000000000001',NOW()-INTERVAL '168 hours',NOW()),('00000000-0000-4000-8000-000000000011','DRAFT-11','Draft','Creator','00000000-0000-4000-8000-000000000001',NOW()-INTERVAL '167 hours',NOW());
 ALTER TABLE psf_requests ADD COLUMN requester_data_json JSONB DEFAULT '{"secret":"NEVER-EMAIL-REQUESTER"}';
 ALTER TABLE psf_requests ADD COLUMN psf_created_data_json JSONB DEFAULT '{"secret":"NEVER-EMAIL-PSF"}';`);
    const query = (async (sql: string, values?: unknown[]) => {
      if (!values && sql.includes('CREATE TABLE')) {
        await db.exec(sql);
        return { rows: [], rowCount: 0 };
      }
      const result = await db.query(sql, values);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    }) as NotificationClient['query'];
    pool = {
      query,
      connect: () => Promise.resolve({ query, release: () => undefined }),
    } as unknown as Pool;
    storage = new NotificationStorage(pool);
    await storage.initialize();
    reminders = new DraftReminderService(
      pool,
      storage,
      new MailConfig({ APP_BASE_URL: 'http://localhost:5173' }),
    );
    await reminders.initialize();
  });
  after(async () => {
    await db.close();
  });
  void it('queues only overdue Drafts once and reports skipped current Admins', async () => {
    await reminders.scan();
    reminders = new DraftReminderService(
      pool,
      storage,
      new MailConfig({ APP_BASE_URL: 'http://localhost:5173' }),
    );
    await reminders.initialize();
    await reminders.scan();
    const rows = await db.query<{
      to_recipients: string;
      cc_recipients: string;
      body_html: string;
    }>('SELECT * FROM email_outbox');
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].to_recipients, 'creator@nxp.com');
    assert.equal(rows.rows[0].cc_recipients, 'admin@nxp.com');
    assert.match(rows.rows[0].body_html, /DRAFT-10/);
    assert.doesNotMatch(rows.rows[0].body_html, /NEVER-EMAIL/);
    const report = await reminders.list();
    assert.equal(report.items.length, 1);
    assert.equal(
      report.items[0].skippedRecipients[0].displayName,
      'Missing Admin',
    );
  });
  void it('cancels a claimed reminder after submission without sending', async () => {
    const [job] = await storage.claim();
    await db.exec(
      "UPDATE psf_requests SET status='Submitted' WHERE request_no='DRAFT-10'",
    );
    let sent = false;
    await reminders.dispatch(job, () => {
      sent = true;
      return Promise.resolve('creator@nxp.com');
    });
    assert.equal(sent, false);
    assert.equal((await db.query('SELECT * FROM email_outbox')).rows.length, 0);
  });
  void it('retains unresolved recipients until account correction', async () => {
    await db.exec(
      "UPDATE app_users SET email=NULL; UPDATE psf_requests SET created_at=NOW()-INTERVAL '200 hours' WHERE request_no='DRAFT-11'",
    );
    await reminders.scan();
    assert.equal((await reminders.list()).items[0].state, 'unresolved');
    assert.equal((await db.query('SELECT * FROM email_outbox')).rows.length, 0);
    await db.exec(
      "UPDATE app_users SET email='admin@nxp.com' WHERE display_name='Other Admin'",
    );
    await reminders.scan();
    const [job] = await storage.claim();
    assert.equal(job.to_recipients, 'admin@nxp.com');
    await reminders.dispatch(job, () => Promise.resolve('admin@nxp.com'));
    assert.equal((await reminders.list()).items[0].state, 'sent');
  });
  void it('ignores a stale claim after recovery and dispatches only the current owner', async () => {
    await db.exec(
      "UPDATE email_outbox SET status='pending',next_attempt_at=NOW(),attempts=0",
    );
    const [stale] = await storage.claim();
    await db.exec(
      "UPDATE email_outbox SET locked_at=NOW()-INTERVAL '6 minutes'",
    );
    await storage.recover();
    await db.exec('UPDATE email_outbox SET next_attempt_at=NOW()');
    const [current] = await storage.claim();
    let deliveries = 0;
    const send = () => {
      deliveries++;
      return Promise.resolve('admin@nxp.com');
    };
    await reminders.dispatch(stale, send);
    assert.equal(deliveries, 0);
    await reminders.dispatch(current, send);
    assert.equal(deliveries, 1);
  });
  void it('purges deleted Draft content and cannot deliver a previously claimed snapshot', async () => {
    await db.exec(
      "UPDATE email_outbox SET status='pending',next_attempt_at=NOW(),attempts=0",
    );
    const [job] = await storage.claim();
    await db.exec(
      "DELETE FROM email_outbox; DELETE FROM psf_requests WHERE request_no='DRAFT-11'",
    );
    let sent = false;
    await reminders.dispatch(job, () => {
      sent = true;
      return Promise.resolve('admin@nxp.com');
    });
    assert.equal(sent, false);
    assert.equal((await reminders.list()).items.length, 0);
    assert.equal(
      (
        await db.query(
          "SELECT * FROM draft_reminders WHERE request_id='00000000-0000-4000-8000-000000000011'",
        )
      ).rows.length,
      0,
    );
  });
  void it('rolls back reminder identity when outbox insertion fails', async () => {
    await db.exec(`INSERT INTO psf_requests (id,request_no,status,requester,requester_user_id,created_at,updated_at) VALUES ('00000000-0000-4000-8000-000000000012','DRAFT-12','Draft','Creator','00000000-0000-4000-8000-000000000001',NOW()-INTERVAL '169 hours',NOW());
      CREATE FUNCTION reject_reminder() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture mail storage unavailable'; END$$;
      CREATE TRIGGER fail_reminder BEFORE INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION reject_reminder();`);
    await assert.rejects(reminders.scan(), /fixture mail storage unavailable/);
    assert.equal(
      (
        await db.query(
          "SELECT * FROM draft_reminders WHERE request_id='00000000-0000-4000-8000-000000000012'",
        )
      ).rows.length,
      0,
    );
    await db.exec('DROP TRIGGER fail_reminder ON email_outbox');
    await reminders.scan();
    await reminders.scan();
    assert.equal(
      (await db.query("SELECT * FROM email_outbox WHERE request_no='DRAFT-12'"))
        .rows.length,
      1,
    );
  });
  void it('reports Draft failure in management without copying Draft identity into aggregate mail', async () => {
    await db.exec(
      "UPDATE email_outbox SET status='failed',attempts=5,last_error='Reminder delivery failed'",
    );
    await storage.insertStandalone({
      event_type: 'REQUEST_SUBMITTED',
      request_id: null,
      request_no: 'PSF-OTHER',
      to_recipients: 'other@nxp.com',
      cc_recipients: '',
      bcc_recipients: '',
      subject: 'Other request',
      body_html: 'Other content',
    });
    await db.exec(
      "UPDATE email_outbox SET status='failed',attempts=5 WHERE request_no='PSF-OTHER'",
    );
    await storage.enqueueFailureAlert('admin@nxp.com');
    const alerts = await db.query<{ body_html: string }>(
      "SELECT body_html FROM email_outbox WHERE event_type='ADMIN_ALERT'",
    );
    assert.equal(alerts.rows.length, 1);
    assert.match(alerts.rows[0].body_html, /PSF-OTHER/);
    assert.doesNotMatch(alerts.rows[0].body_html, /DRAFT-12|DRAFT_REMINDER/);
    assert.equal((await reminders.list()).items[0].state, 'failed');
  });

  void it('delivers an ordinary aggregate alert through the current claim gate', async () => {
    const [job] = await storage.claim();
    assert.equal(job.event_type, 'ADMIN_ALERT');
    let delivered = false;
    await reminders.dispatch(job, () => {
      delivered = true;
      return Promise.resolve('admin@nxp.com');
    });
    assert.equal(delivered, true);
  });
  void it('purges old Draft summary copies on restart and cannot send a saved claimed body', async () => {
    const legacyId = await storage.insertStandalone({
      event_type: 'ADMIN_ALERT',
      request_id: null,
      to_recipients: 'admin@nxp.com',
      cc_recipients: '',
      bcc_recipients: '',
      subject: 'Old summary',
      body_html:
        '<table><tr><td>DRAFT-12</td><td>DRAFT_REMINDER</td><td>creator@nxp.com</td></tr></table>',
    });
    const [legacy] = await storage.claim(1, legacyId);
    const restarted = new NotificationStorage(pool);
    await restarted.initialize();
    assert.equal(
      (await restarted.list({})).items.some((item) => item.id === legacyId),
      false,
    );
    let delivered = false;
    await reminders.dispatch(legacy, () => {
      delivered = true;
      return Promise.resolve('admin@nxp.com');
    });
    assert.equal(delivered, false);
    const outbox = await restarted.list({});
    assert.equal(
      outbox.items.some((item) => item.id === legacyId),
      false,
    );
    assert.ok(outbox.items.some((item) => item.requestNo === 'PSF-OTHER'));
  });
});

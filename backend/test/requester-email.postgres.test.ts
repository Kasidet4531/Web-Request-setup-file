import { PGlite } from '@electric-sql/pglite';
import { Logger } from '@nestjs/common';
import assert from 'node:assert/strict';
import { after, before, beforeEach, it } from 'node:test';
import type { Pool } from 'pg';
import { MailConfig } from '../src/notifications/mail.config';
import { NotificationService } from '../src/notifications/notification.service';
import {
  NotificationStorage,
  OUTBOX_SCHEMA,
} from '../src/notifications/notification.storage';
import type { StatusEmailPolicy } from '../src/notifications/notification.types';
import {
  admin,
  lifecycleFixture,
  ownerA,
  requester,
  submittedStatus,
} from './draft-lifecycle.fixture';

// A Work Status may email the Requester of each PSF Request that enters it,
// in To or CC, using the address of the Requester's account at that moment.
let db: PGlite;
let storage: NotificationStorage;
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;

Logger.overrideLogger(false);

before(
  async () => {
    db = new PGlite();
    const query = (sql: string, args?: unknown[]) => db.query(sql, args);
    const pool = {
      query,
      connect: () => Promise.resolve({ query, release() {} }),
    } as unknown as Pool;
    storage = new NotificationStorage(pool);
    fixture = await lifecycleFixture(pool, {
      notifications: new NotificationService(
        storage,
        new MailConfig({ APP_BASE_URL: 'http://psf.example.com' }),
      ),
    });
    // The outbox schema is several statements, which PGlite runs only via exec.
    await db.exec(OUTBOX_SCHEMA);
  },
  { timeout: 30000 },
);
after(async () => db.close());
beforeEach(async () => {
  await fixture.reset();
  // Start every test from the default catalog, where no status sends email.
  await db.query('DELETE FROM workflow_transition_config');
  await fixture.workflow.onModuleInit();
  await db.query('UPDATE app_users SET email=$2 WHERE id=$1', [
    requester.id,
    'Requester@Example.com',
  ]);
});

async function setPolicy(statusName: string, emailPolicy: StatusEmailPolicy) {
  const configuration = await fixture.workflow.getConfiguration();
  const entry = configuration.entries.find(({ name }) => name === statusName);
  assert.ok(entry);
  await fixture.workflow.applyOperation(
    {
      action: 'email-policy',
      id: entry.id,
      emailPolicy,
      expectedUpdatedAt: configuration.updatedAt,
    },
    admin,
  );
}

async function queued() {
  return (await storage.list({})).items.map(({ to, cc }) => ({
    to: String(to),
    cc: String(cc),
  }));
}

void it('emails the Requester in To when their request is submitted into a status that sends to the Requester', async () => {
  await setPolicy(submittedStatus, {
    enabled: true,
    to: [],
    cc: ['lead@example.com'],
    requester: 'to',
  });

  await fixture.submit(await fixture.draft());

  assert.deepEqual(await queued(), [
    { to: 'requester@example.com', cc: 'lead@example.com' },
  ]);
});

const nextStatus = '20% -- PSF File Creating';

async function submittedRequest() {
  return fixture.submit(await fixture.draft());
}

async function moveTo(
  request: { id: string; updatedAt: string },
  status: string,
) {
  return fixture.service.updateRequestStatus(request.id, {
    actor: admin,
    status,
    expectedUpdatedAt: request.updatedAt,
  });
}

void it('copies the Requester when the status puts them in CC', async () => {
  const request = await submittedRequest();
  await setPolicy(nextStatus, {
    enabled: true,
    to: ['team@example.com'],
    cc: [],
    requester: 'cc',
  });

  await moveTo(request, nextStatus);

  assert.deepEqual(await queued(), [
    { to: 'team@example.com', cc: 'requester@example.com' },
  ]);
});

void it("still emails the status's own recipients when the Requester's account has no email", async () => {
  await db.query('UPDATE app_users SET email=NULL WHERE id=$1', [requester.id]);
  const request = await submittedRequest();
  await setPolicy(nextStatus, {
    enabled: true,
    to: ['team@example.com'],
    cc: ['lead@example.com'],
    requester: 'to',
  });

  await moveTo(request, nextStatus);

  assert.deepEqual(await queued(), [
    { to: 'team@example.com', cc: 'lead@example.com' },
  ]);
});

void it('sends to the CC recipients as To when the Requester was the only To and has no email', async () => {
  await db.query('UPDATE app_users SET email=$2 WHERE id=$1', [
    requester.id,
    'not an address',
  ]);
  const request = await submittedRequest();
  await setPolicy(nextStatus, {
    enabled: true,
    to: [],
    cc: ['lead@example.com'],
    requester: 'to',
  });

  await moveTo(request, nextStatus);

  assert.deepEqual(await queued(), [{ to: 'lead@example.com', cc: '' }]);
});

void it('queues no email, but still changes the status, when no recipient remains', async () => {
  await db.query('UPDATE app_users SET email=NULL WHERE id=$1', [requester.id]);
  const request = await submittedRequest();
  await setPolicy(nextStatus, {
    enabled: true,
    to: [],
    cc: [],
    requester: 'to',
  });

  const moved = await moveTo(request, nextStatus);

  assert.equal(moved.status, nextStatus);
  assert.deepEqual(await queued(), []);
});

void it('does not email the Requester of an Imported Request, even when an account has the same name', async () => {
  const request = await submittedRequest();
  // Imported Requests keep the workbook's Created By name and no account.
  await db.query('UPDATE psf_requests SET requester_user_id=NULL WHERE id=$1', [
    request.id,
  ]);
  await setPolicy(nextStatus, {
    enabled: true,
    to: ['team@example.com'],
    cc: [],
    requester: 'cc',
  });

  await moveTo(request, nextStatus);

  assert.equal(request.requester, requester.displayName);
  assert.deepEqual(await queued(), [{ to: 'team@example.com', cc: '' }]);
});

void it("emails each request's own Requester when a deleted status's requests move to one that sends to the Requester", async () => {
  await db.query('UPDATE app_users SET email=$2 WHERE id=$1', [
    ownerA.id,
    'owner.a@example.com',
  ]);
  await submittedRequest();
  const ownDraft = await fixture.draft(ownerA);
  await fixture.service.submitRequest(
    ownDraft.id,
    {
      formVersion: 1,
      expectedUpdatedAt: ownDraft.updatedAt,
      status: submittedStatus,
    },
    ownerA,
  );
  await setPolicy(nextStatus, {
    enabled: true,
    to: [],
    cc: ['lead@example.com'],
    requester: 'to',
  });
  const configuration = await fixture.workflow.getConfiguration();
  const id = (name: string) =>
    configuration.entries.find((entry) => entry.name === name)?.id;

  await fixture.workflow.applyOperation(
    {
      action: 'delete',
      id: id(submittedStatus),
      replacementId: id(nextStatus),
      expectedUpdatedAt: configuration.updatedAt,
    },
    admin,
  );

  assert.deepEqual(
    (await queued()).sort((a, b) => a.to.localeCompare(b.to)),
    [
      { to: 'owner.a@example.com', cc: 'lead@example.com' },
      { to: 'requester@example.com', cc: 'lead@example.com' },
    ],
  );
});

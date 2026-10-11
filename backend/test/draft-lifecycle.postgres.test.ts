import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { before, after, it } from 'node:test';
import { ExcelExportService } from '../src/export/excel_export.service';
import { ExportJobRepository } from '../src/export/export-job.repository';
import {
  NotificationStorage,
  OUTBOX_SCHEMA,
} from '../src/notifications/notification.storage';
import type { Pool } from 'pg';
import {
  lifecycleFixture,
  requester,
  admin,
  ownerA,
} from './draft-lifecycle.fixture';
import type { AuthenticatedUserProfile } from '../src/auth/session.types';
import type { PsfRequestResponse } from '../src/requests/requests.service';
let db: PGlite;
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;
type Lifecycle = {
  deleteDraft(
    id: string,
    expectedUpdatedAt: unknown,
    actor: AuthenticatedUserProfile,
  ): Promise<{ deleted: true }>;
  getAdminDraft(
    id: string,
    actor: AuthenticatedUserProfile,
  ): Promise<PsfRequestResponse>;
  listAdminDrafts(
    query: Record<string, unknown>,
    actor: AuthenticatedUserProfile,
  ): Promise<{ items: unknown[]; total: number }>;
};
before(
  async () => {
    db = new PGlite();
    const query = (sql: string, args?: unknown[]) => db.query(sql, args);
    fixture = await lifecycleFixture({
      query,
      connect: () => Promise.resolve({ query, release() {} }),
    } as unknown as Pool);
  },
  { timeout: 30000 },
);
after(async () => db.close());
void it('allows read-only Admin management while preserving foreign Draft mutation privacy', async () => {
  const draft = await fixture.draft();
  const lifecycle = fixture.service as unknown as Lifecycle;
  const detail = await lifecycle.getAdminDraft(draft.id, admin);
  assert.equal(detail.canSubmitDraft, false);
  assert.equal(detail.canEditRequesterData, false);
  assert.equal(detail.canEditPsfCreatedData, false);
  assert.equal((await lifecycle.listAdminDrafts({}, admin)).total, 1);
  await assert.rejects(lifecycle.getAdminDraft(draft.id, ownerA));
  await assert.rejects(fixture.service.getRequest(draft.id, admin));
  await assert.rejects(
    fixture.service.submitRequest(
      draft.id,
      { formVersion: 1, status: 'Work', expectedUpdatedAt: draft.updatedAt },
      admin,
    ),
  );
});
void it('deletes only current Draft revisions, purges retained content and leaves unrelated work', async () => {
  const lifecycle = fixture.service as unknown as Lifecycle;
  const draft = await fixture.draft();
  const other = await fixture.draft();
  await assert.rejects(
    lifecycle.deleteDraft(draft.id, draft.updatedAt, ownerA),
  );
  await assert.rejects(
    lifecycle.deleteDraft(draft.id, '2020-01-01T00:00:00.000001Z', requester),
  );
  const exports = new ExportJobRepository(fixture.pool);
  await exports.onModuleInit();
  const job = await exports.enqueue(
    {},
    { id: requester.id, role: 'requester' },
  );
  await db.query(
    "UPDATE psf_export_jobs SET status='running',claim_token=$2 WHERE id=$1",
    [job.id, admin.id],
  );
  await db.exec(OUTBOX_SCHEMA);
  await db.query(
    "INSERT INTO email_outbox(event_type,request_id,from_address,to_recipients,subject,body_html) VALUES('REQUEST_SUBMITTED',$1,'noreply-psf@nxp.com','test@example.com','Draft','retained secret')",
    [draft.id],
  );
  const copied = await db.query<{ id: string }>(
    "INSERT INTO email_outbox(event_type,request_id,from_address,to_recipients,subject,body_html) VALUES('ADMIN_ALERT',NULL,'noreply-psf@nxp.com','admin@example.com','Draft failure copy',$1) RETURNING id",
    [`<td>${draft.requestNo}</td><td>DRAFT_REMINDER</td>`],
  );
  const unrelated = await db.query<{ id: string }>(
    "INSERT INTO email_outbox(event_type,request_id,from_address,to_recipients,subject,body_html) VALUES('ADMIN_ALERT',NULL,'noreply-psf@nxp.com','admin@example.com','Unrelated','Unrelated notification failure') RETURNING id",
  );
  assert.deepEqual(
    await lifecycle.deleteDraft(draft.id, draft.updatedAt, requester),
    { deleted: true },
  );
  const visibleMail = await new NotificationStorage(fixture.pool).list({
    limit: '100',
  });
  assert.equal(
    visibleMail.items.some((item) => item.id === copied.rows[0].id),
    false,
  );
  assert.equal(
    visibleMail.items.some((item) => item.id === unrelated.rows[0].id),
    true,
  );
  await exports.complete(job.id, admin.id, {
    filename: 'stale.xlsx',
    content: Buffer.from('deleted secret'),
  });
  const invalidated = await exports.findOwnedContent(job.id, requester.id);
  assert.equal(invalidated?.status, 'failed');
  assert.equal(invalidated?.content, null);
  assert.equal(
    (
      await db.query('SELECT * FROM email_outbox WHERE request_id=$1', [
        draft.id,
      ])
    ).rows.length,
    0,
  );
  const log = await fixture.service.listDraftDeletions({}, admin);
  assert.equal(log.items[0].draftNo, draft.requestNo);
  assert.equal(Object.hasOwn(log.items[0], 'metadata'), false);
  await assert.rejects(fixture.service.listDraftDeletions({}, requester));

  await assert.rejects(fixture.service.getRequest(draft.id, requester));
  assert.equal(
    (
      await db.query(
        'SELECT * FROM psf_request_audit_logs WHERE request_id=$1',
        [draft.id],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await fixture.service.getRequest(other.id, requester)).id,
    other.id,
  );
});
void it('filters shared rows and summary by Product Type without assignment or department authorization', async () => {
  await fixture.reset();
  const draft = await fixture.draft();
  const work = await fixture.submit(draft);
  await db.query(
    "UPDATE psf_requests SET product_type='New Product' WHERE id=$1",
    [work.id],
  );
  await db.query(
    "UPDATE psf_request_search_index SET product_type='New Product' WHERE request_id=$1",
    [work.id],
  );
  const gntc = await fixture.service.queryRequests(
    { scope: 'related', team: 'GNTC' } as never,
    ownerA,
  );
  assert.equal(gntc.total, 1);
  assert.equal(gntc.summary.open, 1);
  assert.equal(Object.hasOwn(gntc.items[0], 'setupOwner'), false);
  const mfg = await fixture.service.queryRequests(
    { scope: 'related', team: 'MFG' } as never,
    ownerA,
  );
  assert.equal(mfg.total, 0);
  for (const [product, team] of [
    ['Transfer Product', 'MFG'],
    ['Existing Product', 'MFG'],
    ['Custom', 'unclassified'],
    [null, 'unclassified'],
  ] as const) {
    await db.query('UPDATE psf_requests SET product_type=$2 WHERE id=$1', [
      work.id,
      product,
    ]);
    await db.query(
      'UPDATE psf_request_search_index SET product_type=$2 WHERE request_id=$1',
      [work.id, product],
    );
    const grouped = await fixture.service.queryRequests(
      { scope: 'related', team },
      ownerA,
    );
    assert.equal(grouped.total, 1);
    assert.equal(grouped.summary.open, 1);
  }
  assert.equal(
    (
      await fixture.service.queryRequests(
        { scope: 'related', team: 'all' },
        admin,
      )
    ).total,
    0,
  );
  assert.equal(
    (
      await fixture.service.queryRequests(
        { scope: 'related', team: 'all' },
        requester,
      )
    ).total,
    1,
  );
});

void it('rejects submitted deletion and assignment inputs while preserving cross-team PSF permissions', async () => {
  await fixture.reset();
  const work = await fixture.submit(await fixture.draft());
  await assert.rejects(
    fixture.service.deleteDraft(work.id, work.updatedAt, admin),
  );
  await assert.rejects(
    fixture.service.createDraft(
      { requesterData: {}, setupOwnerUserId: admin.id } as never,
      requester,
    ),
  );
  const shared = await fixture.service.getRequest(work.id, ownerA);
  assert.equal(shared.canEditPsfCreatedData, true);
  assert.equal(Object.hasOwn(shared, 'setupOwnerUserId'), false);
});
void it('cleans legacy assignment values and mixed history without touching account departments', async () => {
  const work = await fixture.service.queryRequests({}, requester);
  const id = work.items[0].requestId;
  await db.query(
    "UPDATE psf_requests SET setup_owner_user_id=$2,setup_owner='Legacy',setup_owner_role='GNTC' WHERE id=$1",
    [id, ownerA.id],
  );
  for (const [eventId, action, metadata] of [
    [
      admin.id,
      'REQUEST_ASSIGNEE_CHANGED',
      { before: { setupOwner: 'Legacy' } },
    ],
    [
      ownerA.id,
      'REQUESTER_INFORMATION_UPDATED',
      {
        fieldChanges: [
          { fieldKey: 'setupOwner', before: 'Legacy' },
          { fieldKey: 'title', before: 'Old', after: 'New' },
        ],
        nested: { setupOwnerUserId: 'secret', keep: 'unchanged' },
      },
    ],
  ] as const) {
    await db.query(
      "INSERT INTO psf_request_audit_logs(id,request_id,action_type,actor_id,actor_username,actor_display_name,actor_role,metadata_json) VALUES($1,$2,$3,$4,'user','User','requester',$5::jsonb)",
      [eventId, id, action, requester.id, JSON.stringify(metadata)],
    );
  }
  await db.exec('TRUNCATE request_data_migrations');
  await fixture.service.onModuleInit();
  assert.equal(
    (
      await db.query<{ setup_owner: string | null }>(
        'SELECT setup_owner FROM psf_requests WHERE id=$1',
        [id],
      )
    ).rows[0].setup_owner,
    null,
  );
  const events = await fixture.audit.findByRequestId(id);
  assert.equal(
    events.some((event) => event.actionType === 'REQUEST_ASSIGNEE_CHANGED'),
    false,
  );
  assert.deepEqual(events.find((event) => event.metadata.nested)?.metadata, {
    fieldChanges: [{ fieldKey: 'title', before: 'Old', after: 'New' }],
    nested: { keep: 'unchanged' },
  });
  assert.equal(
    (
      await db.query<{ setup_owner_department: string }>(
        'SELECT setup_owner_department FROM app_users WHERE id=$1',
        [ownerA.id],
      )
    ).rows[0].setup_owner_department,
    'GNTC',
  );
});
void it('creates another unique Draft number after deletion without reusing the deletion log identity', async () => {
  await fixture.reset();
  const first = await fixture.draft();
  const second = await fixture.draft();
  await fixture.service.deleteDraft(first.id, first.updatedAt, requester);
  const third = await fixture.draft();
  assert.notEqual(third.requestNo, first.requestNo);
  assert.notEqual(third.requestNo, second.requestNo);
});

void it('renders an export when the app starts outside the backend directory', async () => {
  const previous = process.cwd();
  const nodePath = process.env.NODE_PATH;
  try {
    process.chdir('/tmp');
    // The export worker inherits `--require ts-node/register`, which only resolves from the backend directory.
    process.env.NODE_PATH = join(previous, 'node_modules');
    const workbook = await new ExcelExportService(
      fixture.index,
      fixture.forms,
    ).exportAllRequests({}, requester);
    assert.ok(workbook.content.length > 0);
  } finally {
    if (nodePath === undefined) delete process.env.NODE_PATH;
    else process.env.NODE_PATH = nodePath;
    process.chdir(previous);
  }
});

void it('never exports a Draft, not even its creator’s own', async () => {
  await fixture.reset();
  await fixture.draft();
  const exported = await fixture.index.queryExportRequests({}, requester, 100);
  assert.equal(exported.total, 0);
  assert.deepEqual(exported.items, []);
  assert.equal(await fixture.index.countExportRequests({}), 0);
});

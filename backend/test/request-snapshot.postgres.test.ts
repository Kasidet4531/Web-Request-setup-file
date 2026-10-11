import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  admin,
  lifecycleFixture,
  ownerA,
  requester,
  schema,
  submittedStatus,
} from './draft-lifecycle.fixture';
import type { FormSchemaJson } from '../src/admin/form_schema.service';

let db: PGlite;
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;

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

void it('keeps the content a request was created with as its first Request Snapshot', async () => {
  const draft = await fixture.draft();

  const [created] = await fixture.service.getRequestHistory(
    draft.id,
    requester,
  );
  assert.equal(created.actionType, 'DRAFT_CREATED');
  assert.equal(created.hasRequestSnapshot, true);

  const requestSnapshot = await fixture.service.getRequestSnapshot(
    draft.id,
    created.id,
    requester,
  );
  assert.equal(requestSnapshot.status, 'Draft');
  assert.equal(requestSnapshot.formVersion, 1);
  assert.equal(requestSnapshot.requesterData.title, 'Test request');
  assert.equal(requestSnapshot.schemaSnapshot.version, 1);
  assert.deepEqual(requestSnapshot.entry.metadata.fieldChanges, [
    {
      fieldKey: 'title',
      fieldLabel: 'Title',
      before: null,
      after: 'Test request',
    },
    {
      fieldKey: 'requester_name',
      fieldLabel: 'Requester',
      before: null,
      after: 'Requester',
    },
  ]);
});

void it('adds a Request Snapshot per save and leaves earlier ones as they were', async () => {
  const draft = await fixture.draft();
  await fixture.service.updateDraftRequesterData(
    draft.id,
    {
      formVersion: 1,
      expectedUpdatedAt: draft.updatedAt,
      requesterData: { title: 'Renamed request' },
    },
    requester,
  );

  const [created, saved] = await fixture.service.getRequestHistory(
    draft.id,
    requester,
  );
  const before = await fixture.service.getRequestSnapshot(
    draft.id,
    created.id,
    requester,
  );
  const after = await fixture.service.getRequestSnapshot(
    draft.id,
    saved.id,
    requester,
  );
  assert.equal(before.requesterData.title, 'Test request');
  assert.equal(after.requesterData.title, 'Renamed request');
  assert.deepEqual(after.entry.metadata.fieldChanges, [
    {
      fieldKey: 'title',
      fieldLabel: 'Title',
      before: 'Test request',
      after: 'Renamed request',
    },
  ]);
});

void it('records no entry and keeps the revision for a save that changes nothing', async () => {
  const draft = await fixture.draft();
  const saved = await fixture.service.updateDraftRequesterData(
    draft.id,
    {
      formVersion: 1,
      expectedUpdatedAt: draft.updatedAt,
      requesterData: { title: 'Test request' },
    },
    requester,
  );
  // Another editor holding the earlier revision is not turned away.
  assert.equal(saved.updatedAt, draft.updatedAt);
  const submitted = await fixture.submit(saved);
  const psfSaved = await fixture.service.updatePsfCreatedData(submitted.id, {
    actor: ownerA,
    expectedUpdatedAt: submitted.updatedAt,
    psfCreatedData: { file: '' },
  });
  assert.equal(psfSaved.updatedAt, submitted.updatedAt);

  const history = await fixture.service.getRequestHistory(draft.id, ownerA);
  assert.deepEqual(
    history.map((entry) => entry.actionType),
    ['DRAFT_CREATED', 'REQUEST_SUBMITTED'],
  );
});

async function openStatusOtherThan(...names: string[]) {
  const { entries } = await fixture.workflow.getConfiguration();
  const entry = entries.find(
    (candidate) => candidate.kind === 'open' && !names.includes(candidate.name),
  );
  assert.ok(entry);
  return entry;
}

void it('shows the Work Status of the time on submit and Status change entries', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  const next = await openStatusOtherThan(submittedStatus);
  await fixture.service.updateRequestStatus(submitted.id, {
    actor: ownerA,
    status: next.name,
    expectedUpdatedAt: submitted.updatedAt,
  });

  const history = await fixture.service.getRequestHistory(submitted.id, ownerA);
  const statuses: string[] = [];
  for (const entry of history)
    statuses.push(
      (await fixture.service.getRequestSnapshot(submitted.id, entry.id, ownerA))
        .status,
    );
  assert.deepEqual(statuses, ['Draft', submittedStatus, next.name]);
});

void it('hides PSF Created Information in every Request Snapshot from a Requester until release', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  const withPsf = await fixture.service.updatePsfCreatedData(submitted.id, {
    actor: ownerA,
    expectedUpdatedAt: submitted.updatedAt,
    psfCreatedData: { file: 'secret.psf' },
  });
  const edited = await fixture.service.updateDraftRequesterData(
    submitted.id,
    {
      formVersion: 1,
      expectedUpdatedAt: withPsf.updatedAt,
      requesterData: { title: 'Edited after PSF' },
    },
    requester,
  );
  const history = await fixture.service.getRequestHistory(submitted.id, ownerA);
  const psfEntry = history.find(
    (entry) => entry.actionType === 'PSF_CREATED_INFORMATION_UPDATED',
  );
  const laterEntry = history.at(-1);
  assert.ok(psfEntry && laterEntry);

  const ownerView = await fixture.service.getRequestSnapshot(
    submitted.id,
    laterEntry.id,
    ownerA,
  );
  assert.equal(ownerView.psfCreatedData.file, 'secret.psf');

  await assert.rejects(
    fixture.service.getRequestSnapshot(submitted.id, psfEntry.id, requester),
    NotFoundException,
  );
  const requesterView = await fixture.service.getRequestSnapshot(
    submitted.id,
    laterEntry.id,
    requester,
  );
  assert.equal(requesterView.psfCreatedDataVisible, false);
  assert.equal(JSON.stringify(requesterView).includes('secret.psf'), false);

  const configuration = await fixture.workflow.getConfiguration();
  const trigger = await openStatusOtherThan(submittedStatus);
  await fixture.workflow.applyOperation(
    {
      action: 'settings',
      psfVisibilityTriggerId: trigger.id,
      expectedUpdatedAt: configuration.updatedAt,
    },
    admin,
  );
  await fixture.service.updateRequestStatus(submitted.id, {
    actor: ownerA,
    status: trigger.name,
    expectedUpdatedAt: edited.updatedAt,
  });

  const released = await fixture.service.getRequestSnapshot(
    submitted.id,
    psfEntry.id,
    requester,
  );
  assert.equal(released.psfCreatedData.file, 'secret.psf');
});

void it('keeps Draft-period Request Snapshots private to the creator until submission', async () => {
  const draft = await fixture.draft();
  const [created] = await fixture.service.getRequestHistory(
    draft.id,
    requester,
  );
  for (const other of [ownerA, admin])
    await assert.rejects(
      fixture.service.getRequestSnapshot(draft.id, created.id, other),
      ForbiddenException,
    );

  await fixture.submit(draft);
  const shared = await fixture.service.getRequestSnapshot(
    draft.id,
    created.id,
    ownerA,
  );
  assert.equal(shared.status, 'Draft');
});

void it('stores no Request Snapshot for bulk Status replacement or for entries recorded before', async () => {
  let configuration = await fixture.workflow.applyOperation(
    {
      action: 'create',
      name: 'Retiring status',
      kind: 'open',
      expectedUpdatedAt: (await fixture.workflow.getConfiguration()).updatedAt,
    },
    admin,
  );
  const retiring = configuration.entries.find(
    (entry) => entry.name === 'Retiring status',
  );
  const replacement = await openStatusOtherThan('Retiring status');
  assert.ok(retiring);
  const submitted = await fixture.submit(await fixture.draft());
  await fixture.service.updateRequestStatus(submitted.id, {
    actor: ownerA,
    status: retiring.name,
    expectedUpdatedAt: submitted.updatedAt,
  });
  await db.query(
    "UPDATE psf_request_audit_logs SET request_snapshot_json = NULL WHERE request_id = $1 AND action_type = 'DRAFT_CREATED'",
    [submitted.id],
  );
  configuration = await fixture.workflow.getConfiguration();
  await fixture.workflow.applyOperation(
    {
      action: 'delete',
      id: retiring.id,
      replacementId: replacement.id,
      expectedUpdatedAt: configuration.updatedAt,
    },
    admin,
  );

  const history = await fixture.service.getRequestHistory(submitted.id, ownerA);
  assert.deepEqual(
    history.map((entry) => [entry.actionType, entry.hasRequestSnapshot]),
    [
      ['DRAFT_CREATED', false],
      ['REQUEST_SUBMITTED', true],
      ['REQUEST_STATUS_CHANGED', true],
      ['REQUEST_STATUS_CHANGED', false],
    ],
  );
  for (const entry of [history[0], history[3]])
    await assert.rejects(
      fixture.service.getRequestSnapshot(submitted.id, entry.id, ownerA),
      NotFoundException,
    );
  await assert.rejects(
    fixture.service.getRequestSnapshot(submitted.id, 'not-an-entry', ownerA),
    NotFoundException,
  );
});

void it('records the content a submit changed next to its Status change', async () => {
  const draft = await fixture.draft();
  // Content stored before normalization existed, as in older or loaded data.
  await db.query(
    `UPDATE psf_requests SET requester_data_json = jsonb_set(requester_data_json, '{title}', '"  Padded title  "') WHERE id = $1`,
    [draft.id],
  );
  await fixture.submit(draft);

  const history = await fixture.service.getRequestHistory(draft.id, requester);
  assert.deepEqual(history.at(-1)?.metadata, {
    fromStatus: 'Draft',
    toStatus: submittedStatus,
    fieldChanges: [
      {
        fieldKey: 'title',
        fieldLabel: 'Title',
        before: '  Padded title  ',
        after: 'Padded title',
      },
    ],
  });
});

void it('lists the fields a Draft Form Version upgrade removed and shows earlier Request Snapshots in their own Form Version', async () => {
  const draft = await fixture.draft();
  const nextSchema: FormSchemaJson = {
    ...schema,
    version: 2,
    sections: [
      {
        ...schema.sections[0],
        fields: [
          {
            fieldKey: 'subject',
            canonicalKey: 'subject',
            label: 'Subject',
            type: 'text',
            required: false,
          },
          schema.sections[0].fields[1],
        ],
      },
    ],
  };
  await db.query(
    "UPDATE form_definitions SET status = 'published' WHERE form_key = 'psf-request' AND status = 'active'",
  );
  await db.query(
    "INSERT INTO form_definitions (id, form_key, version, title, schema_json, status, created_at, published_at) VALUES ('00000000-0000-4000-8000-0000000000f2', 'psf-request', 2, 'Request', $1, 'active', NOW(), NOW())",
    [nextSchema],
  );
  try {
    await fixture.service.upgradeDraftSchema(
      draft.id,
      { formVersion: 2 },
      requester,
    );
  } finally {
    await db.query(
      "DELETE FROM form_definitions WHERE form_key = 'psf-request' AND version = 2",
    );
    await db.query(
      "UPDATE form_definitions SET status = 'active' WHERE form_key = 'psf-request' AND version = 1",
    );
  }

  const [created, upgraded] = await fixture.service.getRequestHistory(
    draft.id,
    requester,
  );
  assert.deepEqual(upgraded.metadata, {
    fromFormVersion: 1,
    toFormVersion: 2,
    fieldChanges: [
      {
        fieldKey: 'title',
        fieldLabel: 'Title',
        before: 'Test request',
        after: null,
      },
    ],
  });
  const before = await fixture.service.getRequestSnapshot(
    draft.id,
    created.id,
    requester,
  );
  assert.equal(before.formVersion, 1);
  assert.equal(before.schemaSnapshot.version, 1);
  assert.equal(before.requesterData.title, 'Test request');
  const after = await fixture.service.getRequestSnapshot(
    draft.id,
    upgraded.id,
    requester,
  );
  assert.equal(after.formVersion, 2);
  assert.equal(after.schemaSnapshot.version, 2);
  assert.equal(Object.hasOwn(after.requesterData, 'title'), false);

  // Without the Form Version of that time it must not be shown in another one.
  await db.query(
    "UPDATE form_definitions SET version = 99 WHERE form_key = 'psf-request' AND version = 1",
  );
  try {
    await assert.rejects(
      fixture.service.getRequestSnapshot(draft.id, created.id, requester),
      NotFoundException,
    );
  } finally {
    await db.query(
      "UPDATE form_definitions SET version = 1 WHERE form_key = 'psf-request' AND version = 99",
    );
  }
});

void it('deletes a Draft together with its Request Snapshots', async () => {
  const draft = await fixture.draft();
  const [created] = await fixture.service.getRequestHistory(
    draft.id,
    requester,
  );
  await fixture.service.deleteDraft(draft.id, draft.updatedAt, requester);

  await assert.rejects(
    fixture.service.getRequestSnapshot(draft.id, created.id, requester),
    NotFoundException,
  );
  const remaining = await db.query(
    'SELECT 1 FROM psf_request_audit_logs WHERE request_id = $1',
    [draft.id],
  );
  assert.equal(remaining.rows.length, 0);
});

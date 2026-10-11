import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import {
  configuredPostgres,
  type ConfiguredPostgres,
} from './configured-postgres';
import {
  admin,
  lifecycleFixture,
  ownerA,
  requester,
  schema,
  submittedStatus,
} from './draft-lifecycle.fixture';
import type { FormSchemaJson } from '../src/admin/form_schema.service';

// In-memory PostgreSQL by default. With REQUEST_SNAPSHOT_CONFIGURED_POSTGRES=1
// and the DB_* variables loaded (node --env-file=.env), the same tests run on
// that server inside session-temporary tables; see configured-postgres.ts.
const onConfiguredServer =
  process.env.REQUEST_SNAPSHOT_CONFIGURED_POSTGRES === '1';

let db: {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
};
let configured: ConfiguredPostgres | undefined;
// Storage changes need a read-write transaction on the configured server.
let ddl = <T>(change: () => Promise<T>): Promise<T> => change();
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;

before(
  async () => {
    if (onConfiguredServer) {
      const server = (configured = await configuredPostgres());
      db = server;
      ddl = (change) => server.ddl(change);
      fixture = await ddl(() => lifecycleFixture(server.pool));
      return;
    }
    const memory = new PGlite();
    const query = (sql: string, values?: unknown[]) =>
      memory.query<Record<string, unknown>>(sql, values);
    db = { query, close: () => memory.close() };
    fixture = await lifecycleFixture({
      query,
      connect: () => Promise.resolve({ query, release() {} }),
    } as unknown as Pool);
  },
  { timeout: 60000 },
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

void it('rolls a change back when its Audit History entry cannot be recorded', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  await ddl(() =>
    db.query(
      "ALTER TABLE psf_request_audit_logs ADD CONSTRAINT refuse_requester_edits CHECK (action_type <> 'REQUESTER_INFORMATION_UPDATED') NOT VALID",
    ),
  );
  try {
    await assert.rejects(
      fixture.service.updateDraftRequesterData(
        submitted.id,
        {
          formVersion: 1,
          expectedUpdatedAt: submitted.updatedAt,
          requesterData: { title: 'Never stored' },
        },
        requester,
      ),
      /refuse_requester_edits/,
    );
  } finally {
    await ddl(() =>
      db.query(
        'ALTER TABLE psf_request_audit_logs DROP CONSTRAINT refuse_requester_edits',
      ),
    );
  }

  const stored = await fixture.service.getRequest(submitted.id, requester);
  assert.equal(stored.requesterData.title, 'Test request');
  assert.equal(stored.updatedAt, submitted.updatedAt);
  const history = await fixture.service.getRequestHistory(
    submitted.id,
    requester,
  );
  assert.deepEqual(
    history.map((entry) => entry.actionType),
    ['DRAFT_CREATED', 'REQUEST_SUBMITTED'],
  );
});

void it(
  'gives real requests their first Request Snapshot on their first entry',
  { skip: !onConfiguredServer && 'needs the configured PostgreSQL server' },
  async () => {
    assert.ok(configured);
    const limit = Number(process.env.REQUEST_SNAPSHOT_SAMPLE ?? 500);
    const columns = String(
      (
        await configured.readConfigured(
          `SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) AS list
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'psf_requests'`,
        )
      ).rows[0].list,
    );
    // Copied into this session's temporary table; the configured rows are only read.
    const sample = await configured.readConfigured(
      `INSERT INTO psf_requests (${columns})
       SELECT ${columns} FROM public.psf_requests
       WHERE status <> 'Draft' ORDER BY md5(id::text) LIMIT $1
       RETURNING id`,
      [limit],
    );
    const { entries, psfVisibilityTriggerIds = [] } =
      await fixture.workflow.getConfiguration();
    const tally = {
      sampled: 0,
      edited: 0,
      notEditable: 0,
      hiddenFromRequester: 0,
    };

    const refusals: Record<string, number> = {};

    for (const row of sample.rows) {
      const id = String(row.id);
      const before = await fixture.service.getRequest(id, ownerA);
      assert.deepEqual(await fixture.service.getRequestHistory(id, ownerA), []);
      const target = entries.find(
        (entry) =>
          entry.kind === 'open' &&
          entry.name !== before.status &&
          !psfVisibilityTriggerIds.includes(entry.id),
      );
      assert.ok(target);
      const moved = await fixture.service.updateRequestStatus(id, {
        actor: ownerA,
        status: target.name,
        expectedUpdatedAt: before.updatedAt,
      });

      const [first] = await fixture.service.getRequestHistory(id, ownerA);
      assert.equal(first.hasRequestSnapshot, true);
      const requestSnapshot = await fixture.service.getRequestSnapshot(
        id,
        first.id,
        ownerA,
      );
      assert.equal(requestSnapshot.status, target.name);
      assert.equal(requestSnapshot.formVersion, before.formVersion);
      assert.equal(requestSnapshot.schemaSnapshot.version, before.formVersion);
      assert.deepEqual(requestSnapshot.requesterData, before.requesterData);
      assert.deepEqual(requestSnapshot.psfCreatedData, before.psfCreatedData);

      const requesterView = await fixture.service.getRequestSnapshot(
        id,
        first.id,
        requester,
      );
      assert.equal(
        requesterView.psfCreatedDataVisible,
        before.psfReleasedAt !== null,
      );
      if (!requesterView.psfCreatedDataVisible) {
        assert.deepEqual(requesterView.psfCreatedData, {});
        tally.hiddenFromRequester++;
      }

      const field = before.schemaSnapshot.sections
        .flatMap((section) => section.fields)
        .find(
          (candidate) =>
            candidate.type === 'text' &&
            !['requester_name', 'product_type'].includes(candidate.fieldKey),
        );
      assert.ok(field);
      // Saved values are trimmed, so an empty field becomes just the suffix.
      const current = before.requesterData[field.fieldKey];
      const edited =
        `${typeof current === 'string' ? current : ''} (edited)`.trim();
      try {
        await fixture.service.updateDraftRequesterData(
          id,
          {
            formVersion: before.formVersion,
            expectedUpdatedAt: moved.updatedAt,
            requesterData: {
              ...before.requesterData,
              [field.fieldKey]: edited,
            },
          },
          ownerA,
        );
      } catch (error) {
        // Loaded content that its own form no longer accepts; not a snapshot fault.
        assert.ok(error instanceof BadRequestException);
        // The rule that refused it, without field names or values.
        const rule =
          /missing required fields|must be one of the configured options|must be a number|must be a valid ISO calendar date|Unknown form field/.exec(
            error.message,
          )?.[0] ?? 'other';
        refusals[rule] = (refusals[rule] ?? 0) + 1;
        tally.notEditable++;
        tally.sampled++;
        continue;
      }
      const history = await fixture.service.getRequestHistory(id, ownerA);
      assert.equal(history.length, 2);
      const afterEdit = await fixture.service.getRequestSnapshot(
        id,
        history[1].id,
        ownerA,
      );
      assert.equal(afterEdit.requesterData[field.fieldKey], edited);
      const unchanged = await fixture.service.getRequestSnapshot(
        id,
        first.id,
        ownerA,
      );
      assert.deepEqual(unchanged.requesterData, before.requesterData);
      tally.edited++;
      tally.sampled++;
    }

    const size = await db.query(
      `SELECT count(*)::int AS stored, round(avg(pg_column_size(request_snapshot_json)))::int AS average_bytes,
              max(pg_column_size(request_snapshot_json))::int AS largest_bytes
       FROM psf_request_audit_logs
       WHERE request_id = ANY($1::uuid[])`,
      [sample.rows.map((row) => row.id)],
    );
    console.log(
      'real requests',
      tally,
      'edits refused by',
      refusals,
      'Request Snapshots',
      size.rows[0],
    );
    assert.ok(tally.sampled > 0);
  },
);

void it('adds Request Snapshot storage to an existing audit table and leaves its earlier entries without one', async () => {
  const draft = await fixture.draft();
  await ddl(async () => {
    await db.query(
      'ALTER TABLE psf_request_audit_logs DROP COLUMN request_snapshot_json',
    );
    await fixture.audit.onModuleInit();
  });

  const [created] = await fixture.service.getRequestHistory(
    draft.id,
    requester,
  );
  assert.equal(created.hasRequestSnapshot, false);
  await fixture.service.updateDraftRequesterData(
    draft.id,
    {
      formVersion: 1,
      expectedUpdatedAt: draft.updatedAt,
      requesterData: { title: 'Saved after the upgrade' },
    },
    requester,
  );
  const history = await fixture.service.getRequestHistory(draft.id, requester);
  assert.equal(history[1].hasRequestSnapshot, true);
  const requestSnapshot = await fixture.service.getRequestSnapshot(
    draft.id,
    history[1].id,
    requester,
  );
  assert.equal(requestSnapshot.requesterData.title, 'Saved after the upgrade');
});

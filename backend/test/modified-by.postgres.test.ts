import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { after, before, beforeEach, it } from 'node:test';
import type { Pool } from 'pg';
import {
  admin,
  lifecycleFixture,
  ownerA,
  requester,
  schema,
} from './draft-lifecycle.fixture';

// Modified By is system-managed: every save records the acting user, whether
// or not the request's Form Schema has a Modified By field. The fixture's
// requester form has none, like the seeded form and forms loaded before
// 19 October 2026.
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
beforeEach(() => fixture.reset());

void it('runs against a requester form without a Modified By field', () => {
  const keys = schema.sections.flatMap((section) =>
    section.fields.flatMap((field) => [field.fieldKey, field.canonicalKey]),
  );
  assert.equal(keys.includes('modified_by'), false);
});

void it('records whoever last saved requester information as Modified By', async () => {
  const submitted = await fixture.submit(await fixture.draft());

  const saved = await fixture.service.updateDraftRequesterData(
    submitted.id,
    {
      formVersion: submitted.formVersion,
      expectedUpdatedAt: submitted.updatedAt,
      requesterData: { ...submitted.requesterData, title: 'Renamed' },
    },
    admin,
  );

  assert.equal(saved.requesterData.modified_by, admin.displayName);
  assert.equal(
    (await fixture.service.getRequest(submitted.id, requester)).requesterData
      .modified_by,
    admin.displayName,
  );
});

void it('records the creator as Modified By on a new Draft', async () => {
  const draft = await fixture.draft(requester);

  assert.equal(draft.requesterData.modified_by, requester.displayName);
});

void it('ignores a Modified By value sent with the form', async () => {
  const submitted = await fixture.submit(await fixture.draft());

  const saved = await fixture.service.updateDraftRequesterData(
    submitted.id,
    {
      formVersion: submitted.formVersion,
      expectedUpdatedAt: submitted.updatedAt,
      requesterData: {
        ...submitted.requesterData,
        title: 'Renamed',
        modified_by: 'Somebody Else',
      },
    },
    admin,
  );

  assert.equal(saved.requesterData.modified_by, admin.displayName);
});

void it('records whoever changed the Work Status as Modified By', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  const { entries } = await fixture.workflow.getConfiguration();
  const next = entries.find(
    (entry) => entry.kind === 'open' && entry.name !== submitted.status,
  );
  assert.ok(next);

  const changed = await fixture.service.updateRequestStatus(submitted.id, {
    actor: admin,
    status: next.name,
    expectedUpdatedAt: submitted.updatedAt,
  });

  assert.equal(changed.requesterData.modified_by, admin.displayName);
});

void it('records whoever saved PSF Created Information as Modified By', async () => {
  const submitted = await fixture.submit(await fixture.draft());

  const saved = await fixture.service.updatePsfCreatedData(submitted.id, {
    actor: ownerA,
    expectedUpdatedAt: submitted.updatedAt,
    psfCreatedData: { file: 'SETUP_A.psf' },
  });

  assert.equal(saved.requesterData.modified_by, ownerA.displayName);
});

async function rerunStartupMigrations() {
  await db.query('DELETE FROM request_data_migrations');
  await fixture.service.onModuleInit();
}

void it('fills in Modified By from Audit History for requests saved before it was recorded', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  await fixture.service.updateDraftRequesterData(
    submitted.id,
    {
      formVersion: submitted.formVersion,
      expectedUpdatedAt: submitted.updatedAt,
      requesterData: { ...submitted.requesterData, title: 'Renamed' },
    },
    admin,
  );
  await db.query(
    "UPDATE psf_requests SET requester_data_json = requester_data_json - 'modified_by'",
  );

  await rerunStartupMigrations();

  const request = await fixture.service.getRequest(submitted.id, requester);
  assert.equal(request.requesterData.modified_by, admin.displayName);
});

void it('keeps a Modified By that is already recorded, such as an imported one', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  await db.query(
    'UPDATE psf_requests SET requester_data_json = requester_data_json || \'{"modified_by": "Workbook Editor"}\'::jsonb',
  );

  await rerunStartupMigrations();

  const request = await fixture.service.getRequest(submitted.id, requester);
  assert.equal(request.requesterData.modified_by, 'Workbook Editor');
});

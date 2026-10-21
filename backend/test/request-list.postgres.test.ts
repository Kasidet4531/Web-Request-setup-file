import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { after, before, beforeEach, it } from 'node:test';
import type { Pool } from 'pg';
import type { FormSchemaJson } from '../src/admin/form_schema.service';
import type { PsfRequestResponse } from '../src/requests/requests.service';
import {
  admin,
  lifecycleFixture,
  ownerA,
  psfSchema,
  requester,
  submittedStatus,
} from './draft-lifecycle.fixture';

// The request list shows each request's PSF Setup File Name and Job File Name,
// both PSF Created Information fields. Neither is marked searchable here, as in
// the seeded form.
const psfFileNamesSchema: FormSchemaJson = {
  ...psfSchema,
  sections: [
    {
      sectionKey: 'psf',
      title: 'PSF',
      fields: [
        {
          fieldKey: 'psf_setup_file_name',
          canonicalKey: 'psf_setup_file_name',
          label: 'PSF Setup File Name',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'job_file_name',
          canonicalKey: 'job_file_name',
          label: 'Job File Name',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};

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
    await db.query(
      "UPDATE form_definitions SET schema_json=$1 WHERE form_key='psf-created-information' AND status='active'",
      [psfFileNamesSchema],
    );
  },
  { timeout: 30000 },
);
after(async () => db.close());
beforeEach(() => fixture.reset());

async function submittedWithPsfFileNames(): Promise<PsfRequestResponse> {
  const submitted = await fixture.submit(await fixture.draft());
  return fixture.service.updatePsfCreatedData(submitted.id, {
    actor: ownerA,
    expectedUpdatedAt: submitted.updatedAt,
    psfCreatedData: {
      psf_setup_file_name: 'SETUP_A.psf',
      job_file_name: 'JOB_A.job',
    },
  });
}

void it('lists the PSF Setup File Name and Job File Name of each request', async () => {
  await submittedWithPsfFileNames();

  const { items } = await fixture.service.queryRequests({}, ownerA);

  assert.equal(items.length, 1);
  assert.equal(items[0].psfSetupFileName, 'SETUP_A.psf');
  assert.equal(items[0].jobFileName, 'JOB_A.job');
});

void it('hides PSF file names from a Requester until PSF Visibility Release', async () => {
  const saved = await submittedWithPsfFileNames();

  const before = await fixture.service.queryRequests({}, requester);
  assert.equal(before.items[0].psfSetupFileName, null);
  assert.equal(before.items[0].jobFileName, null);

  const configuration = await fixture.workflow.getConfiguration();
  const trigger = configuration.entries.find(
    (entry) => entry.kind === 'open' && entry.name !== submittedStatus,
  );
  assert.ok(trigger);
  await fixture.workflow.applyOperation(
    {
      action: 'settings',
      psfVisibilityTriggerId: trigger.id,
      expectedUpdatedAt: configuration.updatedAt,
    },
    admin,
  );
  await fixture.service.updateRequestStatus(saved.id, {
    actor: ownerA,
    status: trigger.name,
    expectedUpdatedAt: saved.updatedAt,
  });

  const released = await fixture.service.queryRequests({}, requester);
  assert.equal(released.items[0].psfSetupFileName, 'SETUP_A.psf');
  assert.equal(released.items[0].jobFileName, 'JOB_A.job');
});

void it('fills in PSF file names for requests listed before the list showed them', async () => {
  await submittedWithPsfFileNames();
  // As left by earlier versions: no Job File Name column, and a PSF Setup
  // File Name only where its field was searchable.
  await db.query(
    'UPDATE psf_request_search_index SET psf_setup_file_name = NULL, job_file_name = NULL',
  );
  await db.query('DELETE FROM request_data_migrations');

  await fixture.service.onModuleInit();

  const { items } = await fixture.service.queryRequests({}, ownerA);
  assert.equal(items[0].psfSetupFileName, 'SETUP_A.psf');
  assert.equal(items[0].jobFileName, 'JOB_A.job');
});

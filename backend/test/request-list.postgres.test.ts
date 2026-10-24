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
  schema,
  submittedStatus,
} from './draft-lifecycle.fixture';

// Request For tells engineering work from production. Like PSF file names, the
// list shows it whether or not its field is searchable or exportable.
const requestForSchema: FormSchemaJson = {
  ...schema,
  sections: [
    {
      ...schema.sections[0],
      fields: [
        ...schema.sections[0].fields,
        {
          fieldKey: 'request_for',
          canonicalKey: 'request_for',
          label: 'Request For',
          type: 'radio',
          required: false,
          options: ['Engineering', 'Production'],
        },
      ],
    },
  ],
};

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
    await db.query(
      "UPDATE form_definitions SET schema_json=$1 WHERE form_key='psf-request' AND status='active'",
      [requestForSchema],
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

// Moves the request to the Status chosen as the PSF Visibility trigger.
async function releasePsfCreatedInformation(
  request: PsfRequestResponse,
): Promise<void> {
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
  await fixture.service.updateRequestStatus(request.id, {
    actor: ownerA,
    status: trigger.name,
    expectedUpdatedAt: request.updatedAt,
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

  await releasePsfCreatedInformation(saved);

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

void it('lets a Requester find a request by PSF Setup File Name only after PSF Visibility Release', async () => {
  const saved = await submittedWithPsfFileNames();
  const search = { keyword: 'SETUP_A' };

  assert.equal((await fixture.service.queryRequests(search, ownerA)).total, 1);
  assert.equal(
    (await fixture.service.queryRequests(search, requester)).total,
    0,
  );

  await releasePsfCreatedInformation(saved);

  assert.equal(
    (await fixture.service.queryRequests(search, requester)).total,
    1,
  );
});

async function submittedFor(
  requestFor: string,
  actor = requester,
): Promise<PsfRequestResponse> {
  const draft = await fixture.service.createDraft(
    { requesterData: { title: 'Test request', request_for: requestFor } },
    actor,
  );
  return fixture.submit(draft);
}

void it('lists the Request For of each request', async () => {
  await submittedFor('Production');

  const { items } = await fixture.service.queryRequests({}, ownerA);

  assert.equal(items[0].requestFor, 'Production');
});

void it('fills in Request For for requests listed before the list showed it', async () => {
  await submittedFor('Engineering');
  // As left by earlier versions, which had no Request For column.
  await db.query('UPDATE psf_request_search_index SET request_for = NULL');
  await db.query('DELETE FROM request_data_migrations');

  await fixture.service.onModuleInit();

  const { items } = await fixture.service.queryRequests({}, ownerA);
  assert.equal(items[0].requestFor, 'Engineering');
});

void it('finds a request by the first name of its Requester', async () => {
  const somchai = { ...requester, displayName: 'Somchai Jaidee' };
  const found = await submittedFor('Production', somchai);
  await submittedFor('Production');

  const { items, total } = await fixture.service.queryRequests(
    { keyword: 'somchai' },
    ownerA,
  );

  assert.equal(total, 1);
  assert.equal(items[0].requestId, found.id);
  assert.equal(items[0].requester, 'Somchai Jaidee');
});

void it('keeps a Requester to the requests they could see before when searching by name', async () => {
  const somchai = { ...ownerA, displayName: 'Somchai Jaidee' };
  const draft = await fixture.service.createDraft(
    { requesterData: { title: 'Owner request' } },
    somchai,
  );
  await fixture.service.submitRequest(
    draft.id,
    {
      formVersion: 1,
      expectedUpdatedAt: draft.updatedAt,
      status: submittedStatus,
    },
    somchai,
  );
  const search = { keyword: 'somchai' };

  const related = await fixture.service.queryRequests(
    { ...search, scope: 'related' },
    requester,
  );
  assert.equal(related.total, 0);
  assert.equal(related.summary.open, 0);
  assert.equal(
    (await fixture.service.queryRequests(search, requester)).total,
    1,
  );
});

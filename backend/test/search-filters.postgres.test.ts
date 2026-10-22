import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import type { Pool } from 'pg';
import { lifecycleFixture, ownerA } from './draft-lifecycle.fixture';

let database: PGlite;
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;
before(async () => {
  database = new PGlite();
  const query = (sql: string, values?: unknown[]) =>
    database.query(sql, values);
  fixture = await lifecycleFixture({
    query,
    connect: async () => ({ query, release() {} }),
  } as unknown as Pool);
});
after(async () => database.close());

void it('offers legacy Status filters without allowing them as catalog transitions or exposing Drafts', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  await fixture.draft();
  // Model a verbatim imported value outside the current catalog.
  for (const table of ['psf_requests', 'psf_request_search_index']) {
    await database.query(
      `UPDATE ${table} SET status = $1 WHERE ${table === 'psf_requests' ? 'id' : 'request_id'} = $2`,
      ['Legacy Transfer -- pending', submitted.id],
    );
  }
  const configuration: { statuses: string[]; filterStatuses?: string[] } =
    await fixture.workflow.getPublicConfiguration();
  assert.ok(configuration.filterStatuses);
  assert.ok(
    configuration.filterStatuses.includes('Legacy Transfer -- pending'),
  );
  assert.equal(configuration.filterStatuses.includes('Draft'), false);
  assert.equal(
    configuration.statuses.includes('Legacy Transfer -- pending'),
    false,
  );
  assert.equal(
    new Set(configuration.filterStatuses).size,
    configuration.filterStatuses.length,
  );
  const result = await fixture.service.queryRequests(
    {
      scope: 'related',
      workState: 'all',
      status: 'Legacy Transfer -- pending',
    },
    ownerA,
  );
  assert.equal(result.total, 1);
  assert.equal(result.items[0].requestId, submitted.id);
});

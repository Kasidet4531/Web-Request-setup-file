import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { after, before, beforeEach, it } from 'node:test';
import type { Pool } from 'pg';
import {
  WorkflowTransitionService,
  type WorkflowConfiguration,
} from '../src/admin/workflow_transition.service';
import { admin, lifecycleFixture } from './draft-lifecycle.fixture';

// The status catalog keeps an explicit order (Draft first, then the Work
// Statuses as administrators arrange them), and every list of Work Statuses
// follows it.
let db: PGlite;
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;

before(
  async () => {
    db = new PGlite();
    const query = (sql: string, args?: unknown[]) => db.query(sql, args);
    const pool = {
      query,
      connect: () => Promise.resolve({ query, release() {} }),
    } as unknown as Pool;
    fixture = await lifecycleFixture(pool);
  },
  { timeout: 30000 },
);
after(async () => db.close());
beforeEach(async () => {
  await fixture.reset();
  // Start every test from the default catalog in its seeded order.
  await db.query('DELETE FROM workflow_transition_config');
  await fixture.workflow.onModuleInit();
});

const CANCEL = '0% -- Rejected (Cancel Request)';

function entry(configuration: WorkflowConfiguration, name: string) {
  const found = configuration.entries.find((item) => item.name === name);
  assert.ok(found, `${name} is in the catalog`);
  return found;
}

void it('moves a Work Status to the typed position and every Status list follows the new order', async () => {
  const before = await fixture.workflow.getConfiguration();

  await fixture.workflow.applyOperation(
    {
      action: 'move',
      id: entry(before, CANCEL).id,
      position: 2,
      expectedUpdatedAt: before.updatedAt,
    },
    admin,
  );

  const expected = [
    '5% -- Reject (Information not complete)',
    CANCEL,
    '10% -- Test Engineer Data Entry',
    '20% -- PSF File Creating',
    '30% -- Compare Old and New layout',
    '40% -- Feedback Requester(Layout mismatch)',
    '80% -- Wait for create DCC',
    '81% -- Edit Template Map (Bin62)',
    '82% -- Wait for sent Template Map',
    '83% -- Complete Excel probe pattern',
    '85 % -- Reject check list',
    '90% -- Wait for buyoff check list',
    '93% -- Provide test template map to EWFM\\Update auto FI script (ST Fab)',
    '95% -- Reject (Wrong site location and wafer map)',
    '99% -- Wait requestor Buyoff site location and wafer map',
    '100% -- Completed',
  ];
  const catalog = await fixture.workflow.getConfiguration();
  assert.deepEqual(catalog.statuses, expected);
  assert.deepEqual(
    catalog.entries.map(({ name }) => name),
    ['Draft', ...expected],
  );
  const lists = await fixture.workflow.getPublicConfiguration();
  assert.deepEqual(lists.statuses, expected);
  assert.deepEqual(lists.filterStatuses, expected);
  const request = await fixture.submit(await fixture.draft());
  const options = await fixture.service.getAllowedStatusTransitions(
    request.id,
    admin,
  );
  assert.deepEqual(
    options.allowedNextStatuses,
    expected.filter((name) => name !== '10% -- Test Engineer Data Entry'),
  );
});

void it('refuses a position that is not a whole number from 1 to the number of Work Statuses, and nothing moves', async () => {
  const before = await fixture.workflow.getConfiguration();
  const cancel = entry(before, CANCEL);

  for (const position of [0, 17, -1, 1.5, '2', null, undefined]) {
    await assert.rejects(
      fixture.workflow.applyOperation(
        {
          action: 'move',
          id: cancel.id,
          position,
          expectedUpdatedAt: before.updatedAt,
        },
        admin,
      ),
      {
        name: 'BadRequestException',
        message: 'Position must be a whole number from 1 to 16.',
      },
      `position ${String(position)}`,
    );
  }

  assert.deepEqual(await fixture.workflow.getConfiguration(), before);
});

void it('keeps Draft in its fixed first place', async () => {
  const before = await fixture.workflow.getConfiguration();

  await assert.rejects(
    fixture.workflow.applyOperation(
      {
        action: 'move',
        id: entry(before, 'Draft').id,
        position: 3,
        expectedUpdatedAt: before.updatedAt,
      },
      admin,
    ),
    { name: 'BadRequestException', message: 'Draft keeps its place first.' },
  );

  assert.deepEqual(await fixture.workflow.getConfiguration(), before);
});

void it('gives the second of two administrators saving from the same page the reload conflict, keeping the first order', async () => {
  const page = await fixture.workflow.getConfiguration();
  const first = await fixture.workflow.applyOperation(
    {
      action: 'move',
      id: entry(page, CANCEL).id,
      position: 1,
      expectedUpdatedAt: page.updatedAt,
    },
    admin,
  );

  await assert.rejects(
    fixture.workflow.applyOperation(
      {
        action: 'move',
        id: entry(page, '100% -- Completed').id,
        position: 1,
        expectedUpdatedAt: page.updatedAt,
      },
      admin,
    ),
    {
      name: 'ConflictException',
      message: 'The workflow status catalog changed. Reload and try again.',
    },
  );

  const current = await fixture.workflow.getConfiguration();
  assert.deepEqual(current, first);
  assert.equal(current.statuses[0], CANCEL);
});

void it('keeps the order after a restart', async () => {
  const before = await fixture.workflow.getConfiguration();
  await fixture.workflow.applyOperation(
    {
      action: 'move',
      id: entry(before, '100% -- Completed').id,
      position: 1,
      expectedUpdatedAt: before.updatedAt,
    },
    admin,
  );

  const restarted = new WorkflowTransitionService(fixture.pool, fixture.audit);
  await restarted.onModuleInit();

  assert.deepEqual((await restarted.getConfiguration()).statuses.slice(0, 2), [
    '100% -- Completed',
    '5% -- Reject (Information not complete)',
  ]);
});

void it("changes only the order: requests' Work Statuses, names, kinds, Status Email Policies and PSF Visibility Release triggers stay", async () => {
  const request = await fixture.submit(await fixture.draft());
  let page = await fixture.workflow.getConfiguration();
  page = await fixture.workflow.applyOperation(
    {
      action: 'rename',
      id: entry(page, '100% -- Completed').id,
      name: '100% -- Completed',
      psfAccessTrigger: true,
      emailPolicy: { enabled: true, to: ['team@example.com'], cc: [] },
      expectedUpdatedAt: page.updatedAt,
    },
    admin,
  );
  const history = await fixture.service.getRequestHistory(request.id, admin);
  const mail = fixture.mailCount();
  const byId = (configuration: WorkflowConfiguration) =>
    [...configuration.entries].sort((a, b) => a.id.localeCompare(b.id));

  const moved = await fixture.workflow.applyOperation(
    {
      action: 'move',
      id: entry(page, '100% -- Completed').id,
      position: 1,
      expectedUpdatedAt: page.updatedAt,
    },
    admin,
  );

  assert.equal(moved.statuses[0], '100% -- Completed');
  assert.deepEqual(byId(moved), byId(page));
  assert.deepEqual(moved.psfVisibilityTriggerIds, page.psfVisibilityTriggerIds);
  const unchanged = await fixture.service.getRequest(request.id, admin);
  assert.equal(unchanged.status, request.status);
  assert.equal(unchanged.updatedAt, request.updatedAt);
  assert.deepEqual(
    await fixture.service.getRequestHistory(request.id, admin),
    history,
  );
  assert.equal(fixture.mailCount(), mail);
});

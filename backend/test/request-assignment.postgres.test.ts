import 'reflect-metadata';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { before, beforeEach, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import {
  assignmentFixture,
  requester,
  ownerA,
  ownerB,
  admin,
} from './request-assignment.fixture';
import type { RequestQueryDto } from '../src/requests/requests.service';

void describe('atomic assignment on disposable loopback PostgreSQL', () => {
  let postgres: EmbeddedPostgres;
  let pool: Pool;
  let directory: string;
  let fixture: Awaited<ReturnType<typeof assignmentFixture>>;
  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'request-assignment-'));
    const listener = createServer();
    await new Promise<void>((resolve) =>
      listener.listen(0, '127.0.0.1', resolve),
    );
    const address = listener.address();
    assert.ok(address && typeof address === 'object');
    const port = address.port;
    await new Promise<void>((resolve, reject) =>
      listener.close((error) => (error ? reject(error) : resolve())),
    );
    postgres = new EmbeddedPostgres({
      databaseDir: join(directory, 'db'),
      port,
      user: 'assignment_test',
      password: 'disposable-assignment',
      persistent: false,
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => undefined,
      onError: () => undefined,
    });
    await postgres.initialise();
    await postgres.start();
    pool = new Pool({
      host: '127.0.0.1',
      port,
      user: 'assignment_test',
      password: 'disposable-assignment',
      database: 'postgres',
      max: 10,
    });
    fixture = await assignmentFixture(pool);
  });
  beforeEach(async () => fixture.reset());
  after(async () => {
    await pool?.end();
    await postgres?.stop();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const scope = (relation: string) =>
    ({ scope: 'related', relation }) as RequestQueryDto;
  // Catches display-name identity and different relationship predicates in totals/summary.
  void it('same-name users receive only their selected UUID; created-or-assigned is deduplicated; department stays snapshot-scoped; Draft rows excluded', async () => {
    const own = await fixture.draft(ownerA.id, ownerA);
    await fixture.service.submitRequest(
      own.id,
      {
        formVersion: 1,
        status: '10% -- Test Engineer Data Entry',
        expectedUpdatedAt: own.updatedAt,
      },
      ownerA,
    );
    const first = await fixture.submit(await fixture.draft(ownerA.id));
    const second = await fixture.submit(await fixture.draft(ownerB.id));
    const sameDepartmentId = '00000000-0000-4000-8000-000000000106';
    await pool.query(
      "INSERT INTO app_users (id,username,display_name,role,setup_owner_department) VALUES ($1,'same-department-peer','Same Name','setup_owner','GNTC')",
      [sameDepartmentId],
    );
    const peer = await fixture.submit(await fixture.draft(sameDepartmentId));
    await fixture.draft(ownerA.id);
    const a = await fixture.service.queryRequests(scope('all'), ownerA);
    assert.equal(a.total, 2);
    assert.equal(a.summary.open, 2);
    assert.deepEqual(
      new Set(a.items.map((x) => x.requestId)),
      new Set([own.id, first.id]),
    );
    assert.ok(a.items.every((x) => Object.hasOwn(x, 'setupOwnerUserId')));
    const b = await fixture.service.queryRequests(scope('assigned'), ownerB);
    assert.equal(b.total, 1);
    assert.equal(b.items[0].requestId, second.id);
    assert.equal(b.summary.open, 1);
    const department = await fixture.service.queryRequests(
      scope('department'),
      ownerA,
    );
    assert.equal(department.total, 3);
    assert.equal(department.summary.open, 3);
    assert.ok(department.items.some((item) => item.requestId === peer.id));
    assert.equal(
      a.items.some((item) => item.requestId === peer.id),
      false,
    );
    const requesterRelated = await fixture.service.queryRequests(
      scope('all'),
      requester,
    );
    assert.equal(requesterRelated.total, 3);
  });
  // Catches stale profile validity at publication, and inability to escape it by clear/retry.
  void it('Submit rejects role changed after Draft save; omission preserves snapshots; explicit clear permits retry', async () => {
    const draft = await fixture.draft(ownerA.id);
    assert.equal(
      (draft as unknown as { setupOwnerUserId: string }).setupOwnerUserId,
      ownerA.id,
    );
    await pool.query(
      "UPDATE app_users SET role='requester',setup_owner_department=NULL WHERE id=$1",
      [ownerA.id],
    );
    const edited = await fixture.service.updateDraftRequesterData(
      draft.id,
      {
        formVersion: 1,
        expectedUpdatedAt: draft.updatedAt,
        requesterData: { title: 'Edited' },
      },
      requester,
    );
    assert.equal(edited.setupOwner, 'Same Name');
    await assert.rejects(fixture.submit(edited), { status: 400 });
    assert.equal((await fixture.index.queryRequests()).total, 0);
    const cleared = await fixture.service.updateAssignment(
      draft.id,
      { setupOwnerUserId: null, expectedUpdatedAt: edited.updatedAt },
      requester,
    );
    assert.equal(cleared.setupOwnerUserId, null);
    assert.equal(cleared.setupOwner, null);
    assert.equal(cleared.setupOwnerRole, null);
    const submitted = await fixture.submit(cleared);
    assert.notEqual(submitted.status, 'Draft');
  });
  // Catches index upserts silently erasing the UUID and PSF save recapturing owner.
  void it('assignment_survives_status_and_request_data_changes', async () => {
    let row = await fixture.submit(await fixture.draft(ownerB.id));
    row = await fixture.service.updateDraftRequesterData(
      row.id,
      {
        formVersion: 1,
        expectedUpdatedAt: row.updatedAt,
        requesterData: { title: 'Changed' },
      },
      requester,
    );
    row = await fixture.service.updatePsfCreatedData(row.id, {
      actor: ownerA,
      expectedUpdatedAt: row.updatedAt,
      psfCreatedData: { file: 'data.psf' },
    });
    row = await fixture.service.updateRequestStatus(row.id, {
      actor: admin,
      expectedUpdatedAt: row.updatedAt,
      status: '20% -- PSF File Creating',
    });
    assert.equal(
      (row as unknown as { setupOwnerUserId: string }).setupOwnerUserId,
      ownerB.id,
    );
    assert.equal(row.setupOwnerRole, 'MFG');
    const index = await pool.query<{ setup_owner_user_id: string | null }>(
      'SELECT setup_owner_user_id FROM psf_request_search_index WHERE request_id=$1',
      [row.id],
    );
    assert.equal(index.rows[0].setup_owner_user_id, ownerB.id);
  });
  // Catches automatically refreshing historical snapshots during Submit or later shared edits.
  void it('profile changes do not rewrite assignment display snapshots at Submit or during shared edits', async () => {
    const draft = await fixture.draft(ownerA.id);
    await pool.query(
      "UPDATE app_users SET display_name='Renamed Owner',setup_owner_department='MFG' WHERE id=$1",
      [ownerA.id],
    );
    const submitted = await fixture.submit(draft);
    assert.equal(submitted.setupOwner, 'Same Name');
    assert.equal(submitted.setupOwnerRole, 'GNTC');
    await pool.query(
      "UPDATE app_users SET role='requester',setup_owner_department=NULL WHERE id=$1",
      [ownerA.id],
    );
    const edited = await fixture.service.updateDraftRequesterData(
      submitted.id,
      {
        formVersion: 1,
        expectedUpdatedAt: submitted.updatedAt,
        requesterData: { title: 'Shared edit' },
      },
      requester,
    );
    assert.equal(edited.setupOwnerUserId, ownerA.id);
    assert.equal(edited.setupOwner, 'Same Name');
    assert.equal(edited.setupOwnerRole, 'GNTC');
  });

  // Catches missing serialization/revision recheck after acquiring the request lock.
  void it('concurrent assignments with one revision produce one winner and one conflict', async () => {
    const row = await fixture.submit(await fixture.draft());
    const results = await Promise.allSettled(
      [ownerA, ownerB].map((owner) =>
        fixture.service.updateAssignment(
          row.id,
          { setupOwnerUserId: owner.id, expectedUpdatedAt: row.updatedAt },
          requester,
        ),
      ),
    );
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    const rejected = results.find((x) => x.status === 'rejected');
    assert.ok(rejected?.status === 'rejected');
    assert.equal((rejected.reason as { status: number }).status, 409);
    const history = await fixture.service.getRequestHistory(row.id, requester);
    assert.equal(
      history.filter((x) => x.actionType === 'REQUEST_ASSIGNEE_CHANGED').length,
      1,
    );
    const persisted = await pool.query<{
      same_timestamp: boolean;
      same_owner: boolean;
    }>(
      `SELECT request.updated_at = search.updated_at AS same_timestamp,
              request.setup_owner_user_id = search.setup_owner_user_id AS same_owner
       FROM psf_requests AS request JOIN psf_request_search_index AS search ON request.id=search.request_id
       WHERE request.id=$1`,
      [row.id],
    );
    assert.deepEqual(persisted.rows[0], {
      same_timestamp: true,
      same_owner: true,
    });
  });
  for (const target of ['psf_request_audit_logs', 'psf_request_search_index'])
    void it(`${target} failure rolls back owner, index, revision, and history`, async () => {
      const row = await fixture.submit(await fixture.draft(ownerA.id));
      const indexBefore = (
        await pool.query(
          'SELECT * FROM psf_request_search_index WHERE request_id=$1',
          [row.id],
        )
      ).rows;
      const historyBefore = await fixture.service.getRequestHistory(
        row.id,
        requester,
      );
      await pool.query(
        "CREATE OR REPLACE FUNCTION fail_assignment_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected assignment failure'; END $$",
      );
      await pool.query(
        `CREATE TRIGGER fail_assignment BEFORE INSERT OR UPDATE ON ${target} FOR EACH ROW EXECUTE FUNCTION fail_assignment_write()`,
      );
      try {
        await assert.rejects(
          fixture.service.updateAssignment(
            row.id,
            { setupOwnerUserId: ownerB.id, expectedUpdatedAt: row.updatedAt },
            requester,
          ),
          /injected assignment failure/,
        );
      } finally {
        await pool.query(`DROP TRIGGER fail_assignment ON ${target}`);
      }
      const after = await fixture.service.getRequest(row.id, requester);
      assert.equal(after.updatedAt, row.updatedAt);
      assert.equal(after.setupOwnerRole, 'GNTC');
      assert.deepEqual(
        (
          await pool.query(
            'SELECT * FROM psf_request_search_index WHERE request_id=$1',
            [row.id],
          )
        ).rows,
        indexBefore,
      );
      assert.deepEqual(
        await fixture.service.getRequestHistory(row.id, requester),
        historyBefore,
      );
    });
  // Catches profile validation outside the assignment transaction or a lock too weak for role updates.
  void it('profile eligibility locks coordinate with concurrent role updates', async () => {
    const row = await fixture.submit(await fixture.draft());
    const roleClient = await pool.connect();
    await roleClient.query('BEGIN');
    await roleClient.query('LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE');
    await roleClient.query(
      "UPDATE app_users SET role='requester',setup_owner_department=NULL WHERE id=$1",
      [ownerA.id],
    );
    const assignment = Promise.resolve().then(() =>
      fixture.service.updateAssignment(
        row.id,
        { setupOwnerUserId: ownerA.id, expectedUpdatedAt: row.updatedAt },
        requester,
      ),
    );
    const outcome = assignment.then(
      () => ({ status: 0 }),
      (error) => ({ status: (error as { status: number }).status }),
    );
    try {
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (Date.now() < deadline) {
        const waiting = await pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM pg_stat_activity
           WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'
             AND query LIKE '%FROM app_users WHERE id =%';`,
        );
        if (waiting.rows[0].count > 0) {
          blocked = true;
          break;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      assert.equal(
        blocked,
        true,
        'Assignment must wait for the concurrent profile change',
      );
      await roleClient.query('COMMIT');
      assert.equal((await outcome).status, 400);
    } finally {
      await roleClient.query('ROLLBACK');
      roleClient.release();
    }
    const after = await fixture.service.getRequest(row.id, requester);
    assert.equal(after.updatedAt, row.updatedAt);
    assert.equal(after.setupOwner, null);
    const auth = new AuthService(pool, new ConfigService({}));
    await auth.updateUser(ownerA.id, {
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    });
    const changed = await fixture.service.updateAssignment(
      row.id,
      { setupOwnerUserId: ownerA.id, expectedUpdatedAt: row.updatedAt },
      requester,
    );
    assert.equal(changed.setupOwnerUserId, ownerA.id);
  });
  // Catches an upgrade losing a known request UUID when only the old index lacks the column.
  void it('initialization restores known assignment UUIDs into an older search index', async () => {
    const row = await fixture.submit(await fixture.draft(ownerB.id));
    await pool.query(
      'ALTER TABLE psf_request_search_index DROP COLUMN setup_owner_user_id',
    );
    await fixture.service.onModuleInit();
    const related = await fixture.service.queryRequests(
      scope('assigned'),
      ownerB,
    );
    assert.equal(related.total, 1);
    assert.equal(related.items[0].requestId, row.id);
  });

  // Catches inferring UUIDs from legacy names or startup erasing valid UUIDs.
  void it('legacy upgrade and repeated initialization preserve snapshots without inferring assignees', async () => {
    const legacy = await fixture.submit(await fixture.draft());
    await pool.query(
      "UPDATE psf_requests SET setup_owner='Same Name',setup_owner_role='GNTC' WHERE id=$1",
      [legacy.id],
    );
    await pool.query(
      "UPDATE psf_request_search_index SET setup_owner='Same Name',setup_owner_role='GNTC' WHERE request_id=$1",
      [legacy.id],
    );
    await pool.query(
      'ALTER TABLE psf_requests DROP COLUMN setup_owner_user_id',
    );
    await pool.query(
      'ALTER TABLE psf_request_search_index DROP COLUMN setup_owner_user_id',
    );
    await fixture.service.onModuleInit();
    await fixture.service.onModuleInit();
    const row = await fixture.service.getRequest(legacy.id, requester);
    assert.equal(
      (row as unknown as { setupOwnerUserId: string | null }).setupOwnerUserId,
      null,
    );
    assert.equal(row.setupOwner, 'Same Name');
    assert.equal(row.setupOwnerRole, 'GNTC');
    const assigned = await fixture.service.updateAssignment(
      row.id,
      { setupOwnerUserId: ownerB.id, expectedUpdatedAt: row.updatedAt },
      requester,
    );
    await fixture.service.onModuleInit();
    assert.equal(
      (
        (await fixture.service.getRequest(row.id, requester)) as unknown as {
          setupOwnerUserId: string;
        }
      ).setupOwnerUserId,
      ownerB.id,
    );
    assert.equal(
      (await fixture.service.queryRequests(scope('assigned'), ownerB)).total,
      1,
    );
    assert.equal(assigned.setupOwnerRole, 'MFG');
  });
});

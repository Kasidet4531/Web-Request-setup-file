import { fork, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { Pool } from 'pg';
import {
  assignmentFixture,
  requester,
  ownerA,
  ownerB,
  admin,
} from '../../test/request-assignment.fixture';

describe('explicit request assignment', () => {
  let child: ChildProcess;
  let pool: Pool;
  let fixture: Awaited<ReturnType<typeof assignmentFixture>>;
  beforeAll(async () => {
    child = fork(
      join(__dirname, '../../test/request-assignment.cluster.mjs'),
      [],
      { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] },
    );
    const port = await new Promise<number>((resolve, reject) => {
      child.once('message', (message: { port: number }) =>
        resolve(message.port),
      );
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error('Fixture exited ' + code)));
    });
    pool = new Pool({
      host: '127.0.0.1',
      port,
      user: 'assignment_test',
      password: 'disposable-assignment',
      database: 'postgres',
    });
    fixture = await assignmentFixture(pool);
  }, 15000);
  beforeEach(async () => fixture.reset());
  afterAll(async () => {
    await pool?.end();
    if (child?.connected) {
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.send('stop');
      });
    }
  });
  // Catches directory overexposure or accepting users with invalid departments.
  it('directory exposes only eligible setup owner picker fields', async () => {
    await fixture.pool.query(
      "INSERT INTO app_users (id,username,display_name,role,setup_owner_department) VALUES ('00000000-0000-4000-8000-000000000105','invalid','Invalid department','setup_owner','Other')",
    );
    expect(await fixture.service.listAssignableSetupOwners()).toEqual({
      items: [
        {
          id: ownerA.id,
          displayName: 'Same Name',
          setupOwnerDepartment: 'GNTC',
        },
        {
          id: ownerB.id,
          displayName: 'Same Name',
          setupOwnerDepartment: 'MFG',
        },
      ],
    });
    await expect(
      fixture.draft('00000000-0000-4000-8000-000000000105'),
    ).rejects.toMatchObject({ status: 400 });
  });

  // Catches overwriting ownership on omission, incomplete clear, client snapshot spoofing, or non-atomic validation.
  it('Draft data saves preserve omitted assignment and atomically assign or clear from server profiles', async () => {
    const draft = await fixture.draft(ownerA.id);
    const omitted = await fixture.service.updateDraftRequesterData(
      draft.id,
      {
        formVersion: 1,
        requesterData: { title: 'Omitted' },
        expectedUpdatedAt: draft.updatedAt,
      },
      requester,
    );
    expect(omitted).toMatchObject({
      setupOwnerUserId: ownerA.id,
      setupOwnerRole: 'GNTC',
    });
    const payload = {
      formVersion: 1,
      requesterData: { title: 'Explicit' },
      expectedUpdatedAt: omitted.updatedAt,
      setupOwnerUserId: ownerB.id,
      setupOwner: 'Spoofed',
      setupOwnerRole: 'GNTC',
    };
    const assigned = await fixture.service.updateDraftRequesterData(
      draft.id,
      payload,
      requester,
    );
    expect(assigned).toMatchObject({
      setupOwnerUserId: ownerB.id,
      setupOwner: 'Same Name',
      setupOwnerRole: 'MFG',
    });
    await expect(
      fixture.service.updateDraftRequesterData(
        draft.id,
        {
          ...payload,
          requesterData: { title: 'Must roll back' },
          setupOwnerUserId: admin.id,
          expectedUpdatedAt: assigned.updatedAt,
        },
        requester,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await fixture.service.getRequest(draft.id, requester)).requesterData
        .title,
    ).toBe('Explicit');
    const cleared = await fixture.service.updateDraftRequesterData(
      draft.id,
      {
        ...payload,
        setupOwnerUserId: null,
        expectedUpdatedAt: assigned.updatedAt,
      },
      requester,
    );
    expect(cleared).toMatchObject({
      setupOwnerUserId: null,
      setupOwner: null,
      setupOwnerRole: null,
    });
    expect((await fixture.index.queryRequests()).total).toBe(0);
  });

  it.each([requester, ownerA, admin])(
    'every accessible role can assign shared work: $role',
    async (actor) => {
      const before = await fixture.submit(await fixture.draft());
      const changed = await fixture.service.updateAssignment(
        before.id,
        { setupOwnerUserId: ownerB.id, expectedUpdatedAt: before.updatedAt },
        actor,
      );
      expect(changed).toMatchObject({
        setupOwnerUserId: ownerB.id,
        status: before.status,
      });
    },
  );

  it('assignment requires an explicit value and rejects stale revisions even for a repeated selection', async () => {
    const before = await fixture.submit(await fixture.draft(ownerA.id));
    await expect(
      fixture.service.updateAssignment(
        before.id,
        { expectedUpdatedAt: before.updatedAt } as Parameters<
          typeof fixture.service.updateAssignment
        >[1],
        requester,
      ),
    ).rejects.toMatchObject({ status: 400 });
    const changed = await fixture.service.updateAssignment(
      before.id,
      { setupOwnerUserId: ownerB.id, expectedUpdatedAt: before.updatedAt },
      requester,
    );
    await expect(
      fixture.service.updateAssignment(
        before.id,
        { setupOwnerUserId: ownerB.id, expectedUpdatedAt: before.updatedAt },
        requester,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await fixture.service.getRequest(before.id, requester)).updatedAt,
    ).toBe(changed.updatedAt);
  });

  // Catches publishing a Draft just because it has an assignee or granting them access.
  it('draft_assignment_is_private_and_not_indexed', async () => {
    const draft = await fixture.draft(ownerA.id);
    expect(draft).toMatchObject({
      setupOwnerUserId: ownerA.id,
      setupOwner: 'Same Name',
      setupOwnerRole: 'GNTC',
    });
    await expect(
      fixture.service.getRequest(draft.id, ownerA),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      fixture.service.updateAssignment(
        draft.id,
        { setupOwnerUserId: ownerB.id, expectedUpdatedAt: draft.updatedAt },
        admin,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const reassigned = await fixture.service.updateAssignment(
      draft.id,
      { setupOwnerUserId: ownerB.id, expectedUpdatedAt: draft.updatedAt },
      requester,
    );
    expect(reassigned).toMatchObject({
      status: 'Draft',
      setupOwnerUserId: ownerB.id,
      setupOwnerRole: 'MFG',
    });
    expect(
      (await fixture.pool.query('SELECT * FROM psf_request_search_index'))
        .rowCount,
    ).toBe(0);
    expect((await fixture.index.queryRequests()).total).toBe(0);
  });
  // Catches role-gating assignment or modifying status/edit/release rights.
  it('requester_can_reassign_submitted_request', async () => {
    const before = await fixture.submit(await fixture.draft(ownerA.id));
    const changed = await fixture.service.updateAssignment(
      before.id,
      { setupOwnerUserId: ownerB.id, expectedUpdatedAt: before.updatedAt },
      requester,
    );
    expect(changed).toMatchObject({
      setupOwnerUserId: ownerB.id,
      setupOwner: 'Same Name',
      setupOwnerRole: 'MFG',
      status: before.status,
      canEditPsfCreatedData: false,
      psfReleasedAt: null,
    });
    expect(
      await fixture.service.getRequest(before.id, requester),
    ).toMatchObject({ setupOwnerUserId: ownerB.id });
    const history = await fixture.service.getRequestHistory(
      before.id,
      requester,
    );
    expect(history[history.length - 1]).toMatchObject({
      actionType: 'REQUEST_ASSIGNEE_CHANGED',
      metadata: {
        before: {
          setupOwnerUserId: ownerA.id,
          setupOwner: 'Same Name',
          setupOwnerRole: 'GNTC',
        },
        after: {
          setupOwnerUserId: ownerB.id,
          setupOwner: 'Same Name',
          setupOwnerRole: 'MFG',
        },
      },
    });
  });
  // Catches timestamp/history churn on repeated selection.
  it('same_assignment_is_noop', async () => {
    const before = await fixture.submit(await fixture.draft(ownerA.id));
    const indexBefore = (
      await fixture.pool.query(
        'SELECT * FROM psf_request_search_index WHERE request_id=$1',
        [before.id],
      )
    ).rows;
    const history = await fixture.service.getRequestHistory(
      before.id,
      requester,
    );
    const after = await fixture.service.updateAssignment(
      before.id,
      { setupOwnerUserId: ownerA.id, expectedUpdatedAt: before.updatedAt },
      requester,
    );
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(
      await fixture.service.getRequestHistory(before.id, requester),
    ).toEqual(history);
    expect(
      (
        await fixture.pool.query(
          'SELECT * FROM psf_request_search_index WHERE request_id=$1',
          [before.id],
        )
      ).rows,
    ).toEqual(indexBefore);
  });
  // Catches turning a same-person selection into a historical snapshot refresh.
  it.each(['Draft', 'Submitted'])(
    'same UUID preserves snapshots, revision, index and history after profile changes: %s',
    async (status) => {
      const draft = await fixture.draft(ownerA.id);
      const before = status === 'Draft' ? draft : await fixture.submit(draft);
      const history = await fixture.service.getRequestHistory(
        before.id,
        requester,
      );
      const index = (
        await fixture.pool.query(
          'SELECT * FROM psf_request_search_index WHERE request_id=$1',
          [before.id],
        )
      ).rows;
      await fixture.pool.query(
        "UPDATE app_users SET display_name='Renamed Owner',setup_owner_department='MFG' WHERE id=$1",
        [ownerA.id],
      );
      const after = await fixture.service.updateAssignment(
        before.id,
        { setupOwnerUserId: ownerA.id, expectedUpdatedAt: before.updatedAt },
        requester,
      );
      expect(after).toMatchObject({
        setupOwnerUserId: ownerA.id,
        setupOwner: 'Same Name',
        setupOwnerRole: 'GNTC',
        updatedAt: before.updatedAt,
      });
      expect(await fixture.service.getRequest(before.id, requester)).toEqual(
        before,
      );
      expect(
        await fixture.service.getRequestHistory(before.id, requester),
      ).toEqual(history);
      expect(
        (
          await fixture.pool.query(
            'SELECT * FROM psf_request_search_index WHERE request_id=$1',
            [before.id],
          )
        ).rows,
      ).toEqual(index);
    },
  );

  it('Draft data saves with the same UUID preserve historical ownership snapshots', async () => {
    const before = await fixture.draft(ownerA.id);
    await fixture.pool.query(
      "UPDATE app_users SET display_name='Renamed Owner',setup_owner_department='MFG' WHERE id=$1",
      [ownerA.id],
    );
    const after = await fixture.service.updateDraftRequesterData(
      before.id,
      {
        formVersion: 1,
        setupOwnerUserId: ownerA.id,
        expectedUpdatedAt: before.updatedAt,
        requesterData: { title: 'Updated title' },
      },
      requester,
    );
    expect(after).toMatchObject({
      setupOwnerUserId: ownerA.id,
      setupOwner: 'Same Name',
      setupOwnerRole: 'GNTC',
      requesterData: { title: 'Updated title' },
    });
    expect(
      (await fixture.service.getRequestHistory(before.id, requester)).filter(
        (entry) => entry.actionType === 'REQUEST_ASSIGNEE_CHANGED',
      ),
    ).toEqual([]);
  });

  it('explicit null clears legacy name and department even when the owner UUID is already null', async () => {
    const submitted = await fixture.submit(await fixture.draft());
    await fixture.pool.query(
      "UPDATE psf_requests SET setup_owner='Legacy owner',setup_owner_role='GNTC' WHERE id=$1",
      [submitted.id],
    );
    await fixture.pool.query(
      "UPDATE psf_request_search_index SET setup_owner='Legacy owner',setup_owner_role='GNTC' WHERE request_id=$1",
      [submitted.id],
    );
    const before = await fixture.service.getRequest(submitted.id, requester);
    const after = await fixture.service.updateAssignment(
      before.id,
      { setupOwnerUserId: null, expectedUpdatedAt: before.updatedAt },
      requester,
    );
    expect(after).toMatchObject({
      setupOwnerUserId: null,
      setupOwner: null,
      setupOwnerRole: null,
    });
    expect(after.updatedAt).not.toBe(before.updatedAt);
    const history = await fixture.service.getRequestHistory(
      before.id,
      requester,
    );
    expect(
      history.filter(
        (entry) => entry.actionType === 'REQUEST_ASSIGNEE_CHANGED',
      ),
    ).toEqual([
      expect.objectContaining({
        metadata: {
          before: {
            setupOwnerUserId: null,
            setupOwner: 'Legacy owner',
            setupOwnerRole: 'GNTC',
          },
          after: {
            setupOwnerUserId: null,
            setupOwner: null,
            setupOwnerRole: null,
          },
        },
      }),
    ]);
    const index = (
      await fixture.pool.query(
        'SELECT * FROM psf_request_search_index WHERE request_id=$1',
        [before.id],
      )
    ).rows;
    expect(index[0]).toMatchObject({
      setup_owner_user_id: null,
      setup_owner: null,
      setup_owner_role: null,
    });
    const repeated = await fixture.service.updateAssignment(
      before.id,
      { setupOwnerUserId: null, expectedUpdatedAt: after.updatedAt },
      requester,
    );
    expect(repeated).toEqual(after);
    expect(
      await fixture.service.getRequestHistory(before.id, requester),
    ).toEqual(history);
    expect(
      (
        await fixture.pool.query(
          'SELECT * FROM psf_request_search_index WHERE request_id=$1',
          [before.id],
        )
      ).rows,
    ).toEqual(index);
  });

  // Catches trusting UUID strings or any user instead of stored eligible profiles.
  it.each([
    'bad-uuid',
    requester.id,
    admin.id,
    '00000000-0000-4000-8000-000000009999',
  ])('invalid_assignee_is_rejected: %s', async (id) => {
    await expect(fixture.draft(id)).rejects.toMatchObject({ status: 400 });
    expect(
      (await fixture.pool.query('SELECT * FROM psf_requests')).rowCount,
    ).toBe(0);
  });
  // Catches the removed implicit ownership capture on PSF saves.
  it('psf_save_does_not_claim_owner', async () => {
    const draft = await fixture.draft();
    const submitted = await fixture.submit(draft);
    const changed = await fixture.service.updatePsfCreatedData(submitted.id, {
      actor: ownerA,
      expectedUpdatedAt: submitted.updatedAt,
      psfCreatedData: { file: 'test.psf' },
    });
    expect(changed).toMatchObject({
      setupOwnerUserId: null,
      setupOwner: null,
      setupOwnerRole: null,
    });
  });
  // Catches erroneously enqueuing transition mail on assignment.
  it('assignment_does_not_enqueue_mail', async () => {
    const before = await fixture.submit(await fixture.draft());
    const count = fixture.mailCount();
    await fixture.service.updateAssignment(
      before.id,
      { setupOwnerUserId: ownerA.id, expectedUpdatedAt: before.updatedAt },
      requester,
    );
    expect(fixture.mailCount()).toBe(count);
  });
});

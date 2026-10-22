import { PGlite } from '@electric-sql/pglite';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { AuditLogService } from '../src/audit/audit_log.service';
import type { AuthenticatedUserProfile } from '../src/auth/session.types';

void describe('Global audit visibility with an in-memory PostgreSQL engine', () => {
  let database: PGlite;
  let service: AuditLogService;
  const ownerId = '00000000-0000-4000-8000-000000000001';
  const otherId = '00000000-0000-4000-8000-000000000002';
  const privateId = '00000000-0000-4000-8000-000000000003';
  const submittedId = '00000000-0000-4000-8000-000000000004';

  before(async () => {
    database = new PGlite();
    await database.exec(`
      CREATE TABLE psf_requests (id uuid PRIMARY KEY, request_no text, status text, requester_user_id uuid, psf_released_at timestamptz, numeric_id int, requester_data_json jsonb);
      CREATE TABLE psf_request_audit_logs (id uuid PRIMARY KEY, request_id uuid, action_type text, actor_username text, actor_display_name text, actor_role text, created_at timestamptz, metadata_json jsonb, request_snapshot_json jsonb);
      INSERT INTO psf_requests VALUES ('${privateId}', 'PRIVATE-DRAFT', 'Draft', '${ownerId}', NULL), ('${submittedId}', 'PSF-PUBLIC', '20% -- PSF File Creating', '${ownerId}', NULL);
      INSERT INTO psf_request_audit_logs VALUES
        ('00000000-0000-4000-8000-000000000010', '${privateId}', 'DRAFT_CREATED', 'company.editor', 'Editor', 'requester', '2026-10-04T00:00:00Z', '{}', NULL),
        ('00000000-0000-4000-8000-000000000011', '${submittedId}', 'REQUESTER_INFORMATION_UPDATED', 'company.editor', 'Editor', 'requester', '2026-10-04T01:00:00Z', '{"fieldChanges":[{"before":"old public","after":"new public"}]}', '{"status":"20% -- PSF File Creating"}'),
        ('00000000-0000-4000-8000-000000000012', '${submittedId}', 'PSF_CREATED_INFORMATION_UPDATED', 'company.editor', 'Editor', 'setup_owner', '2026-10-04T02:00:00Z', '{"fieldChanges":[{"before":"old-secret.psf","after":"new-secret.psf"}]}', NULL),
        ('00000000-0000-4000-8000-000000000013', NULL, 'WORKFLOW_CATALOG_UPDATED', 'company.admin', 'Admin', 'admin', '2026-10-04T03:00:00Z', '{"action":"rename","name":"exact catalog name"}', NULL);
    `);
    service = new AuditLogService({
      query: (sql: string, values?: unknown[]) => database.query(sql, values),
    } as unknown as Pool);
  });

  after(async () => {
    await database.close();
  });

  function actor(
    role: AuthenticatedUserProfile['role'],
    id = otherId,
  ): AuthenticatedUserProfile {
    return {
      id,
      role,
      username: 'viewer',
      displayName: 'Viewer',
      setupOwnerDepartment: role === 'setup_owner' ? 'GNTC' : null,
    };
  }

  void it('searches visible history by request number, product description, display name or username with consistent totals', async () => {
    await database.query(
      `UPDATE psf_requests SET requester_data_json = '{"title":"Silicon Search Example"}' WHERE id = $1`,
      [submittedId],
    );
    for (const keyword of [
      'psf-public',
      'silicon search',
      'EDITOR',
      'company.editor',
    ]) {
      const filters = { keyword, requestId: submittedId };
      const viewer = actor('requester');
      const result = await service.findGlobalAuditLogs(filters, viewer, {
        limit: 1,
        offset: 0,
      });
      assert.equal(result.length, 1, keyword);
      assert.equal(result[0].requestId, submittedId);
      assert.equal(await service.countGlobalAuditLogs(filters, viewer), 1);
    }
    const filters = { keyword: 'does-not-exist', requestId: submittedId };
    assert.deepEqual(
      await service.findGlobalAuditLogs(filters, actor('admin')),
      [],
    );
    assert.equal(
      await service.countGlobalAuditLogs(filters, actor('admin')),
      0,
    );
  });

  for (const role of ['requester', 'setup_owner', 'admin'] as const)
    void it(`keeps another creator’s Draft private from ${role} while sharing catalog activity`, async () => {
      const result = await service.findGlobalAuditLogs({}, actor(role));
      assert.equal(
        result.some((entry) => entry.requestId === privateId),
        false,
      );
      assert.equal(
        result.some((entry) => entry.actionType === 'WORKFLOW_CATALOG_UPDATED'),
        true,
      );
    });

  void it('returns own Draft but suppresses unreleased PSF events, including an explicit PSF action filter', async () => {
    const viewer = actor('requester', ownerId);
    const result = await service.findGlobalAuditLogs(
      { from: '2026-10-04', to: '2026-10-04' },
      viewer,
    );
    assert.equal(
      result.some((entry) => entry.requestId === privateId),
      true,
    );
    assert.equal(
      result.some(
        (entry) => entry.actionType === 'REQUESTER_INFORMATION_UPDATED',
      ),
      true,
    );
    assert.equal(JSON.stringify(result).includes('secret.psf'), false);
    assert.deepEqual(
      await service.findGlobalAuditLogs(
        {
          actionType: 'PSF_CREATED_INFORMATION_UPDATED',
          requestId: submittedId,
        },
        viewer,
      ),
      [],
    );
  });

  void it('tells which entries can be opened as a Request Snapshot', async () => {
    const result = await service.findGlobalAuditLogs({}, actor('admin'));
    assert.deepEqual(
      result.map((entry) => [entry.id.slice(-2), entry.hasRequestSnapshot]),
      [
        ['13', false],
        ['12', false],
        ['11', true],
      ],
    );
  });

  for (const role of ['setup_owner', 'admin'] as const)
    void it(`allows ${role} to read unreleased PSF event values`, async () => {
      const result = await service.findGlobalAuditLogs(
        { actionType: 'PSF_CREATED_INFORMATION_UPDATED' },
        actor(role),
      );
      assert.equal(result.length, 1);
      assert.equal(JSON.stringify(result).includes('new-secret.psf'), true);
    });

  void it('allows Requester PSF history after persistent release while applying user and date filters', async () => {
    await database.query(
      'UPDATE psf_requests SET psf_released_at = $1 WHERE id = $2',
      ['2026-10-04T04:00:00Z', submittedId],
    );
    const result = await service.findGlobalAuditLogs(
      {
        user: 'editor',
        from: '2026-10-04',
        to: '2026-10-04',
        actionType: 'PSF_CREATED_INFORMATION_UPDATED',
      },
      actor('requester'),
    );
    assert.equal(result.length, 1);
    assert.equal(JSON.stringify(result).includes('new-secret.psf'), true);
    assert.deepEqual(
      await service.findGlobalAuditLogs(
        { from: '2026-10-05' },
        actor('requester'),
      ),
      [],
    );
  });

  void it('includes the whole selected Bangkok day and excludes both adjacent days', async () => {
    const times = [
      '2026-10-21T16:59:59.999Z',
      '2026-10-21T17:00:00Z',
      '2026-10-22T16:59:59.999Z',
      '2026-10-22T17:00:00Z',
    ];
    for (const [index, time] of times.entries()) {
      await database.query(
        `INSERT INTO psf_request_audit_logs (id, action_type, actor_username, actor_display_name, actor_role, created_at, metadata_json)
         VALUES ($1, 'WORKFLOW_CATALOG_UPDATED', 'calendar-boundary', 'Calendar', 'admin', $2, '{}')`,
        [`00000000-0000-4000-8000-00000000002${index}`, time],
      );
    }
    const filters = {
      keyword: 'calendar-boundary',
      from: '2026-10-22',
      to: '2026-10-22',
    };
    const rows = await service.findGlobalAuditLogs(filters, actor('admin'));
    assert.deepEqual(
      rows.map((row) => row.id.slice(-2)),
      ['22', '21'],
    );
    assert.equal(
      await service.countGlobalAuditLogs(filters, actor('admin')),
      2,
    );
    await assert.rejects(
      service.findGlobalAuditLogs(
        { from: '2026-10-23', to: '2026-10-22' },
        actor('admin'),
      ),
      { status: 400 },
    );
  });
});

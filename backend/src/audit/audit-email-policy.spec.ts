import { Pool } from 'pg';
import { AuditLogService, REQUEST_AUDIT_ACTION } from './audit_log.service';
import type { AuthenticatedUserProfile } from '../auth/session.types';

describe('status recipient privacy in shared audit history', () => {
  const metadata = {
    operation: {
      action: 'email-policy',
      id: 'status-b',
      emailPolicy: {
        enabled: true,
        to: ['private-team@nxp.com'],
        cc: ['private-copy@nxp.com'],
      },
    },
    before: {
      entries: [
        {
          id: 'status-b',
          name: 'B',
          kind: 'open',
          emailPolicy: { enabled: true, to: ['old-private@nxp.com'], cc: [] },
        },
      ],
      psfVisibilityTriggerId: null,
    },
    after: {
      entries: [
        {
          id: 'status-b',
          name: 'B',
          kind: 'open',
          emailPolicy: {
            enabled: true,
            to: ['private-team@nxp.com'],
            cc: ['private-copy@nxp.com'],
          },
        },
      ],
      psfVisibilityTriggerId: null,
    },
    affectedRequestCount: 0,
  };
  function setup(role: AuthenticatedUserProfile['role']) {
    const service = new AuditLogService({
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            request_id: null,
            request_no: null,
            action_type: REQUEST_AUDIT_ACTION.WORKFLOW_CATALOG_UPDATED,
            actor_display_name: 'Admin',
            actor_role: 'admin',
            created_at: '2026-10-05T00:00:00Z',
            metadata_json: metadata,
          },
        ],
      }),
    } as unknown as Pool);
    const actor: AuthenticatedUserProfile = {
      id: '00000000-0000-4000-8000-000000000001',
      username: 'viewer',
      displayName: 'Viewer',
      role,
      setupOwnerDepartment: role === 'setup_owner' ? 'GNTC' : null,
    };
    return { service, actor };
  }
  for (const role of ['requester', 'setup_owner'] as const) {
    it(`hides current and historical recipient policies from ${role} while retaining catalog history`, async () => {
      const { service, actor } = setup(role);
      const [entry] = await service.findGlobalAuditLogs(
        { actionType: REQUEST_AUDIT_ACTION.WORKFLOW_CATALOG_UPDATED },
        actor,
      );
      expect(JSON.stringify(entry.metadata)).not.toContain('@nxp.com');
      expect(entry.metadata).toMatchObject({
        operation: { action: 'email-policy', id: 'status-b' },
        before: { entries: [{ id: 'status-b', name: 'B', kind: 'open' }] },
        affectedRequestCount: 0,
      });
      expect(JSON.stringify(metadata)).toContain('private-team@nxp.com');
    });
  }
  it('retains complete before/after recipient audit for admins', async () => {
    const { service, actor } = setup('admin');
    const [entry] = await service.findGlobalAuditLogs({}, actor);
    expect(entry.metadata).toEqual(metadata);
  });
});

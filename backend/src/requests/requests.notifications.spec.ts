import { ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
import { AuditLogService } from '../audit/audit_log.service';
import { FormSchemaService } from '../admin/form_schema.service';
import { WorkflowTransitionService } from '../admin/workflow_transition.service';
import { RequestsService } from './requests.service';
import { SearchIndexService } from './search-index.service';

describe('request notification transaction integration', () => {
  const revision = '2026-10-05T01:00:00.000001Z';
  const actor = {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'requester',
    displayName: 'Requester',
    role: 'requester' as const,
    setupOwnerDepartment: null,
  };
  const schema = {
    formKey: 'psf-request',
    version: 1,
    title: 'Request',
    sections: [],
  };
  const target = {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Next',
    kind: 'open' as const,
    requestCount: 0,
    emailPolicy: { enabled: true, to: ['next@nxp.com'], cc: ['group@nxp.com'] },
  };

  function setup(status = 'Open') {
    const operations: string[] = [];
    const row = {
      id: '00000000-0000-4000-8000-000000000010',
      request_no: 'PSF-2026-0010',
      form_key: 'psf-request',
      form_version: 1,
      status,
      requester: 'Requester',
      requester_user_id: actor.id,
      setup_owner: null,
      setup_owner_role: null,
      product_type: null,
      requester_data_json: {},
      psf_created_data_json: { secret: 'DO-NOT-EMAIL' },
      schema_snapshot_json: schema,
      psf_created_schema_snapshot_json: null,
      created_at: revision,
      updated_at: revision,
      updated_at_version: revision,
      submitted_at: status === 'Draft' ? null : revision,
      psf_created_at: null,
      psf_released_at: null,
      completed_at: null,
    };
    const query = jest.fn((sql: string, values?: unknown[]) => {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      operations.push(normalized);
      if (normalized.startsWith('SELECT *')) return { rows: [row] };
      if (normalized.startsWith('UPDATE psf_requests'))
        return { rows: [{ ...row, status: values?.[1] }] };
      return { rows: [], rowCount: 0 };
    });
    const client = { query, release: jest.fn() };
    const pool = { connect: jest.fn().mockResolvedValue(client) };
    const config = {
      entries: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Open',
          kind: 'open',
          requestCount: 0,
          emailPolicy: { enabled: true, to: ['old@nxp.com'], cc: [] },
        },
        target,
      ],
      psfVisibilityTriggerId: null,
      updatedAt: revision,
    };
    const form = {
      getActiveSchemaForUpdate: jest.fn().mockResolvedValue({
        version: 1,
        schema,
      }),
    };
    const workflow = { lockConfiguration: jest.fn().mockResolvedValue(config) };
    const search = {
      upsertRequestSearchIndex: jest.fn().mockResolvedValue(undefined),
      extractCanonicalValues: jest.fn().mockReturnValue({}),
      upsertSubmittedCanonicalValues: jest.fn().mockResolvedValue({}),
    };
    const audit = {
      record: jest.fn(() => {
        operations.push('AUDIT');
      }),
    };
    const notification = {
      enqueueRequest: jest.fn(() => {
        operations.push('ENQUEUE');
        return Promise.resolve();
      }),
    };
    const service = new RequestsService(
      pool as unknown as Pool,
      form as unknown as FormSchemaService,
      workflow as unknown as WorkflowTransitionService,
      search as unknown as SearchIndexService,
      audit as unknown as AuditLogService,
    );
    // Supply the external boundary while keeping legacy constructor tests valid.
    Object.assign(service, { notificationService: notification });
    return { service, notification, client, config, operations, row };
  }

  it('enqueues with the locked destination policy after audit and before commit', async () => {
    const { service, notification, client, operations } = setup();
    await service.updateRequestStatus('00000000-0000-4000-8000-000000000010', {
      status: 'Next',
      expectedUpdatedAt: revision,
      actor,
    });
    expect(notification.enqueueRequest).toHaveBeenCalledWith(client, {
      eventType: 'REQUEST_STATUS_CHANGED',
      requestId: '00000000-0000-4000-8000-000000000010',
      fromStatus: 'Open',
      targetStatus: target,
      actor,
    });
    expect(operations.indexOf('AUDIT')).toBeLessThan(
      operations.indexOf('ENQUEUE'),
    );
    expect(operations.indexOf('ENQUEUE')).toBeLessThan(
      operations.indexOf('COMMIT'),
    );
  });

  it('submits using the selected status policy with one submission notification', async () => {
    const { service, notification, client } = setup('Draft');
    await service.submitRequest(
      '00000000-0000-4000-8000-000000000010',
      {
        status: 'Next',
        formVersion: 1,
        expectedUpdatedAt: revision,
      },
      actor,
    );
    expect(notification.enqueueRequest).toHaveBeenCalledTimes(1);
    expect(notification.enqueueRequest).toHaveBeenCalledWith(client, {
      eventType: 'REQUEST_SUBMITTED',
      requestId: '00000000-0000-4000-8000-000000000010',
      fromStatus: 'Draft',
      targetStatus: target,
      actor,
    });
  });

  it('does not notify a no-op update', async () => {
    const { service, notification } = setup('Next');
    await service.updateRequestStatus('00000000-0000-4000-8000-000000000010', {
      status: 'Next',
      expectedUpdatedAt: revision,
      actor,
    });
    expect(notification.enqueueRequest).not.toHaveBeenCalled();
  });

  it('does not enqueue when optimistic revision validation rejects the transition', async () => {
    const { service, notification, operations } = setup();
    await expect(
      service.updateRequestStatus('00000000-0000-4000-8000-000000000010', {
        status: 'Next',
        expectedUpdatedAt: '2026-10-05T02:00:00.000001Z',
        actor,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(notification.enqueueRequest).not.toHaveBeenCalled();
    expect(operations).toContain('ROLLBACK');
    expect(operations).not.toContain('COMMIT');
  });
});

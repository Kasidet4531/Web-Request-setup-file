import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { AuditLogService } from '../audit/audit_log.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationStorage } from '../notifications/notification.storage';
import { MailConfig } from '../notifications/mail.config';
import { WorkflowTransitionService } from './workflow_transition.service';

const matching = (value: unknown): unknown => expect.objectContaining(value);
const containing = (value: unknown[]): unknown => expect.arrayContaining(value);

const REVISION = '2026-10-01T01:02:03.123456Z';
const DRAFT = '00000000-0000-4000-8000-000000000001';
const WORK = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const OFF = { enabled: false, to: [], cc: [] };
const ON = {
  enabled: true,
  to: ['group@example.com', 'person@example.com'],
  cc: ['copy@example.com'],
};
const ACTOR = {
  id: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
  username: 'admin',
  displayName: 'Admin',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};

describe('workflow destination email policies', () => {
  let stored: Record<string, unknown>;
  let query: jest.Mock;
  let audit: { record: jest.Mock };
  let client: { query: jest.Mock; release: jest.Mock };
  let connect: jest.Mock;
  let service: WorkflowTransitionService;
  beforeEach(() => {
    stored = {
      entries: [
        { id: DRAFT, name: 'Draft', kind: 'draft' },
        { id: WORK, name: 'Work', kind: 'open' },
        { id: OTHER, name: 'Other', kind: 'completed' },
      ],
      psfVisibilityTriggerId: null,
    };
    query = jest.fn((sql: string, values: unknown[] = []) => {
      if (sql.includes('SELECT config_json'))
        return {
          rows: [{ config_json: stored, updated_at_version: REVISION }],
        };
      if (sql.includes('UPDATE workflow_transition_config'))
        stored = values[1] as Record<string, unknown>;
      return { rows: [], rowCount: 1 };
    });
    client = { query, release: jest.fn() };
    connect = jest.fn().mockResolvedValue(client);
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new WorkflowTransitionService(
      { query, connect } as unknown as Pool,
      audit as unknown as AuditLogService,
    );
  });
  const operation = (
    emailPolicy: unknown,
    id = WORK,
    expectedUpdatedAt = REVISION,
  ) => ({ action: 'email-policy', id, emailPolicy, expectedUpdatedAt });

  it('defaults legacy and newly created entries to disabled', async () => {
    for (const entry of (await service.getConfiguration()).entries)
      expect(entry).toHaveProperty('emailPolicy', OFF);
    const result = await service.applyOperation(
      {
        action: 'create',
        name: 'New',
        kind: 'open',
        expectedUpdatedAt: REVISION,
      },
      ACTOR,
    );
    expect(result.entries.at(-1)).toHaveProperty('emailPolicy', OFF);
  });

  it('normalizes mixed manual and user addresses and deduplicates To against CC', async () => {
    const result = await service.applyOperation(
      operation({
        enabled: true,
        to: [
          ' GROUP@Example.com ',
          '',
          'person@example.com',
          'group@example.com',
        ],
        cc: [
          ' PERSON@example.com ',
          'copy@example.com',
          'COPY@example.com',
          '  ',
        ],
      }),
      ACTOR,
    );
    expect(result.entries[1]).toHaveProperty('emailPolicy', ON);
    expect(stored).toMatchObject({
      entries: containing([matching({ id: WORK, emailPolicy: ON })]),
    });
  });

  it.each([
    { enabled: true, to: [], cc: [] },
    { enabled: true, to: [' '], cc: [] },
    { enabled: true, to: ['invalid'], cc: [] },
    { enabled: true, to: ['a@' + 'b'.repeat(64) + '.com'], cc: [] },
    { enabled: false, to: ['invalid'], cc: [] },
    {
      enabled: true,
      to: ['group@example.com'],
      cc: ['bad address@example.com'],
    },
    {
      enabled: true,
      to: ['group@example.com\r\nBcc: hidden@example.com'],
      cc: [],
    },
    { enabled: 'true', to: ['group@example.com'], cc: [] },
    { enabled: false, to: 'group@example.com', cc: [] },
    { enabled: false, to: [12], cc: [] },
    { enabled: false, to: [], cc: [], extra: true },
  ])('rejects malformed policy %p before storage', async (policy) => {
    await expect(
      service.applyOperation(operation(policy), ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(connect).not.toHaveBeenCalled();
  });

  it('prevents enabling Draft and accepts a disabled Draft policy', async () => {
    await expect(
      service.applyOperation(operation(ON, DRAFT), ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
    const result = await service.applyOperation(operation(OFF, DRAFT), ACTOR);
    expect(result.entries[0]).toHaveProperty('emailPolicy', OFF);
  });

  it('retains disabled recipients across rename, settings, create and delete', async () => {
    const policy = { ...ON, enabled: false };
    await service.applyOperation(operation(policy), ACTOR);
    for (const change of [
      { action: 'rename', id: WORK, name: 'Renamed work' },
      { action: 'settings', psfVisibilityTriggerId: WORK },
      { action: 'create', name: 'New', kind: 'open' },
      { action: 'delete', id: OTHER },
    ]) {
      const result = await service.applyOperation(
        { ...change, expectedUpdatedAt: REVISION },
        ACTOR,
      );
      expect(result.entries.find((entry) => entry.id === WORK)).toHaveProperty(
        'emailPolicy',
        policy,
      );
    }
  });

  it('audits old and new policy in its transaction and omits recipients publicly', async () => {
    await service.applyOperation(operation(ON), ACTOR);
    expect(audit.record).toHaveBeenCalledWith(
      matching({
        actor: ACTOR,
        metadata: matching({
          operation: { action: 'email-policy', id: WORK, emailPolicy: ON },
          before: matching({
            entries: containing([matching({ id: WORK, emailPolicy: OFF })]),
          }),
          after: matching({
            entries: containing([matching({ id: WORK, emailPolicy: ON })]),
          }),
        }),
      }),
      client,
    );
    for (const entry of (await service.getPublicConfiguration()).entries) {
      expect(entry).not.toHaveProperty('emailPolicy');
      expect(entry).not.toHaveProperty('requestCount');
    }
    expect(
      (await service.lockConfiguration(client as never)).entries[1],
    ).toHaveProperty('emailPolicy', ON);
  });

  it('rejects stale policy revision without overwriting recipients', async () => {
    await expect(
      service.applyOperation(
        operation(ON, WORK, '2026-10-01T01:02:03.123455Z'),
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await service.getConfiguration()).entries[1]).toHaveProperty(
      'emailPolicy',
      OFF,
    );
    expect(audit.record).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'enqueues every bulk replacement after its request audit using destination enabled=%p',
    async (enabled) => {
      const policy = { ...ON, enabled };
      await service.applyOperation(operation(policy, OTHER), ACTOR);
      audit.record.mockClear();
      const rows = [
        {
          id: 'c4e87bd1-f7de-4d6d-8097-bf914cd13acd',
          request_no: 'PSF-0001',
          status: 'Work',
          psf_created_data_json: {},
          psf_created_schema_snapshot_json: null,
        },
        {
          id: 'c4e87bd1-f7de-4d6d-8097-bf914cd13ace',
          request_no: 'PSF-0002',
          status: 'Work',
          psf_created_data_json: {},
          psf_created_schema_snapshot_json: null,
        },
      ];
      const execute = query.getMockImplementation() as (
        sql: string,
        values?: unknown[],
      ) => unknown;
      query.mockImplementation((sql: string, values: unknown[]) => {
        if (sql.includes('FROM psf_requests') && sql.includes('FOR UPDATE'))
          return { rows };
        if (sql.includes('UPDATE psf_requests') && sql.includes('RETURNING'))
          return { rows: rows.map((row) => ({ ...row, status: 'Other' })) };
        return execute(sql, values);
      });
      const notificationService = {
        enqueueRequest: jest.fn(
          (_client: unknown, event: { requestId: string }) => {
            expect(audit.record).toHaveBeenLastCalledWith(
              matching({ requestId: event.requestId }),
              client,
            );
            expect(query).not.toHaveBeenCalledWith('COMMIT');
            return Promise.resolve();
          },
        ),
      };
      query.mockClear();
      Object.defineProperty(service, 'notificationService', {
        value: notificationService,
      });
      await service.applyOperation(
        {
          action: 'delete',
          id: WORK,
          replacementId: OTHER,
          expectedUpdatedAt: REVISION,
        },
        ACTOR,
      );
      expect(notificationService.enqueueRequest).toHaveBeenCalledTimes(2);
      for (const row of rows)
        expect(notificationService.enqueueRequest).toHaveBeenCalledWith(
          client,
          {
            eventType: 'REQUEST_STATUS_CHANGED',
            requestId: row.id,
            fromStatus: 'Work',
            targetStatus: {
              id: OTHER,
              name: 'Other',
              kind: 'completed',
              emailPolicy: policy,
            },
            actor: ACTOR,
            bulkReplacement: true,
          },
        );
      expect(query).toHaveBeenLastCalledWith('COMMIT');
    },
  );

  it('does not enqueue for an unused deleted status or a rename', async () => {
    const notificationService = { enqueueRequest: jest.fn() };
    Object.defineProperty(service, 'notificationService', {
      value: notificationService,
    });
    await service.applyOperation(
      {
        action: 'rename',
        id: WORK,
        name: 'Renamed',
        expectedUpdatedAt: REVISION,
      },
      ACTOR,
    );
    await service.applyOperation(
      {
        action: 'delete',
        id: WORK,
        replacementId: OTHER,
        expectedUpdatedAt: REVISION,
      },
      ACTOR,
    );
    expect(notificationService.enqueueRequest).not.toHaveBeenCalled();
  });
  it.each([
    { enabled: false, code: undefined },
    { enabled: true, code: '23514' },
    { enabled: true, code: '08006' },
  ])(
    'keeps bulk writes valid across notification suppression/recovery %p',
    async ({ enabled, code }) => {
      const errorLog = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      await service.applyOperation(operation({ ...ON, enabled }, OTHER), ACTOR);
      const execute = query.getMockImplementation() as (
        sql: string,
        values?: unknown[],
      ) => unknown;
      const row = {
        id: 'c4e87bd1-f7de-4d6d-8097-bf914cd13acd',
        request_no: 'PSF-0001',
        status: 'Work',
        psf_created_data_json: {},
        psf_created_schema_snapshot_json: null,
      };
      query.mockImplementation((sql: string, values: unknown[]) => {
        if (sql.includes('FROM psf_requests') && sql.includes('FOR UPDATE'))
          return { rows: [row] };
        if (sql.includes('UPDATE psf_requests') && sql.includes('RETURNING'))
          return { rows: [{ ...row, status: 'Other' }] };
        if (sql.includes('SELECT request_no'))
          return {
            rows: [
              {
                request_no: 'PSF-0001',
                requester: 'Requester',
                product_type: 'IC',
                requester_data_json: { description: 'Safe' },
              },
            ],
          };
        if (sql.includes('INSERT INTO email_outbox'))
          throw Object.assign(new Error('notification insert failed'), {
            code,
          });
        return execute(sql, values);
      });
      const notificationService = new NotificationService(
        new NotificationStorage({ query } as never),
        new MailConfig({ APP_BASE_URL: 'http://localhost:3000' }),
      );
      service = new WorkflowTransitionService(
        { query, connect } as unknown as Pool,
        audit as unknown as AuditLogService,
        notificationService,
      );
      query.mockClear();
      const result = service.applyOperation(
        {
          action: 'delete',
          id: WORK,
          replacementId: OTHER,
          expectedUpdatedAt: REVISION,
        },
        ACTOR,
      );
      if (code === '08006') {
        await expect(result).rejects.toThrow('notification insert failed');
        expect(query).toHaveBeenLastCalledWith('ROLLBACK');
      } else {
        await expect(result).resolves.toMatchObject({
          entries: expect.not.arrayContaining([
            matching({ id: WORK }),
          ]) as unknown,
        });
        expect(query).toHaveBeenLastCalledWith('COMMIT');
      }
      expect(errorLog).toHaveBeenCalledTimes(code === '23514' ? 1 : 0);
      errorLog.mockRestore();
      const statements = query.mock.calls.map((call: unknown[]) =>
        String(call[0]),
      );
      if (enabled) {
        expect(statements).toEqual(
          containing([
            expect.stringMatching(/^ROLLBACK TO SAVEPOINT notification_/),
            expect.stringMatching(/^RELEASE SAVEPOINT notification_/),
          ]),
        );
      } else {
        expect(
          statements.some(
            (sql) =>
              sql.startsWith('SAVEPOINT') || sql.includes('email_outbox'),
          ),
        ).toBe(false);
      }
    },
  );
});

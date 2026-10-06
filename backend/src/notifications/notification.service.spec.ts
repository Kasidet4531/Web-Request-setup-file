import { Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { MailConfig } from './mail.config';
import { NotificationStorage } from './notification.storage';
import type { RequestNotificationEvent } from './notification.types';
const event: RequestNotificationEvent = {
  eventType: 'REQUEST_STATUS_CHANGED',
  requestId: 'b84c66d5-b481-4ea5-ae9a-f5dfaa8ed909',
  fromStatus: 'old',
  targetStatus: {
    id: 'new',
    name: 'New',
    kind: 'open',
    emailPolicy: { enabled: true, to: ['TEAM@example.com'], cc: [] },
  },
  actor: {
    id: 'user',
    username: 'user',
    displayName: 'User',
    role: 'admin',
    setupOwnerDepartment: null,
  },
};
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});
describe('NotificationService enqueue', () => {
  const metadata = {
    request_no: 'PSF-1',
    requester: 'Requester',
    product_type: 'IC',
    requester_data_json: { description: 'Safe' },
  };
  const make = () => {
    const storage = new NotificationStorage({ query: jest.fn() } as never);
    return {
      storage,
      service: new NotificationService(
        storage,
        new MailConfig({ APP_BASE_URL: 'http://localhost:3000' }),
      ),
    };
  };
  it('does no SQL for disabled destination or Draft', async () => {
    const { service } = make();
    const query = jest.fn();
    await service.enqueueRequest(
      { query },
      {
        ...event,
        targetStatus: {
          ...event.targetStatus,
          emailPolicy: { enabled: false, to: [], cc: [] },
        },
      },
    );
    await service.enqueueRequest(
      { query },
      { ...event, targetStatus: { ...event.targetStatus, kind: 'draft' } },
    );
    expect(query).not.toHaveBeenCalled();
  });
  it('enqueues normalized immutable recipient and body snapshots even with dispatch disabled', async () => {
    const { service } = make();
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('FROM psf_requests')
          ? { rows: [metadata] }
          : { rows: [{ id: 'job' }] },
      ),
    );
    await service.enqueueRequest({ query } as never, event);
    const [sql, args] = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO email_outbox'),
    ) as unknown as [string, unknown[]];
    expect(sql).toContain('body_html');
    expect(args).toContain('team@example.com');
    expect(args).toContain('[PSF Request] Status Updated to New: PSF-1 - -');
    expect(query.mock.calls[0][0]).toMatch(/^SAVEPOINT/);
    expect(query.mock.calls.at(-1)?.[0]).toMatch(/^RELEASE/);
  });
  it('does not persist a broken relative email link when APP_BASE_URL is missing', async () => {
    const storage = new NotificationStorage({ query: jest.fn() } as never);
    const service = new NotificationService(storage, new MailConfig({}));
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('FROM psf_requests')
          ? { rows: [metadata] }
          : { rows: [{ id: 'job' }] },
      ),
    );
    await expect(
      service.enqueueRequest({ query } as never, event),
    ).resolves.toBeUndefined();
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO email_outbox'),
      ),
    ).toBe(false);
    expect(query.mock.calls.map(([sql]) => sql)).toContainEqual(
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT/),
    );
  });
  it('rolls back only the savepoint after recoverable SQL errors', async () => {
    const { service } = make();
    const query = jest.fn((sql: string) => {
      if (sql.includes('FROM psf_requests'))
        return Promise.resolve({ rows: [metadata] });
      if (sql.includes('INSERT INTO'))
        return Promise.reject(
          Object.assign(new Error('constraint'), { code: '23514' }),
        );
      return Promise.resolve({ rows: [] });
    });
    await expect(
      service.enqueueRequest({ query } as never, event),
    ).resolves.toBeUndefined();
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^ROLLBACK TO SAVEPOINT/),
        expect.stringMatching(/^RELEASE SAVEPOINT/),
      ]),
    );
  });
  it('propagates failed savepoint recovery and connection failures', async () => {
    const { service } = make();
    const error = Object.assign(new Error('connection lost'), {
      code: '08006',
    });
    const query = jest.fn((sql: string) => {
      if (sql.includes('FROM psf_requests')) return Promise.reject(error);
      return Promise.resolve({ rows: [] });
    });
    await expect(
      service.enqueueRequest({ query } as never, event),
    ).rejects.toBe(error);
  });
});

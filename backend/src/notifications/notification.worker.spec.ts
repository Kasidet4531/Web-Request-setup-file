import { Logger } from '@nestjs/common';
import { NotificationWorker } from './notification.worker';
import { MailConfig } from './mail.config';
import type { OutboxJob } from './notification.types';
const env = {
  MAIL_ENABLED: 'true',
  NODE_ENV: 'test',
  MAIL_SOAP_URL: 'http://localhost/mail',
  MAIL_SMTP_SERVER: 'smtp.local',
  MAIL_DEFAULT_TO: 'default@example.com',
  APP_BASE_URL: 'http://localhost',
  MAIL_REDIRECT_TO: 'test@example.com',
};
const job: OutboxJob = {
  id: 'j',
  event_type: 'REQUEST_SUBMITTED',
  request_id: null,
  from_address: 'noreply-psf@nxp.com',
  to_recipients: 'real@example.com',
  cc_recipients: '',
  bcc_recipients: '',
  subject: 'request',
  body_html: 'secret request body',
  status: 'sending',
  attempts: 5,
  claim_token: 'token',
};
const make = () => {
  const storage = {
    initialize: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    claim: jest.fn<Promise<OutboxJob[]>, []>().mockResolvedValue([job]),
    recover: jest.fn<Promise<OutboxJob[]>, []>().mockResolvedValue([]),
    markSent: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    markFailed: jest
      .fn<Promise<'pending' | 'failed' | null>, []>()
      .mockResolvedValue('failed'),
    enqueueFailureAlert: jest
      .fn<Promise<string | null>, [string]>()
      .mockResolvedValue(null),
  };
  const dispatcher = {
    send: jest.fn<Promise<string>, []>().mockResolvedValue('sent'),
  };
  return {
    storage,
    dispatcher,
    worker: new NotificationWorker(
      storage as never,
      dispatcher as never,
      new MailConfig(env),
    ),
  };
};
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});
describe('NotificationWorker', () => {
  it('allows shutdown to complete even when an active poll rejects', async () => {
    const { storage, worker } = make();
    let reject!: (error: Error) => void;
    storage.recover.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const active = worker.poll().catch(() => undefined);
    const shutdown = worker.onModuleDestroy();
    reject(new Error('Database unavailable during recovery'));
    await expect(shutdown).resolves.toBeUndefined();
    await active;
  });
  it('initializes storage even when delivery disabled', async () => {
    const { storage, dispatcher } = make();
    const worker = new NotificationWorker(
      storage as never,
      dispatcher as never,
      new MailConfig({}),
    );
    await worker.onApplicationBootstrap();
    await worker.onApplicationShutdown();
    expect(storage.initialize).toHaveBeenCalled();
    expect(storage.claim).not.toHaveBeenCalled();
  });
  it('does not overlap polls and drains active dispatch at shutdown', async () => {
    const { storage, dispatcher, worker } = make();
    let finish!: (s: string) => void;
    dispatcher.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const poll = worker.poll();
    await new Promise((resolve) => setImmediate(resolve));
    await worker.poll();
    expect(storage.claim).toHaveBeenCalledTimes(1);
    let stopped = false;
    const shutdown = worker.onApplicationShutdown().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(stopped).toBe(false);
    finish('sent');
    await poll;
    await shutdown;
    await worker.poll();
    expect(storage.claim).toHaveBeenCalledTimes(1);
  });
  it('drains active work during module destruction before database shutdown', async () => {
    const { dispatcher, worker } = make();
    let finish!: (s: string) => void;
    dispatcher.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const poll = worker.poll();
    await new Promise((resolve) => setImmediate(resolve));
    let destroyed = false;
    const destroy = worker.onModuleDestroy().then(() => {
      destroyed = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(destroyed).toBe(false);
    finish('sent');
    await poll;
    await destroy;
    expect(destroyed).toBe(true);
  });
  it('dispatches the batch concurrently to keep all claims within lease timeout', async () => {
    const { storage, dispatcher, worker } = make();
    storage.claim.mockResolvedValue([job, { ...job, id: 'j2' }]);
    const releases: ((s: string) => void)[] = [];
    dispatcher.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
    );
    const poll = worker.poll();
    await new Promise((resolve) => setImmediate(resolve));
    expect(releases).toHaveLength(2);
    releases.forEach((release) => release('sent'));
    await poll;
  });
  it('attempts durable summary creation when the following claim fails', async () => {
    const { storage, worker } = make();
    storage.claim.mockRejectedValue(new Error('Transient claim failure'));
    await expect(worker.poll()).rejects.toThrow('Transient claim failure');
    expect(storage.enqueueFailureAlert).toHaveBeenCalledWith(
      'default@example.com',
    );
  });
  it('reattempts durable summary creation after an insert fails', async () => {
    const { storage, worker } = make();
    storage.claim.mockResolvedValue([]);
    storage.enqueueFailureAlert.mockRejectedValueOnce(
      new Error('Transient summary failure'),
    );
    await expect(worker.poll()).rejects.toThrow('Transient summary failure');
    await expect(worker.poll()).resolves.toBeUndefined();
    expect(storage.enqueueFailureAlert).toHaveBeenCalledTimes(2);
  });
});

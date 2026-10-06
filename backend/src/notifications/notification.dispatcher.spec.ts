import { Logger } from '@nestjs/common';
import { NotificationDispatcher } from './notification.dispatcher';
import { MailConfig } from './mail.config';
import type { OutboxJob } from './notification.types';
const env = {
  MAIL_ENABLED: 'true',
  NODE_ENV: 'test',
  MAIL_SOAP_URL: 'http://localhost/mail',
  MAIL_SMTP_SERVER: 'smtp.local',
  MAIL_DEFAULT_TO: 'default@example.com',
  MAIL_ADMIN_TO: 'admin@example.com',
  APP_BASE_URL: 'http://localhost',
  MAIL_REDIRECT_TO: 'test@example.com',
};
export const job: OutboxJob = {
  id: 'j',
  event_type: 'REQUEST_SUBMITTED',
  request_id: null,
  from_address: 'bad@example.com',
  to_recipients: 'real@example.com',
  cc_recipients: 'cc@example.com',
  bcc_recipients: 'bcc@example.com',
  subject: 'PSF request',
  body_html: '<p>request</p>',
  status: 'sending',
  attempts: 1,
  claim_token: 'token',
};
const success =
  '<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/"><Body><SendMailResponse xmlns="http://tempuri.org/"/></Body></Envelope>';
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});
describe('NotificationDispatcher', () => {
  it('redirects To and clears CC/BCC with escaped intended recipients and keeps snapshots clean', async () => {
    const fetcher = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit?]>()
      .mockResolvedValue(new Response(success, { status: 200 }));
    const dispatcher = new NotificationDispatcher(
      new MailConfig(env),
      fetcher as typeof fetch,
    );
    const before = { ...job };
    const sentTo = await dispatcher.send(job);
    const options = fetcher.mock.calls[0]?.[1] as unknown as RequestInit;
    const xml = typeof options.body === 'string' ? options.body : '';
    expect(sentTo).toBe('To: test@example.com; CC: ; BCC: ');
    expect(xml).toContain('<i_strTo>test@example.com</i_strTo>');
    expect(xml).toContain('<i_strCC></i_strCC>');
    expect(xml).toContain('<i_strBCC></i_strBCC>');
    expect(xml).toContain('[TEST] PSF request');
    expect(xml).toContain('real@example.com');
    expect(xml).toContain('noreply-psf@nxp.com');
    expect(job).toEqual(before);
  });
  it('rejects disabled delivery without network calls', async () => {
    const fetcher = jest.fn();
    const dispatcher = new NotificationDispatcher(new MailConfig({}), fetcher);
    await expect(dispatcher.send(job)).rejects.toThrow(/disabled/i);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('bounds timeout including response body consumption', async () => {
    const fetcher = jest.fn(
      (_url: unknown, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          options.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          ),
        ),
    );
    const dispatcher = new NotificationDispatcher(
      new MailConfig({ ...env, MAIL_TIMEOUT_MS: '10' }),
      fetcher as typeof fetch,
    );
    await expect(dispatcher.send(job)).rejects.toThrow(/timeout/i);
  });
  it('rejects HTTP errors and faults through shared dispatcher', async () => {
    const dispatcher = new NotificationDispatcher(new MailConfig(env), () =>
      Promise.resolve(new Response(success, { status: 503 })),
    );
    await expect(dispatcher.send(job)).rejects.toThrow(/HTTP 503/);
  });
});

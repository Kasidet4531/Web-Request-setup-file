import { NotificationsController } from './notifications.controller';
import { MailConfig } from './mail.config';
import type { AuthenticatedRequest } from '../auth/session.types';
const request = { session: { userId: 'u' } } as AuthenticatedRequest;
const env = {
  MAIL_ENABLED: 'true',
  NODE_ENV: 'test',
  MAIL_SOAP_URL: 'http://localhost/mail',
  MAIL_SMTP_SERVER: 'smtp.local',
  MAIL_DEFAULT_TO: 'admin@example.com',
  APP_BASE_URL: 'http://localhost',
  MAIL_REDIRECT_TO: 'test@example.com',
};
const make = (enabled = true) => {
  const storage = {
    list: jest.fn().mockResolvedValue({ items: [] }),
    resend: jest.fn().mockResolvedValue({ id: 'j' }),
    insertClaimedTest: jest
      .fn()
      .mockResolvedValue({ id: 'job', attempts: 1, claim_token: 'token' }),
    claim: jest
      .fn()
      .mockResolvedValue([{ id: 'job', attempts: 1, claim_token: 'token' }]),
    markSent: jest.fn().mockResolvedValue(true),
    markFailed: jest.fn().mockResolvedValue('failed'),
  };
  const auth = {
    getProfile: jest.fn().mockResolvedValue({ id: 'u', role: 'admin' }),
  };
  const dispatcher = {
    send: jest.fn().mockResolvedValue('To: test@example.com'),
  };
  return {
    storage,
    auth,
    dispatcher,
    controller: new NotificationsController(
      storage as never,
      auth as never,
      dispatcher as never,
      new MailConfig(enabled ? env : {}),
    ),
  };
};
describe('NotificationsController', () => {
  it('requires current database backed admin for every action', async () => {
    const { controller, auth, storage } = make();
    await expect(
      controller.list({ session: {} } as AuthenticatedRequest, {}),
    ).rejects.toThrow(/authenticated/i);
    auth.getProfile.mockResolvedValue({ id: 'u', role: 'requester' });
    await expect(controller.resend(request, 'id')).rejects.toThrow(/admins/i);
    auth.getProfile.mockResolvedValue(null);
    const stale = { session: { userId: 'gone' } } as AuthenticatedRequest;
    await expect(controller.test(stale)).rejects.toThrow(/authenticated/i);
    expect(stale.session.userId).toBeUndefined();
    expect(storage.list).not.toHaveBeenCalled();
  });
  it('rejects disabled test without persisting or sending', async () => {
    const { controller, storage, dispatcher } = make(false);
    await expect(controller.test(request)).rejects.toThrow(/disabled/i);
    expect(storage.insertClaimedTest).not.toHaveBeenCalled();
    expect(dispatcher.send).not.toHaveBeenCalled();
  });
  it('persists fixed test recipients and template before sending through shared dispatcher', async () => {
    const { controller, storage, dispatcher } = make();
    const result = await controller.test(request);
    expect(result.success).toBe(true);
    expect(result.outboxId).toBe('job');
    expect(storage.claim).not.toHaveBeenCalled();
    expect(storage.insertClaimedTest.mock.invocationCallOrder[0]).toBeLessThan(
      dispatcher.send.mock.invocationCallOrder[0],
    );
    expect(storage.insertClaimedTest).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'ADMIN_TEST',
        to_recipients: 'admin@example.com',
        subject: 'PSF Setup File - SOAP Email Test',
      }),
    );
  });
  it('records immediate test failure as failed without scheduled retries', async () => {
    const { controller, storage, dispatcher } = make();
    dispatcher.send.mockRejectedValue(new Error('unavailable'));
    const result = await controller.test(request);
    expect(result.success).toBe(false);
    expect(storage.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1 }),
      expect.any(Error),
      true,
    );
  });
});

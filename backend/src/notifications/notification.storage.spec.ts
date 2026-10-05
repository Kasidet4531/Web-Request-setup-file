import { NotificationStorage } from './notification.storage';
describe('NotificationStorage admin validation and privacy', () => {
  it.each([
    { page: '0' },
    { page: 'abc' },
    { page: '1.5' },
    { limit: '101' },
    { status: 'unknown' },
    { isFallback: 'maybe' },
    { page: ['1'] },
  ])('rejects invalid filters before SQL: %j', async (filters) => {
    const query = jest.fn();
    const storage = new NotificationStorage({ query } as never);
    await expect(storage.list(filters as never)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it('maps audit metadata to camelCase and excludes body/token from the returned list', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'j',
            event_type: 'ADMIN_TEST',
            locked_at: 'date',
            body_html: 'must be excluded',
            claim_token: 'secret',
            to_recipients: 'admin@example.com',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });
    const storage = new NotificationStorage({ query } as never);
    const result = await storage.list({});
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      eventType: 'ADMIN_TEST',
      lockedAt: 'date',
      to: 'admin@example.com',
    });
    expect(result.items[0]).not.toHaveProperty('body_html');
    expect(result.items[0]).not.toHaveProperty('claim_token');
  });
});

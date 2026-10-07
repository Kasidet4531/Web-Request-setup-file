import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DraftRemindersController } from './draft-reminders.controller';
import type { DraftReminderService } from './draft-reminder.service';
import type { AuthService } from '../auth/auth.service';
import type { AuthenticatedRequest } from '../auth/session.types';

describe('Draft reminder inspection authorization', () => {
  const request = (userId?: string) =>
    ({ session: { userId } }) as AuthenticatedRequest;
  const controller = (role: string | null) =>
    new DraftRemindersController(
      {
        list: () => Promise.resolve({ items: [] }),
      } as unknown as DraftReminderService,
      {
        getProfile: () => Promise.resolve(role ? { id: 'actor', role } : null),
      } as unknown as AuthService,
    );
  it('requires a server session', async () => {
    await expect(controller('admin').list(request())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('rejects an ordinary authenticated user', async () => {
    await expect(
      controller('requester').list(request('actor')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('uses the current profile and clears a removed account session', async () => {
    const removed = request('actor');
    await expect(controller(null).list(removed)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(removed.session.userId).toBeUndefined();
  });
  it('returns reminder items to the current Admin', async () => {
    await expect(controller('admin').list(request('actor'))).resolves.toEqual({
      items: [],
    });
  });
});

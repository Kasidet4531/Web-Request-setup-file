import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import { AttachmentPolicyController } from './attachment-policy.controller';
import { AttachmentStorage } from './attachment-storage';

const profile = (
  role: AuthenticatedUserProfile['role'],
): AuthenticatedUserProfile => ({
  id: '00000000-0000-4000-8000-000000000101',
  username: role,
  displayName: role,
  role,
  setupOwnerDepartment: role === 'setup_owner' ? 'GNTC' : null,
});

describe('AttachmentPolicyController over HTTP', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  let sessionUserId: string | undefined;
  const authService = { getProfile: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AttachmentPolicyController],
      providers: [
        // Configuration only: no storage path, so nothing is reachable.
        {
          provide: AttachmentStorage,
          useValue: new AttachmentStorage({ ATTACHMENT_MAX_BYTES: '1234' }),
        },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { session: { userId?: string } }).session = {
        userId: sessionUserId,
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    sessionUserId = 'signed-in';
  });

  it.each(['requester', 'setup_owner', 'admin'] as const)(
    'gives a signed-in %s the configured per-file limit and the blocked extensions',
    async (role) => {
      authService.getProfile.mockResolvedValue(profile(role));

      await request(server())
        .get('/attachment-policy')
        .expect(200)
        .expect({
          maxBytes: 1234,
          blockedExtensions: [
            '.exe',
            '.bat',
            '.cmd',
            '.com',
            '.msi',
            '.ps1',
            '.sh',
            '.vbs',
          ],
        });
      expect(authService.getProfile).toHaveBeenCalledWith('signed-in');
    },
  );

  it('refuses a caller without a session', async () => {
    sessionUserId = undefined;
    await request(server()).get('/attachment-policy').expect(401);
    expect(authService.getProfile).not.toHaveBeenCalled();
  });

  it('refuses a session whose user no longer exists', async () => {
    authService.getProfile.mockResolvedValue(null);
    await request(server()).get('/attachment-policy').expect(401);
  });
});

import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { AuditLogController } from './audit_log.controller';
import { AuditLogService } from './audit_log.service';

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let auditLogService: { findGlobalAuditLogs: jest.Mock };
  let authService: { getProfile: jest.Mock };

  beforeEach(async () => {
    auditLogService = { findGlobalAuditLogs: jest.fn() };
    authService = { getProfile: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [
        { provide: AuditLogService, useValue: auditLogService },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    controller = module.get(AuditLogController);
  });

  it('uses the authenticated server profile to authorize an admin global audit read', async () => {
    const admin = {
      id: 'admin-1',
      username: 'admin.demo',
      displayName: 'Admin Demo',
      role: 'admin' as const,
      setupOwnerDepartment: null,
    };
    const filters = {
      user: 'setup.gntc',
      actionType: 'REQUEST_STATUS_CHANGED',
      from: '2026-06-18',
      to: '2026-06-19',
    };
    const entries = [
      {
        requestId: 'request-1',
        requestNo: 'PSF-0001',
        actionType: 'REQUEST_STATUS_CHANGED',
        actorDisplayName: 'Setup Owner GNTC Demo',
        actorRole: 'setup_owner',
        createdAt: '2026-06-19T01:02:03.000Z',
        metadata: {},
      },
    ];
    authService.getProfile.mockResolvedValue(admin);
    auditLogService.findGlobalAuditLogs.mockResolvedValue(entries);

    await expect(
      controller.getAuditLogs(filters, {
        session: { userId: 'admin-1' },
      } as never),
    ).resolves.toEqual(entries);

    expect(authService.getProfile).toHaveBeenCalledWith('admin-1');
    expect(auditLogService.findGlobalAuditLogs).toHaveBeenCalledWith(
      filters,
      admin,
    );
  });

  it.each([
    ['requester', null],
    ['setup_owner', 'GNTC'],
    ['setup_owner', 'MFG'],
  ] as const)(
    'permits a %s with department %s using the fresh server profile',
    async (role, setupOwnerDepartment) => {
      const actor = {
        id: 'session-user',
        username: 'company.user',
        displayName: 'Company User',
        role,
        setupOwnerDepartment,
      };
      authService.getProfile.mockResolvedValue(actor);
      auditLogService.findGlobalAuditLogs.mockResolvedValue([]);
      await expect(
        controller.getAuditLogs({}, {
          session: { userId: actor.id, role: 'admin' },
        } as never),
      ).resolves.toEqual([]);
      expect(auditLogService.findGlobalAuditLogs).toHaveBeenCalledWith(
        {},
        actor,
      );
    },
  );

  it('clears an expired identity and rejects it before reading audit data', async () => {
    authService.getProfile.mockResolvedValue(null);
    const request = { session: { userId: 'deleted-user' } };
    await expect(
      controller.getAuditLogs({}, request as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.session.userId).toBeUndefined();
    expect(auditLogService.findGlobalAuditLogs).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated global audit read', async () => {
    await expect(
      controller.getAuditLogs({}, { session: {} } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authService.getProfile).not.toHaveBeenCalled();
    expect(auditLogService.findGlobalAuditLogs).not.toHaveBeenCalled();
  });
});

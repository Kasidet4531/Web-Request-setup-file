import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExportController } from './export.controller';

describe('ExportController', () => {
  let authService: { getProfile: jest.Mock };
  let excelExportService: { exportRequests: jest.Mock };
  let searchIndexService: { countExportRequests: jest.Mock };
  let exportJobRepository: { enqueue: jest.Mock };
  let configService: { get: jest.Mock };
  let controller: ExportController;
  const response = { end: jest.fn(), setHeader: jest.fn() };

  beforeEach(() => {
    authService = { getProfile: jest.fn() };
    excelExportService = { exportRequests: jest.fn() };
    searchIndexService = {
      countExportRequests: jest.fn().mockResolvedValue(0),
    };
    exportJobRepository = { enqueue: jest.fn() };
    configService = {
      get: jest.fn((_name: string, fallback: unknown) => fallback),
    };
    response.end.mockReset();
    response.setHeader.mockReset();
    controller = Reflect.construct(ExportController, [
      excelExportService,
      authService,
      searchIndexService,
      exportJobRepository,
      configService,
    ]) as ExportController;
  });

  it.each([['setup_owner', 'GNTC']] as const)(
    'rejects a %s before querying requests for an export',
    async (role, setupOwnerDepartment) => {
      authService.getProfile.mockResolvedValue({
        id: `${role}-1`,
        username: `${role}.demo`,
        displayName: `${role} Demo`,
        role,
        setupOwnerDepartment,
      });
      const exportController = controller as unknown as {
        exportRequests: (
          query: Record<string, unknown>,
          request: { session: { userId?: string } },
          response: { end: jest.Mock; setHeader: jest.Mock },
        ) => Promise<void>;
      };

      await expect(
        exportController.exportRequests(
          {},
          { session: { userId: `${role}-1` } },
          response,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(excelExportService.exportRequests).not.toHaveBeenCalled();
    },
  );

  it('allows a requester and passes the authenticated actor to the export service', async () => {
    const actor = {
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    };
    authService.getProfile.mockResolvedValue(actor);
    excelExportService.exportRequests.mockResolvedValue({
      content: Buffer.from('xlsx-content'),
      filename: 'psf_requests_20260619_000506.xlsx',
    });
    const exportController = controller as unknown as {
      exportRequests: (
        query: Record<string, unknown>,
        request: { session: { userId?: string } },
        response: { end: jest.Mock; setHeader: jest.Mock },
      ) => Promise<void>;
    };

    await expect(
      exportController.exportRequests(
        { status: 'Submitted' },
        { session: { userId: actor.id } },
        response,
      ),
    ).resolves.toBeUndefined();

    expect(excelExportService.exportRequests).toHaveBeenCalledWith(
      { status: 'Submitted' },
      actor,
      2000,
    );
  });

  it.each([
    ['status', { status: ['Submitted', 'Completed'] }],
    ['from', { from: ['2026-06-01', '2026-06-02'] }],
    ['to', { to: { value: '2026-06-30' } }],
  ])(
    'rejects a non-scalar %s filter before exporting',
    async (_field, query) => {
      authService.getProfile.mockResolvedValue({
        id: 'admin-1',
        username: 'admin.demo',
        displayName: 'Admin Demo',
        role: 'admin',
        setupOwnerDepartment: null,
      });
      const exportController = controller as unknown as {
        exportRequests: (
          query: Record<string, unknown>,
          request: { session: { userId?: string } },
          response: { end: jest.Mock; setHeader: jest.Mock },
        ) => Promise<void>;
      };

      await expect(
        exportController.exportRequests(
          query,
          { session: { userId: 'admin-1' } },
          response,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(excelExportService.exportRequests).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['from', { from: '2026-02-30' }],
    ['to', { to: '18/06/2026' }],
  ])(
    'rejects an invalid %s calendar date before exporting',
    async (_field, query) => {
      authService.getProfile.mockResolvedValue({
        id: 'admin-1',
        username: 'admin.demo',
        displayName: 'Admin Demo',
        role: 'admin',
        setupOwnerDepartment: null,
      });
      const exportController = controller as unknown as {
        exportRequests: (
          query: Record<string, unknown>,
          request: { session: { userId?: string } },
          response: { end: jest.Mock; setHeader: jest.Mock },
        ) => Promise<void>;
      };

      await expect(
        exportController.exportRequests(
          query,
          { session: { userId: 'admin-1' } },
          response,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(excelExportService.exportRequests).not.toHaveBeenCalled();
    },
  );

  it('passes current request-list filters and the authenticated actor to the export service and returns an XLSX attachment for an admin', async () => {
    const content = Buffer.from('xlsx-content');
    const actor = {
      id: 'admin-1',
      username: 'admin.demo',
      displayName: 'Admin Demo',
      role: 'admin' as const,
      setupOwnerDepartment: null,
    };
    authService.getProfile.mockResolvedValue(actor);
    excelExportService.exportRequests.mockResolvedValue({
      content,
      filename: 'psf_requests_20260619_000506.xlsx',
    });
    const exportController = controller as unknown as {
      exportRequests: (
        query: Record<string, unknown>,
        request: { session: { userId?: string } },
        response: { end: jest.Mock; setHeader: jest.Mock },
      ) => Promise<void>;
    };

    await expect(
      exportController.exportRequests(
        {
          status: ' Submitted ',
          from: '2026-06-01',
          to: '2026-06-30',
        },
        { session: { userId: 'admin-1' } },
        response,
      ),
    ).resolves.toBeUndefined();

    expect(excelExportService.exportRequests).toHaveBeenCalledWith(
      {
        status: 'Submitted',
        requestDateFrom: '2026-06-01',
        requestDateTo: '2026-06-30',
      },
      actor,
      2000,
    );
    expect(response.setHeader).toHaveBeenNthCalledWith(
      1,
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.setHeader).toHaveBeenNthCalledWith(
      2,
      'Content-Disposition',
      'attachment; filename="psf_requests_20260619_000506.xlsx"',
    );
    expect(response.end).toHaveBeenCalledWith(content);
  });
});

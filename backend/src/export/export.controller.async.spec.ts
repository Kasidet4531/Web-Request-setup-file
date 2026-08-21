import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ExportController } from './export.controller';

const adminActor = {
  id: 'admin-1',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};

const requesterActor = {
  id: 'requester-1',
  username: 'requester.demo',
  displayName: 'Requester Demo',
  role: 'requester' as const,
  setupOwnerDepartment: null,
};

const queuedJob = {
  id: '2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49',
  ownerUserId: requesterActor.id,
  ownerRole: 'requester' as const,
  filters: { status: 'Submitted' },
  status: 'queued' as const,
  attemptCount: 0,
  queuedAt: '2026-08-20T00:00:00.000Z',
  startedAt: null,
  claimedAt: null,
  completedAt: null,
  failedAt: null,
  filename: null,
  content: null,
  failureMessage: null,
  claimToken: null,
};

describe('ExportController async lifecycle', () => {
  let authService: { getProfile: jest.Mock };
  let excelExportService: { exportRequests: jest.Mock };
  let searchIndexService: { countExportRequests: jest.Mock };
  let exportJobRepository: {
    enqueue: jest.Mock;
    findOwned: jest.Mock;
    findOwnedContent: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let controller: ExportController;
  const response = {
    end: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(),
  };

  beforeEach(() => {
    authService = { getProfile: jest.fn().mockResolvedValue(adminActor) };
    excelExportService = { exportRequests: jest.fn() };
    searchIndexService = {
      countExportRequests: jest.fn().mockResolvedValue(0),
    };
    exportJobRepository = {
      enqueue: jest.fn(),
      findOwned: jest.fn(),
      findOwnedContent: jest.fn(),
    };
    configService = {
      get: jest.fn((name: string, fallback: unknown) =>
        name === 'EXPORT_SYNC_THRESHOLD' ? '2000' : fallback,
      ),
    };
    response.end.mockReset();
    response.json.mockReset();
    response.setHeader.mockReset();
    response.status.mockReset();
    response.status.mockReturnValue(response);
    controller = Reflect.construct(ExportController, [
      excelExportService,
      authService,
      searchIndexService,
      exportJobRepository,
      configService,
    ]) as ExportController;
  });

  it('keeps exactly-at-threshold exports synchronous and reuses the original XLSX response path', async () => {
    const content = Buffer.from('xlsx-content');
    searchIndexService.countExportRequests.mockResolvedValueOnce(2000);
    excelExportService.exportRequests.mockResolvedValueOnce({
      content,
      filename: 'psf_requests_20260820_070300.xlsx',
    });
    const exportController = controller as unknown as {
      exportRequests: (
        query: Record<string, unknown>,
        request: { session: { userId?: string } },
        httpResponse: typeof response,
      ) => Promise<void>;
    };

    await exportController.exportRequests(
      { status: 'Submitted' },
      { session: { userId: adminActor.id } },
      response,
    );

    expect(searchIndexService.countExportRequests).toHaveBeenCalledWith(
      { status: 'Submitted' },
      adminActor,
    );
    expect(excelExportService.exportRequests).toHaveBeenCalledWith(
      { status: 'Submitted' },
      adminActor,
      2000,
    );
    expect(exportJobRepository.enqueue).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledWith(content);
  });

  it('returns an enqueue response above the threshold without generating an XLSX in the request handler', async () => {
    searchIndexService.countExportRequests.mockResolvedValueOnce(2001);
    exportJobRepository.enqueue.mockResolvedValueOnce(queuedJob);
    const exportController = controller as unknown as {
      exportRequests: (
        query: Record<string, unknown>,
        request: { session: { userId?: string } },
        httpResponse: typeof response,
      ) => Promise<void>;
    };

    await exportController.exportRequests(
      { status: 'Submitted' },
      { session: { userId: adminActor.id } },
      response,
    );

    expect(searchIndexService.countExportRequests).toHaveBeenCalledWith(
      { status: 'Submitted' },
      adminActor,
    );
    expect(exportJobRepository.enqueue).toHaveBeenCalledWith(
      { status: 'Submitted' },
      adminActor,
    );
    expect(excelExportService.exportRequests).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith({
      id: queuedJob.id,
      status: 'queued',
      statusUrl: `/requests/export-jobs/${queuedJob.id}`,
    });
  });

  it('returns only the current owner job state and withholds the download URL until completion', async () => {
    authService.getProfile.mockResolvedValueOnce(requesterActor);
    exportJobRepository.findOwned.mockResolvedValueOnce(queuedJob);
    const exportController = controller as unknown as {
      getExportJob: (
        jobId: string,
        request: { session: { userId?: string } },
      ) => Promise<Record<string, unknown>>;
    };

    await expect(
      exportController.getExportJob(queuedJob.id, {
        session: { userId: requesterActor.id },
      }),
    ).resolves.toEqual({
      id: queuedJob.id,
      status: 'queued',
      queuedAt: queuedJob.queuedAt,
      startedAt: null,
      completedAt: null,
      failedAt: null,
    });
    expect(exportJobRepository.findOwned).toHaveBeenCalledWith(
      queuedJob.id,
      requesterActor.id,
    );

    authService.getProfile.mockResolvedValueOnce(adminActor);
    exportJobRepository.findOwned.mockResolvedValueOnce(null);
    await expect(
      exportController.getExportJob(queuedJob.id, {
        session: { userId: adminActor.id },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports running work without a handle and adds the owner download handle only after completion', async () => {
    const runningJob = {
      ...queuedJob,
      status: 'running' as const,
      startedAt: '2026-08-20T00:01:00.000Z',
      claimedAt: '2026-08-20T00:01:00.000Z',
    };
    const completedJob = {
      ...runningJob,
      status: 'completed' as const,
      completedAt: '2026-08-20T00:02:00.000Z',
      filename: 'psf_requests_20260820_070200.xlsx',
    };
    const exportController = controller as unknown as {
      getExportJob: (
        jobId: string,
        request: { session: { userId?: string } },
      ) => Promise<Record<string, unknown>>;
    };
    authService.getProfile.mockResolvedValueOnce(requesterActor);
    exportJobRepository.findOwned.mockResolvedValueOnce(runningJob);

    const runningResponse = await exportController.getExportJob(runningJob.id, {
      session: { userId: requesterActor.id },
    });
    expect(runningResponse).toMatchObject({
      status: 'running',
      startedAt: runningJob.startedAt,
    });
    expect(runningResponse).not.toHaveProperty('downloadUrl');
    authService.getProfile.mockResolvedValueOnce(requesterActor);
    exportJobRepository.findOwned.mockResolvedValueOnce(completedJob);

    await expect(
      exportController.getExportJob(completedJob.id, {
        session: { userId: requesterActor.id },
      }),
    ).resolves.toEqual({
      id: completedJob.id,
      status: 'completed',
      queuedAt: completedJob.queuedAt,
      startedAt: completedJob.startedAt,
      completedAt: completedJob.completedAt,
      failedAt: completedJob.failedAt,
      downloadUrl: `/requests/export-jobs/${completedJob.id}/download`,
    });
  });

  it('returns a safe failed status for the owner and serves only a completed owned XLSX', async () => {
    const failedJob = {
      ...queuedJob,
      status: 'failed' as const,
      failedAt: '2026-08-20T00:03:00.000Z',
      failureMessage: 'Unable to prepare this export. Please try again.',
    };
    const completedJob = {
      ...queuedJob,
      status: 'completed' as const,
      completedAt: '2026-08-20T00:04:00.000Z',
      filename: 'psf_requests_20260820_070400.xlsx',
      content: Buffer.from('xlsx-content'),
    };
    const exportController = controller as unknown as {
      getExportJob: (
        jobId: string,
        request: { session: { userId?: string } },
      ) => Promise<Record<string, unknown>>;
      downloadExportJob: (
        jobId: string,
        request: { session: { userId?: string } },
        httpResponse: typeof response,
      ) => Promise<void>;
    };
    authService.getProfile.mockResolvedValueOnce(requesterActor);
    exportJobRepository.findOwned.mockResolvedValueOnce(failedJob);

    await expect(
      exportController.getExportJob(failedJob.id, {
        session: { userId: requesterActor.id },
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      failureMessage: 'Unable to prepare this export. Please try again.',
    });

    authService.getProfile.mockResolvedValueOnce(adminActor);
    exportJobRepository.findOwnedContent.mockResolvedValueOnce(null);
    await expect(
      exportController.downloadExportJob(
        queuedJob.id,
        { session: { userId: adminActor.id } },
        response,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    authService.getProfile.mockResolvedValueOnce(requesterActor);
    exportJobRepository.findOwnedContent.mockResolvedValueOnce(queuedJob);
    await expect(
      exportController.downloadExportJob(
        queuedJob.id,
        { session: { userId: requesterActor.id } },
        response,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    authService.getProfile.mockResolvedValueOnce(requesterActor);
    exportJobRepository.findOwnedContent.mockResolvedValueOnce(completedJob);
    await exportController.downloadExportJob(
      completedJob.id,
      { session: { userId: requesterActor.id } },
      response,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="psf_requests_20260820_070400.xlsx"',
    );
    expect(response.end).toHaveBeenCalledWith(completedJob.content);
  });

  it('keeps setup owners out of every lifecycle endpoint', async () => {
    authService.getProfile.mockResolvedValueOnce({
      id: 'setup-owner-1',
      username: 'setup.owner',
      displayName: 'Setup Owner',
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    });
    const exportController = controller as unknown as {
      getExportJob: (
        jobId: string,
        request: { session: { userId?: string } },
      ) => Promise<Record<string, unknown>>;
    };

    await expect(
      exportController.getExportJob(queuedJob.id, {
        session: { userId: 'setup-owner-1' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(exportJobRepository.findOwned).not.toHaveBeenCalled();
  });
});

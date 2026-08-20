import { ExportJobProcessor } from './export-job.processor';

describe('ExportJobProcessor', () => {
  const job = {
    id: '2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49',
    ownerUserId: 'requester-1',
    ownerRole: 'requester' as const,
    filters: { status: 'Submitted' },
    status: 'running' as const,
    attemptCount: 1,
    queuedAt: '2026-08-20T00:00:00.000Z',
    startedAt: '2026-08-20T00:00:01.000Z',
    claimedAt: '2026-08-20T00:00:01.000Z',
    completedAt: null,
    failedAt: null,
    filename: null,
    content: null,
    failureMessage: null,
    claimToken: '4d793b59-03e7-4c21-bb79-4e4db810ea5a',
  };
  let repository: {
    claimNext: jest.Mock;
    complete: jest.Mock;
    fail: jest.Mock;
    refreshClaim: jest.Mock;
  };
  let excelExportService: { exportAllRequests: jest.Mock };
  let configService: { get: jest.Mock };
  let processor: ExportJobProcessor;

  beforeEach(() => {
    repository = {
      claimNext: jest.fn().mockResolvedValue(null),
      complete: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
      refreshClaim: jest.fn().mockResolvedValue(true),
    };
    excelExportService = { exportAllRequests: jest.fn() };
    configService = {
      get: jest.fn((_name: string, fallback: unknown) => fallback),
    };
    processor = Reflect.construct(ExportJobProcessor, [
      repository,
      excelExportService,
      configService,
    ]) as ExportJobProcessor;
  });

  it('picks up persisted queued work when a processor starts after an application restart', () => {
    const processNext = jest
      .spyOn(processor, 'processNext')
      .mockResolvedValue(undefined);

    processor.onApplicationBootstrap();

    expect(processNext).toHaveBeenCalledTimes(1);
    processor.onModuleDestroy();
  });

  it('claims one durable job at a time and persists the reused export result after generation finishes', async () => {
    let releaseGeneration: (() => void) | undefined;
    const generationStarted = new Promise<void>((resolve) => {
      excelExportService.exportAllRequests.mockImplementation(() => {
        resolve();
        return new Promise((resolveGeneration) => {
          releaseGeneration = () =>
            resolveGeneration({
              content: Buffer.from('xlsx-content'),
              filename: 'psf_requests_20260820_070300.xlsx',
            });
        });
      });
    });
    repository.claimNext.mockResolvedValueOnce(job).mockResolvedValueOnce(null);

    const firstProcessing = processor.processNext();
    await generationStarted;
    await processor.processNext();

    expect(repository.claimNext).toHaveBeenCalledTimes(1);
    expect(excelExportService.exportAllRequests).toHaveBeenCalledWith(
      { status: 'Submitted' },
      { id: 'requester-1', role: 'requester' },
    );

    releaseGeneration?.();
    await firstProcessing;

    expect(repository.complete).toHaveBeenCalledWith(job.id, job.claimToken, {
      content: Buffer.from('xlsx-content'),
      filename: 'psf_requests_20260820_070300.xlsx',
    });
  });

  it('keeps an ordinary asynchronous API task responsive while a held large export is being processed', async () => {
    let releaseGeneration: (() => void) | undefined;
    const generationStarted = new Promise<void>((resolve) => {
      excelExportService.exportAllRequests.mockImplementation(() => {
        resolve();
        return new Promise((resolveGeneration) => {
          releaseGeneration = () =>
            resolveGeneration({
              content: Buffer.from('xlsx-content'),
              filename: 'psf_requests_20260820_070300.xlsx',
            });
        });
      });
    });
    repository.claimNext.mockResolvedValueOnce(job);

    const processing = processor.processNext();
    await generationStarted;
    const ordinaryApiResponse = await Promise.resolve({ status: 'ok' });

    expect(ordinaryApiResponse).toEqual({ status: 'ok' });
    expect(repository.complete).not.toHaveBeenCalled();

    releaseGeneration?.();
    await processing;
  });

  it('renews a long-running durable claim so another application instance cannot reclaim healthy work', async () => {
    jest.useFakeTimers();

    try {
      configService.get.mockImplementation((name: string, fallback: unknown) =>
        name === 'EXPORT_JOB_STALE_AFTER_MS' ? 1_000 : fallback,
      );
      let releaseGeneration: (() => void) | undefined;
      const generationStarted = new Promise<void>((resolve) => {
        excelExportService.exportAllRequests.mockImplementation(() => {
          resolve();
          return new Promise((resolveGeneration) => {
            releaseGeneration = () =>
              resolveGeneration({
                content: Buffer.from('xlsx-content'),
                filename: 'psf_requests_20260820_070300.xlsx',
              });
          });
        });
      });
      repository.claimNext.mockResolvedValueOnce(job);

      const processing = processor.processNext();
      await generationStarted;
      await jest.advanceTimersByTimeAsync(334);

      expect(repository.refreshClaim).toHaveBeenCalledWith(
        job.id,
        job.claimToken,
      );

      releaseGeneration?.();
      await processing;
      const refreshCallsAtCompletion =
        repository.refreshClaim.mock.calls.length;

      await jest.advanceTimersByTimeAsync(1_000);
      expect(repository.refreshClaim).toHaveBeenCalledTimes(
        refreshCallsAtCompletion,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('stores only a concise user-safe failure message when workbook generation rejects', async () => {
    repository.claimNext.mockResolvedValueOnce(job);
    excelExportService.exportAllRequests.mockRejectedValueOnce(
      new Error('password=secret postgresql://example/internal-stack'),
    );

    await processor.processNext();

    expect(repository.fail).toHaveBeenCalledWith(
      job.id,
      job.claimToken,
      'Unable to prepare this export. Please try again.',
    );
  });
});

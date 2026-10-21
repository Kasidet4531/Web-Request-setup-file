import { PayloadTooLargeException } from '@nestjs/common';
import { LEGACY_PSF_CREATED_INFORMATION_SCHEMA } from '../admin/form_schema.constants';
import { ExcelExportService } from './excel_export.service';

// These exports run the real workbook worker, so the limits are exercised the
// way production runs them.
describe('ExcelExportService resource limits', () => {
  const adminActor = { id: 'admin-1', role: 'admin' as const };
  const requesterSchema = {
    formKey: 'psf-request',
    version: 1,
    title: 'PSF Request Form',
    sections: [],
  };
  const item = {
    requestId: 'request-1',
    requestNo: 'PSF-0001',
    status: 'Submitted',
    requestDate: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    requesterData: {},
    psfCreatedData: {},
    psfReleasedAt: null,
    psfCreatedInformationSchema: null,
    schemaSnapshot: requesterSchema,
    canonicalValues: {},
  };
  const page = { items: [item], total: 1, limit: 500, offset: 0 };

  function exporter(
    env: Record<string, string>,
    queryExportRequests = jest.fn().mockResolvedValue(page),
  ): ExcelExportService {
    const search = {
      withExportSnapshot: (
        operation: (search: unknown, runner: unknown) => Promise<unknown>,
      ) => operation(search, {}),
      queryExportRequests,
    };
    const forms = {
      getActiveSchema: (formKey: string) =>
        Promise.resolve({
          schema:
            formKey === 'psf-request'
              ? requesterSchema
              : LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
        }),
    };
    const config = { get: (key: string) => env[key] };
    return Reflect.construct(ExcelExportService, [
      search,
      forms,
      config,
    ]) as ExcelExportService;
  }

  it('fails only the export that needs more memory than EXPORT_WORKER_MAX_MEMORY_MB, with a message saying so', async () => {
    const error = await exporter({ EXPORT_WORKER_MAX_MEMORY_MB: '1' })
      .exportAllRequests({}, adminActor)
      .catch((failure: unknown) => failure);

    // 413 carries the message to the Export page, like the record ceiling.
    expect(error).toBeInstanceOf(PayloadTooLargeException);
    expect((error as Error).message).toContain(
      'needs more memory than EXPORT_WORKER_MAX_MEMORY_MB allows',
    );

    const next = await exporter({}).exportAllRequests({}, adminActor);
    expect(next.content.length).toBeGreaterThan(0);
  }, 30_000);

  it('runs at most EXPORT_SYNC_MAX_CONCURRENT direct exports at once and frees the slot when one finishes or fails', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const queryExportRequests = jest
      .fn()
      .mockImplementationOnce(() => held.then(() => page))
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(page);
    const service = exporter(
      { EXPORT_SYNC_MAX_CONCURRENT: '1' },
      queryExportRequests,
    );

    const first = service.tryDirectExport({}, adminActor);
    await expect(service.tryDirectExport({}, adminActor)).resolves.toBeNull();
    release();
    expect((await first)?.content.length).toBeGreaterThan(0);

    await expect(service.tryDirectExport({}, adminActor)).rejects.toThrow(
      'database unavailable',
    );
    expect(
      (await service.tryDirectExport({}, adminActor))?.content.length,
    ).toBeGreaterThan(0);
  }, 30_000);

  it('allows two direct exports at once when EXPORT_SYNC_MAX_CONCURRENT is not set', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const service = exporter(
      {},
      jest.fn(() => held.then(() => page)),
    );

    const running = [
      service.tryDirectExport({}, adminActor),
      service.tryDirectExport({}, adminActor),
    ];
    await expect(service.tryDirectExport({}, adminActor)).resolves.toBeNull();
    release();
    for (const workbook of await Promise.all(running))
      expect(workbook?.content.length).toBeGreaterThan(0);
  }, 30_000);
});

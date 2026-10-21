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
});

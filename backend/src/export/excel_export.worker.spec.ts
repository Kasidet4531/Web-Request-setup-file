jest.mock('node:worker_threads', () => ({
  Worker: jest.fn(),
}));

import { Worker } from 'node:worker_threads';
import { ExcelExportService } from './excel_export.service';

describe('ExcelExportService large export rendering', () => {
  const workerConstructor = Worker as unknown as jest.Mock;

  it('hands large workbook rendering to a worker while the main request loop remains free', async () => {
    const listeners = new Map<string, (message: unknown) => void>();
    const worker = {} as {
      once: jest.Mock;
      postMessage: jest.Mock;
    };
    worker.once = jest.fn(
      (event: string, listener: (message: unknown) => void) => {
        listeners.set(event, listener);
        return worker;
      },
    );
    worker.postMessage = jest.fn();
    workerConstructor.mockImplementation(() => worker);

    const searchIndexService = {
      queryExportRequests: jest.fn().mockResolvedValue({
        items: [
          {
            requestId: 'request-1',
            requestNo: 'PSF-0001',
            status: 'Submitted',
            requester: 'Requester Demo',
            setupOwner: null,
            setupOwnerRole: null,
            productType: null,
            requestDate: '2026-08-20T00:00:00.000Z',
            updatedAt: '2026-08-20T00:00:00.000Z',
            requesterData: {},
            psfCreatedData: {},
            schemaSnapshot: {
              formKey: 'psf-request',
              version: 1,
              title: 'PSF Request Form',
              sections: [],
            },
            canonicalValues: {},
          },
        ],
        total: 1,
        limit: 500,
        offset: 0,
      }),
      extractCanonicalValues: jest.fn(),
      serializeCanonicalValue: jest.fn((value: unknown) =>
        typeof value === 'string' ? value : '',
      ),
    };
    const formSchemaService = {
      getActiveSchema: jest.fn().mockResolvedValue({
        formKey: 'psf-request',
        version: 1,
        title: 'PSF Request Form',
        description: null,
        status: 'active',
        publishedAt: null,
        schema: {
          formKey: 'psf-request',
          version: 1,
          title: 'PSF Request Form',
          sections: [],
        },
      }),
    };
    const service = Reflect.construct(ExcelExportService, [
      searchIndexService,
      formSchemaService,
    ]) as ExcelExportService;

    const exportPromise = service.exportAllRequests(
      { status: 'Submitted' },
      { id: 'admin-1', role: 'admin' },
    );

    for (
      let attempt = 0;
      attempt < 5 && !worker.postMessage.mock.calls.length;
      attempt += 1
    ) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    expect(workerConstructor).toHaveBeenCalledWith(expect.any(String), {
      eval: true,
    });
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    const ordinaryApiResponse = await Promise.resolve({ status: 'ok' });
    expect(ordinaryApiResponse).toEqual({ status: 'ok' });

    listeners.get('message')?.({ content: Uint8Array.from([0x50, 0x4b]) });
    await expect(exportPromise).resolves.toMatchObject({
      content: Buffer.from([0x50, 0x4b]),
    });
  });
});

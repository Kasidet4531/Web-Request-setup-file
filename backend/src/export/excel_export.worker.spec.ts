jest.mock('node:worker_threads', () => ({
  Worker: jest.fn(),
}));

import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import {
  ExcelExportService,
  ExportMemoryLimitException,
} from './excel_export.service';

describe('ExcelExportService large export rendering', () => {
  const workerConstructor = Worker as unknown as jest.Mock;

  it('hands large workbook rendering to a worker while the main request loop remains free', async () => {
    const listeners = new Map<string, (message: unknown) => void>();
    const worker = {} as {
      on: jest.Mock;
      once: jest.Mock;
      postMessage: jest.Mock;
      terminate: jest.Mock;
    };
    worker.once = jest.fn(
      (event: string, listener: (message: unknown) => void) => {
        listeners.set(event, listener);
        return worker;
      },
    );
    worker.on = worker.once;
    worker.terminate = jest.fn().mockResolvedValue(0);
    worker.postMessage = jest.fn((message: { type: string }) => {
      if (message.type === 'page')
        queueMicrotask(() => listeners.get('message')?.({ type: 'accepted' }));
    });
    workerConstructor.mockImplementation(() => worker);

    const searchIndexService = {
      withExportSnapshot: (
        operation: (search: unknown) => Promise<unknown>,
      ): Promise<unknown> => operation(searchIndexService),
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
      attempt < 10 && worker.postMessage.mock.calls.length < 2;
      attempt += 1
    ) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    expect(workerConstructor).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ eval: true }),
    );
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'page',
        items: [expect.objectContaining({ requestNo: 'PSF-0001' })],
      }),
    );

    const ordinaryApiResponse = await Promise.resolve({ status: 'ok' });
    expect(ordinaryApiResponse).toEqual({ status: 'ok' });

    listeners.get('message')?.({
      type: 'complete',
      content: Uint8Array.from([0x50, 0x4b]),
    });
    await expect(exportPromise).resolves.toMatchObject({
      content: Buffer.from([0x50, 0x4b]),
    });
    expect(worker.terminate).toHaveBeenCalled();
  });

  it.each(['page error', 'finish error', 'early exit', 'invalid result'])(
    'rejects %s without returning a partial workbook and terminates the worker',
    async (failure) => {
      const worker = Object.assign(new EventEmitter(), {
        terminate: jest.fn().mockResolvedValue(0),
        postMessage: jest.fn((message: { type: string }) => {
          queueMicrotask(() => {
            if (message.type === 'page') {
              if (failure === 'page error')
                worker.emit('error', new Error('fixture failure'));
              else if (failure === 'early exit') worker.emit('exit', 0);
              else worker.emit('message', { type: 'accepted' });
            } else if (failure === 'finish error')
              worker.emit('message', { type: 'error' });
            else worker.emit('message', { type: 'complete', content: null });
          });
        }),
      });
      workerConstructor.mockImplementation(() => worker);
      const search = {
        withExportSnapshot: (
          operation: (search: unknown) => Promise<unknown>,
        ) => operation(search),
        queryExportRequests: jest
          .fn()
          .mockResolvedValue({ items: [], total: 0 }),
      };
      const forms = {
        getActiveSchema: jest
          .fn()
          .mockResolvedValue({ schema: { sections: [] } }),
      };
      const service = Reflect.construct(ExcelExportService, [
        search,
        forms,
      ]) as ExcelExportService;

      await expect(
        service.exportAllRequests({}, { id: 'admin-1', role: 'admin' }),
      ).rejects.toThrow('Unable to render export workbook.');
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      await service.onModuleDestroy();
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    },
  );

  it('reports a worker stopped by its hard memory limit as the Export Memory Limit', async () => {
    const worker = Object.assign(new EventEmitter(), {
      terminate: jest.fn().mockResolvedValue(0),
      postMessage: jest.fn(() => {
        queueMicrotask(() =>
          worker.emit(
            'error',
            Object.assign(new Error('worker out of memory'), {
              code: 'ERR_WORKER_OUT_OF_MEMORY',
            }),
          ),
        );
      }),
    });
    workerConstructor.mockImplementation(() => worker);
    const search = {
      withExportSnapshot: (operation: (search: unknown) => Promise<unknown>) =>
        operation(search),
      queryExportRequests: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const forms = {
      getActiveSchema: jest
        .fn()
        .mockResolvedValue({ schema: { sections: [] } }),
    };
    const service = Reflect.construct(ExcelExportService, [
      search,
      forms,
    ]) as ExcelExportService;

    await expect(
      service.exportAllRequests({}, { id: 'admin-1', role: 'admin' }),
    ).rejects.toBeInstanceOf(ExportMemoryLimitException);
    expect(workerConstructor).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        resourceLimits: { maxOldGenerationSizeMb: 1024 },
      }),
    );
  });
});

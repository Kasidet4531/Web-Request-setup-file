import {
  Injectable,
  OnModuleDestroy,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import {
  FormSchemaService,
  type FormSchemaJson,
} from '../admin/form_schema.service';
import { PSF_CREATED_INFORMATION_FORM_KEY } from '../admin/form_schema.constants';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import {
  SearchIndexService,
  type RequestExportItem,
  type RequestSearchFilters,
} from '../requests/search-index.service';

export type RequestExportFilters = Pick<
  RequestSearchFilters,
  'status' | 'requestDateFrom' | 'requestDateTo'
>;
export interface RequestExportWorkbook {
  content: Buffer;
  filename: string;
}
type Actor = Pick<AuthenticatedUserProfile, 'id' | 'role'>;

const WORKER_SOURCE = `
  const { parentPort, workerData } = require('node:worker_threads');
  const { appendExportItems, createExportWorkbook } = require(workerData.builderPath);
  const items = [], schemas = new Map();
  parentPort.on('message', async (message) => {
    try {
      if (message.type === 'page') {
        appendExportItems(items, message.items, schemas);
        parentPort.postMessage({ type: 'accepted' });
      } else if (message.type === 'finish') {
        const content = await createExportWorkbook(items, workerData.requesterSchema, workerData.createdSchema, workerData.actor);
        const bytes = Uint8Array.from(content);
        parentPort.postMessage({ type: 'complete', content: bytes }, [bytes.buffer]);
        parentPort.close();
      }
    } catch {
      parentPort.postMessage({ type: 'error' });
      parentPort.close();
    }
  });
`;

class WorkbookWorker {
  private readonly worker: Worker;
  private pending?: {
    type: string;
    resolve: (value: Buffer | undefined) => void;
    reject: (error: Error) => void;
  };
  private failure?: Error;
  private complete = false;

  constructor(
    requesterSchema: FormSchemaJson,
    createdSchema: FormSchemaJson,
    actor: Actor,
  ) {
    const builderPath = require.resolve('./export-workbook');
    this.worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { builderPath, requesterSchema, createdSchema, actor },
      // Development/test execution uses TS sources; compiled production workers
      // resolve the sibling JS module and need no runtime TypeScript dependency.
      execArgv: builderPath.endsWith('.ts')
        ? ['--require', require.resolve('ts-node/register/transpile-only')]
        : [],
    });
    this.worker.on(
      'message',
      (message: { type?: string; content?: Uint8Array }) => {
        if (message.type === 'error') return this.fail();
        if (!this.pending || message.type !== this.pending.type)
          return this.fail();
        const pending = this.pending;
        this.pending = undefined;
        if (message.type === 'complete') {
          if (!(message.content instanceof Uint8Array))
            return pending.reject(this.error());
          this.complete = true;
          pending.resolve(
            Buffer.from(
              message.content.buffer,
              message.content.byteOffset,
              message.content.byteLength,
            ),
          );
        } else pending.resolve(undefined);
      },
    );
    this.worker.once('error', () => this.fail());
    this.worker.once('exit', () => {
      if (!this.complete) this.fail();
    });
  }

  private error() {
    return new Error('Unable to render export workbook.');
  }
  private fail() {
    this.failure = this.error();
    this.pending?.reject(this.failure);
    this.pending = undefined;
  }
  private send(message: object, type: string): Promise<Buffer | undefined> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.pending = { type, resolve, reject };
      try {
        this.worker.postMessage(message);
      } catch {
        this.fail();
      }
    });
  }
  async page(items: RequestExportItem[]) {
    await this.send({ type: 'page', items }, 'accepted');
  }
  async finish(): Promise<Buffer> {
    const result = await this.send({ type: 'finish' }, 'complete');
    if (!result) throw this.error();
    return result;
  }
  async close() {
    this.fail();
    await this.worker.terminate();
  }
}

export function formatRequestExportFilename(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((values, part) => {
      values[part.type] = part.value;
      return values;
    }, {});
  return `psf_requests_${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}${parts.second}.xlsx`;
}

@Injectable()
export class ExcelExportService implements OnModuleDestroy {
  private readonly workers = new Set<WorkbookWorker>();
  constructor(
    private readonly searchIndexService: SearchIndexService,
    private readonly formSchemaService: FormSchemaService,
  ) {}

  exportRequests(
    filters: RequestExportFilters,
    actor: Actor,
    maximumRecords = 2000,
  ): Promise<RequestExportWorkbook> {
    return this.exportWorkbook(filters, actor, maximumRecords);
  }
  exportAllRequests(
    filters: RequestExportFilters,
    actor: Actor,
  ): Promise<RequestExportWorkbook> {
    return this.exportWorkbook(filters, actor);
  }
  async onModuleDestroy() {
    await Promise.all([...this.workers].map((worker) => worker.close()));
  }

  private async exportWorkbook(
    filters: RequestExportFilters,
    actor: Actor,
    maximumRecords?: number,
  ): Promise<RequestExportWorkbook> {
    let worker: WorkbookWorker | undefined;
    try {
      await this.searchIndexService.withExportSnapshot(
        async (search, runner) => {
          const limit = Math.min(maximumRecords ?? 500, 500);
          let result = await search.queryExportRequests(
            { ...filters, limit, offset: 0 },
            actor,
            limit,
          );
          const total = result.total;
          if (maximumRecords !== undefined && total > maximumRecords)
            throw new PayloadTooLargeException(
              `Synchronous exports are limited to ${maximumRecords} requests.`,
            );
          const requesterSchema = await this.formSchemaService.getActiveSchema(
            'psf-request',
            false,
            runner,
          );
          const createdSchema = await this.formSchemaService.getActiveSchema(
            PSF_CREATED_INFORMATION_FORM_KEY,
            false,
            runner,
          );
          worker = new WorkbookWorker(
            requesterSchema.schema,
            createdSchema.schema,
            actor,
          );
          this.workers.add(worker);
          let offset = 0;
          for (;;) {
            if (result.items.length === 0 && offset < total)
              throw new Error(
                'Export data ended before the expected row count.',
              );
            await worker.page(result.items);
            offset += result.items.length;
            if (offset >= total) break;
            result = await search.queryExportRequests(
              { ...filters, limit, offset },
              actor,
              limit,
            );
          }
        },
      );
      // The read transaction is committed before CPU-heavy row formatting/ZIP.
      if (!worker) throw new Error('Unable to initialize export workbook.');
      const content = await worker.finish();
      return { content, filename: formatRequestExportFilename(new Date()) };
    } finally {
      if (worker) {
        this.workers.delete(worker);
        await worker.close();
      }
    }
  }
}

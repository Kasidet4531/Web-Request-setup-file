import {
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
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
import { createExportTable, type ExportCell } from './export-table';

export type RequestExportFilters = Pick<
  RequestSearchFilters,
  'status' | 'requestDateFrom' | 'requestDateTo'
>;
export interface RequestExportWorkbook {
  content: Buffer;
  filename: string;
}
type Actor = Pick<AuthenticatedUserProfile, 'id' | 'role'>;

export const DEFAULT_SYNC_THRESHOLD = 10000;
export const EXPORT_PREVIEW_ROWS = 10;

export interface RequestExportPreview {
  total: number;
  headers: string[];
  rows: ExportCell[][];
}
const DEFAULT_SYNC_MAX_CONCURRENT = 2;
const DEFAULT_WORKER_MAX_MEMORY_MB = 1024;
// A worker needs roughly 25 MB (70 MB from TypeScript sources) just to load the
// builder, and a hard limit below what V8 needs to start aborts the whole
// process. Smaller settings are still enforced by the builder's own check.
const MINIMUM_WORKER_HARD_LIMIT_MB = 128;

export class ExportMemoryLimitException extends PayloadTooLargeException {
  constructor() {
    super(
      'This export needs more memory than EXPORT_WORKER_MAX_MEMORY_MB allows. Narrow the filters, or ask an administrator to raise EXPORT_WORKER_MAX_MEMORY_MB.',
    );
  }
}

const WORKER_SOURCE = `
  const { parentPort, workerData } = require('node:worker_threads');
  const { appendExportItems, createExportWorkbook, WorkbookMemoryLimitError } = require(workerData.builderPath);
  const items = [], schemas = new Map();
  parentPort.on('message', async (message) => {
    try {
      if (message.type === 'page') {
        appendExportItems(items, message.items, schemas, workerData.memoryLimitMb);
        parentPort.postMessage({ type: 'accepted' });
      } else if (message.type === 'finish') {
        const content = await createExportWorkbook(items, workerData.requesterSchema, workerData.createdSchema, workerData.memoryLimitMb);
        const bytes = Uint8Array.from(content);
        parentPort.postMessage({ type: 'complete', content: bytes }, [bytes.buffer]);
        parentPort.close();
      }
    } catch (error) {
      parentPort.postMessage({ type: error instanceof WorkbookMemoryLimitError ? 'memory-limit' : 'error' });
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
    memoryLimitMb: number,
  ) {
    const builderPath = require.resolve('./export-workbook');
    const fromTypeScript = builderPath.endsWith('.ts');
    this.worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        builderPath,
        requesterSchema,
        createdSchema,
        memoryLimitMb,
      },
      resourceLimits: {
        maxOldGenerationSizeMb: Math.max(
          memoryLimitMb,
          MINIMUM_WORKER_HARD_LIMIT_MB,
        ),
      },
      // Development/test execution uses TS sources; compiled production workers
      // resolve the sibling JS module and need no runtime TypeScript dependency.
      execArgv: fromTypeScript
        ? ['--require', require.resolve('ts-node/register/transpile-only')]
        : [],
      // ts-node otherwise looks for tsconfig.json from the working directory,
      // which need not be the backend when the app starts elsewhere.
      env: fromTypeScript
        ? {
            ...process.env,
            TS_NODE_PROJECT:
              process.env.TS_NODE_PROJECT ??
              join(__dirname, '../../tsconfig.json'),
          }
        : process.env,
    });
    this.worker.on(
      'message',
      (message: { type?: string; content?: Uint8Array }) => {
        if (message.type === 'memory-limit')
          return this.fail(new ExportMemoryLimitException());
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
    this.worker.once('error', (error: { code?: string }) =>
      this.fail(
        error.code === 'ERR_WORKER_OUT_OF_MEMORY'
          ? new ExportMemoryLimitException()
          : undefined,
      ),
    );
    this.worker.once('exit', () => {
      if (!this.complete) this.fail();
    });
  }

  private error() {
    return new Error('Unable to render export workbook.');
  }
  // The first failure is the cause; the worker's exit that follows keeps it.
  private fail(error: Error = this.error()) {
    this.failure ??= error;
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
  private readonly logger = new Logger(ExcelExportService.name);
  private readonly workers = new Set<WorkbookWorker>();
  private runningDirectExports = 0;
  constructor(
    private readonly searchIndexService: SearchIndexService,
    private readonly formSchemaService: FormSchemaService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  exportRequests(
    filters: RequestExportFilters,
    actor: Actor,
    maximumRecords = DEFAULT_SYNC_THRESHOLD,
  ): Promise<RequestExportWorkbook> {
    return this.exportWorkbook(filters, actor, maximumRecords);
  }
  exportAllRequests(
    filters: RequestExportFilters,
    actor: Actor,
  ): Promise<RequestExportWorkbook> {
    return this.exportWorkbook(filters, actor);
  }
  // The Export Preview: the file's own columns and its first rows, read from
  // one snapshot, so it matches the file the same filters download.
  async previewRequests(
    filters: RequestExportFilters,
    rowLimit = EXPORT_PREVIEW_ROWS,
  ): Promise<RequestExportPreview> {
    return this.searchIndexService.withExportSnapshot(
      async (search, runner) => {
        // Discovering every captured form first lets the page reuse them.
        const captured = await search.queryExportSchemas(filters);
        const page = await search.queryExportRequests(
          { ...filters, limit: rowLimit, offset: 0 },
          rowLimit,
        );
        // One snapshot connection runs one query at a time.
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
        const table = createExportTable(
          [requesterSchema.schema, ...captured.requester],
          [createdSchema.schema, ...captured.created],
        );
        return {
          total: page.total,
          headers: table.headers,
          rows: page.items.map((item) => table.row(item)),
        };
      },
    );
  }
  // A Direct Export answers the HTTP request itself. Null means every
  // EXPORT_SYNC_MAX_CONCURRENT slot in this backend process is busy, so the
  // caller queues an Export Job instead.
  async tryDirectExport(
    filters: RequestExportFilters,
    actor: Actor,
    maximumRecords?: number,
  ): Promise<RequestExportWorkbook | null> {
    if (
      this.runningDirectExports >=
      this.positiveInteger(
        'EXPORT_SYNC_MAX_CONCURRENT',
        DEFAULT_SYNC_MAX_CONCURRENT,
      )
    )
      return null;
    this.runningDirectExports++;
    try {
      return await this.exportRequests(filters, actor, maximumRecords);
    } finally {
      this.runningDirectExports--;
    }
  }
  async onModuleDestroy() {
    await Promise.all([...this.workers].map((worker) => worker.close()));
  }

  private async exportWorkbook(
    filters: RequestExportFilters,
    actor: Actor,
    maximumRecords?: number,
  ): Promise<RequestExportWorkbook> {
    const memoryLimitMb = this.positiveInteger(
      'EXPORT_WORKER_MAX_MEMORY_MB',
      DEFAULT_WORKER_MAX_MEMORY_MB,
    );
    let worker: WorkbookWorker | undefined;
    try {
      await this.searchIndexService.withExportSnapshot(
        async (search, runner) => {
          const limit = Math.min(maximumRecords ?? 500, 500);
          let result = await search.queryExportRequests(
            { ...filters, limit, offset: 0 },
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
            memoryLimitMb,
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
              limit,
            );
          }
        },
      );
      // The read transaction is committed before CPU-heavy row formatting/ZIP.
      if (!worker) throw new Error('Unable to initialize export workbook.');
      const content = await worker.finish();
      return { content, filename: formatRequestExportFilename(new Date()) };
    } catch (error) {
      if (error instanceof ExportMemoryLimitException)
        this.logger.warn(
          `An export for user ${actor.id} stopped at EXPORT_WORKER_MAX_MEMORY_MB=${memoryLimitMb}.`,
        );
      throw error;
    } finally {
      if (worker) {
        this.workers.delete(worker);
        await worker.close();
      }
    }
  }

  // Like EXPORT_SYNC_THRESHOLD: fractions are truncated, and empty or
  // invalid settings fall back to the default.
  private positiveInteger(key: string, fallback: number): number {
    const value = Math.trunc(
      Number(this.configService?.get<string | number>(key)),
    );
    return value > 0 ? value : fallback;
  }
}

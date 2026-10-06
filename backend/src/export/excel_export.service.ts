import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Worker } from 'node:worker_threads';
import {
  FormSchemaService,
  type FormSchemaField,
  type FormSchemaJson,
} from '../admin/form_schema.service';
import {
  PSF_CREATED_INFORMATION_FORM_KEY,
  resolvePsfCreatedInformationSchema,
} from '../admin/form_schema.constants';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import { canActorViewPsfCreatedData } from '../requests/requests.service';
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

const SYNCHRONOUS_EXPORT_LIMIT = 2000;
const ASYNCHRONOUS_EXPORT_PAGE_SIZE = 500;
const ASYNCHRONOUS_EXPORT_YIELD_INTERVAL = 100;

const EXPORT_WORKBOOK_WORKER_SOURCE = `
  const { parentPort } = require('node:worker_threads');
  const ExcelJS = require('exceljs');

  parentPort.once('message', async ({ columns, rows }) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('PSF Requests');
      worksheet.columns = columns;
      rows.forEach((row) => worksheet.addRow(row));
      const content = await workbook.xlsx.writeBuffer();
      parentPort.postMessage({ content: Buffer.from(content) });
    } catch {
      parentPort.postMessage({ error: true });
    }
  });
`;

interface ExportWorksheetColumn {
  header: string;
  key: string;
}

const REQUEST_METADATA_COLUMNS: Array<{
  header: string;
  key: string;
  read: (item: RequestExportItem) => unknown;
}> = [
  { header: 'Request No', key: 'requestNo', read: (item) => item.requestNo },
  { header: 'Status', key: 'status', read: (item) => item.status },
  {
    header: 'Setup File Owner',
    key: 'setupOwner',
    read: (item) => item.setupOwner,
  },
  {
    header: 'Setup File Owner Role',
    key: 'setupOwnerRole',
    read: (item) => item.setupOwnerRole,
  },
  {
    header: 'Request Date',
    key: 'requestDate',
    read: (item) => item.requestDate,
  },
  {
    header: 'Updated At',
    key: 'updatedAt',
    read: (item) => item.updatedAt,
  },
];

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
export class ExcelExportService {
  constructor(
    private readonly searchIndexService: SearchIndexService,
    private readonly formSchemaService: FormSchemaService,
  ) {}

  async exportRequests(
    filters: RequestExportFilters,
    actor: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
    maximumRecords = SYNCHRONOUS_EXPORT_LIMIT,
  ): Promise<RequestExportWorkbook> {
    const result = await this.searchIndexService.queryExportRequests(
      {
        ...filters,
        limit: maximumRecords,
        offset: 0,
      },
      actor,
      maximumRecords,
    );

    if (result.total > maximumRecords) {
      throw new PayloadTooLargeException(
        `Synchronous exports are limited to ${maximumRecords} requests.`,
      );
    }

    return this.createWorkbook(result.items, actor);
  }

  async exportAllRequests(
    filters: RequestExportFilters,
    actor: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
  ): Promise<RequestExportWorkbook> {
    const items: RequestExportItem[] = [];
    let offset = 0;
    let total = 0;

    do {
      const result = await this.searchIndexService.queryExportRequests(
        {
          ...filters,
          limit: ASYNCHRONOUS_EXPORT_PAGE_SIZE,
          offset,
        },
        actor,
        ASYNCHRONOUS_EXPORT_PAGE_SIZE,
      );
      items.push(...result.items);
      offset += result.items.length;
      total = result.total;

      if (result.items.length === 0) {
        break;
      }
    } while (offset < total);

    return this.createWorkbook(items, actor, true);
  }

  private async createWorkbook(
    items: RequestExportItem[],
    actor: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
    renderInWorker = false,
  ): Promise<RequestExportWorkbook> {
    const activeSchema =
      await this.formSchemaService.getActiveSchema('psf-request');
    const requesterFields = this.getExportableFields({
      ...activeSchema.schema,
      sections: [
        ...activeSchema.schema.sections,
        ...items.flatMap((item) => item.schemaSnapshot.sections),
      ],
    });
    const activePsfCreatedSchema = await this.formSchemaService.getActiveSchema(
      PSF_CREATED_INFORMATION_FORM_KEY,
    );
    const psfCreatedFields = this.getPsfCreatedFields(
      activePsfCreatedSchema.schema,
      items,
    );

    const columns: ExportWorksheetColumn[] = [
      ...REQUEST_METADATA_COLUMNS.map(({ header, key }) => ({ header, key })),
      ...requesterFields.map((field, index) => ({
        header: field.label,
        key: `requester-${index}`,
      })),
      ...psfCreatedFields.map((field, index) => ({
        header: field.label,
        key: `psf-created-${index}`,
      })),
    ];
    const rows: string[][] = [];

    for (const [index, item] of items.entries()) {
      const canonicalValues =
        item.canonicalValues ??
        this.searchIndexService.extractCanonicalValues(
          item.schemaSnapshot,
          item.requesterData,
        );
      const psfCreatedDataVisible = canActorViewPsfCreatedData(
        item.status,
        actor,
        item.psfReleasedAt,
      );
      const psfCreatedCanonicalValues = this.getPsfCreatedCanonicalValues(item);

      rows.push([
        ...REQUEST_METADATA_COLUMNS.map((column) =>
          column.key === 'status'
            ? item.status
            : this.searchIndexService.serializeCanonicalValue(
                column.read(item),
              ),
        ),
        ...requesterFields.map((field) =>
          this.searchIndexService.serializeCanonicalValue(
            canonicalValues[field.canonicalKey],
          ),
        ),
        ...psfCreatedFields.map((field) =>
          psfCreatedDataVisible
            ? this.searchIndexService.serializeCanonicalValue(
                psfCreatedCanonicalValues.get(field.canonicalKey),
              )
            : '',
        ),
      ]);
      if (
        renderInWorker &&
        (index + 1) % ASYNCHRONOUS_EXPORT_YIELD_INTERVAL === 0
      ) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    const content = renderInWorker
      ? await this.renderWorkbookInWorker(columns, rows)
      : await this.renderWorkbookInProcess(columns, rows);

    return {
      content,
      filename: formatRequestExportFilename(new Date()),
    };
  }

  private async renderWorkbookInProcess(
    columns: ExportWorksheetColumn[],
    rows: string[][],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PSF Requests');
    worksheet.columns = columns;
    rows.forEach((row) => worksheet.addRow(row));

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private renderWorkbookInWorker(
    columns: ExportWorksheetColumn[],
    rows: string[][],
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const worker = new Worker(EXPORT_WORKBOOK_WORKER_SOURCE, { eval: true });
      let settled = false;
      const fail = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Unable to render export workbook.'));
        }
      };
      const succeed = (content: Buffer) => {
        if (!settled) {
          settled = true;
          resolve(content);
        }
      };

      worker.once('message', (message: unknown) => {
        if (!message || typeof message !== 'object') {
          fail();
          return;
        }

        const content = (message as { content?: unknown }).content;
        if (!(content instanceof Uint8Array)) {
          fail();
          return;
        }

        succeed(Buffer.from(content));
      });
      worker.once('error', fail);
      worker.once('exit', () => {
        fail();
      });
      worker.postMessage({ columns, rows });
    });
  }

  private getExportableFields(schema: FormSchemaJson): FormSchemaField[] {
    const canonicalKeys = new Set<string>();
    const fields: FormSchemaField[] = [];

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        const canonicalKey = field.canonicalKey?.trim();

        if (
          field.exportable !== true ||
          !canonicalKey ||
          canonicalKeys.has(canonicalKey)
        ) {
          return;
        }

        canonicalKeys.add(canonicalKey);
        fields.push(field);
      });
    });

    return fields;
  }

  private getPsfCreatedFields(
    activeSchema: FormSchemaJson,
    items: RequestExportItem[],
  ): FormSchemaField[] {
    const fieldsByCanonicalKey = new Map<string, FormSchemaField>();

    [
      activeSchema,
      ...items.map((item) =>
        resolvePsfCreatedInformationSchema(item.psfCreatedInformationSchema),
      ),
    ].forEach((schema) => {
      schema.sections.forEach((section) => {
        section.fields.forEach((field) => {
          const canonicalKey = field.canonicalKey?.trim();
          if (canonicalKey && !fieldsByCanonicalKey.has(canonicalKey)) {
            fieldsByCanonicalKey.set(canonicalKey, { ...field, canonicalKey });
          }
        });
      });
    });

    return [...fieldsByCanonicalKey.values()];
  }

  private getPsfCreatedCanonicalValues(
    item: RequestExportItem,
  ): Map<string, unknown> {
    const schema = resolvePsfCreatedInformationSchema(
      item.psfCreatedInformationSchema,
    );
    const values = new Map<string, unknown>();

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        const canonicalKey = field.canonicalKey?.trim();
        if (canonicalKey) {
          values.set(canonicalKey, item.psfCreatedData[field.fieldKey]);
        }
      });
    });

    return values;
  }
}

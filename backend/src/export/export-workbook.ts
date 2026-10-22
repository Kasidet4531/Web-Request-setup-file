import ExcelJS from 'exceljs';
import { PassThrough, Transform } from 'node:stream';
import { getHeapStatistics } from 'node:v8';
import type { FormSchemaJson } from '../admin/form_schema.service';
import { resolvePsfCreatedInformationSchema } from '../admin/form_schema.constants';
import type { RequestExportItem } from '../requests/search-index.service';
import { createExportTable } from './export-table';

export class WorkbookMemoryLimitError extends Error {}

// The worker's resourceLimits is the hard cap, but a process-wide
// --max-old-space-size (for example in NODE_OPTIONS) silently replaces it,
// so the builder also checks its own heap between pages and rows. The heap
// it reads includes garbage not yet collected, so the check is approximate.
export function assertWithinMemoryLimit(memoryLimitMb: number) {
  if (getHeapStatistics().used_heap_size > memoryLimitMb * 1024 * 1024)
    throw new WorkbookMemoryLimitError();
}

// Structured clone preserves references within a page. Intern only each distinct
// page schema by its complete content; version equality is never sufficient.
export function appendExportItems(
  target: RequestExportItem[],
  page: RequestExportItem[],
  cache: Map<string, FormSchemaJson>,
  memoryLimitMb: number,
) {
  const pageSchemas = new Map<FormSchemaJson, FormSchemaJson>();
  const intern = (schema: FormSchemaJson) => {
    let stored = pageSchemas.get(schema);
    if (!stored) {
      const key = JSON.stringify(schema);
      stored = cache.get(key) || schema;
      cache.set(key, stored);
      pageSchemas.set(schema, stored);
    }
    return stored;
  };
  for (const item of page) {
    item.schemaSnapshot = intern(item.schemaSnapshot);
    item.psfCreatedInformationSchema = intern(
      resolvePsfCreatedInformationSchema(item.psfCreatedInformationSchema),
    );
    target.push(item);
  }
  assertWithinMemoryLimit(memoryLimitMb);
}

export async function createExportWorkbook(
  items: RequestExportItem[],
  activeRequester: FormSchemaJson,
  activeCreated: FormSchemaJson,
  memoryLimitMb: number,
): Promise<Buffer> {
  const requesterSchemas = new Set([activeRequester]);
  const createdSchemas = new Set([activeCreated]);
  for (const item of items) {
    requesterSchemas.add(item.schemaSnapshot);
    createdSchemas.add(
      resolvePsfCreatedInformationSchema(item.psfCreatedInformationSchema),
    );
  }
  const table = createExportTable(requesterSchemas, createdSchemas);

  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  const collected = new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });
  // Attach a rejection handler before commit, so stream errors cannot become
  // unhandled while ExcelJS is still finishing the ZIP.
  void collected.catch(() => {});
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useSharedStrings: true,
    useStyles: true,
    zip: { zlib: { level: 1 } },
  });
  const zip = Reflect.get(workbook, 'zip') as {
    append(input: unknown, options: { name?: string }): unknown;
  };
  const append = zip.append.bind(zip);
  zip.append = (input, options) => {
    const xml = /^\/?xl\/(worksheets\/sheet\d+|sharedStrings)\.xml$/.test(
      options.name || '',
    );
    if (xml && typeof input === 'string')
      return append(input.replace(/\r/g, '&#13;'), options);
    if (
      input &&
      typeof input === 'object' &&
      (Reflect.get(input, 'constructor') as { name?: string } | undefined)
        ?.name === 'StreamBuf'
    ) {
      // ExcelJS 4.4 StreamBuf.pipe() returns undefined; archiver-utils 5 expects
      // a Node stream. The bridge also preserves CR bytes without decoding UTF-8.
      const bridge = xml
        ? new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              const pieces: Buffer[] = [];
              let start = 0;
              for (
                let at = chunk.indexOf(13);
                at !== -1;
                at = chunk.indexOf(13, start)
              ) {
                pieces.push(chunk.subarray(start, at), Buffer.from('&#13;'));
                start = at + 1;
              }
              callback(
                null,
                pieces.length
                  ? Buffer.concat([...pieces, chunk.subarray(start)])
                  : chunk,
              );
            },
          })
        : new PassThrough();
      (
        input as {
          pipe(destination: unknown): void;
          on(event: string, listener: (error: Error) => void): void;
        }
      ).on('error', (error) => bridge.destroy(error));
      (input as { pipe(destination: unknown): void }).pipe(bridge);
      return append(bridge, options);
    }
    return append(input, options);
  };
  try {
    const sheet = workbook.addWorksheet('PSF Requests');
    const headers = table.headers;
    sheet.columns = headers.map((header, index) => ({
      header,
      key: String(index),
      width:
        index === 1
          ? 36
          : index === 2 || index === 3
            ? 26
            : header.startsWith('12NC')
              ? 30
              : Math.min(42, Math.max(22, header.length + 2)),
    }));
    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      },
      alignment: { vertical: 'middle', wrapText: true },
    };
    // Reuse the same style objects so ExcelJS caches a fixed number of styles,
    // even for millions of cells. Styles do not change cell values or types.
    const rowStyles: Partial<ExcelJS.Style>[] = ['FFFFFFFF', 'FFEAF2F8'].map(
      (argb) => ({
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb } },
      }),
    );
    const header = sheet.getRow(1);
    header.height = 32;
    header.eachCell((cell) => {
      cell.style = headerStyle;
    });
    for (let index = 0; index < items.length; index++) {
      const row = sheet.addRow(table.row(items[index]));
      row.eachCell((cell) => {
        cell.style = rowStyles[index % 2];
      });
      row.commit();
      if ((index + 1) % 500 === 0) {
        assertWithinMemoryLimit(memoryLimitMb);
        await new Promise<void>((done) => setImmediate(done));
      }
    }
    sheet.commit();
    assertWithinMemoryLimit(memoryLimitMb);
    await workbook.commit();
    return await collected;
  } catch (error) {
    stream.destroy(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

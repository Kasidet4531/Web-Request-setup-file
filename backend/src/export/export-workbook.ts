import ExcelJS from 'exceljs';
import { PassThrough, Transform } from 'node:stream';
import type {
  FormSchemaField,
  FormSchemaJson,
} from '../admin/form_schema.service';
import { resolvePsfCreatedInformationSchema } from '../admin/form_schema.constants';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import { isNumericText } from '../requests/form-data-validation';
import { canActorViewPsfCreatedData } from '../requests/requests.service';
import {
  extractCanonicalValues,
  serializeCanonicalValue,
  type RequestExportItem,
} from '../requests/search-index.service';

export function exportCell(
  field: Pick<FormSchemaField, 'type'>,
  value: unknown,
): string | number {
  const text = serializeCanonicalValue(value);
  return field.type === 'number' && isNumericText(text) ? Number(text) : text;
}

// Structured clone preserves references within a page. Intern only each distinct
// page schema by its complete content; version equality is never sufficient.
export function appendExportItems(
  target: RequestExportItem[],
  page: RequestExportItem[],
  cache: Map<string, FormSchemaJson>,
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
}

function fields(
  schemas: Iterable<FormSchemaJson>,
  requester: boolean,
): FormSchemaField[] {
  const selected = new Map<string, FormSchemaField>();
  for (const schema of schemas)
    for (const section of schema.sections)
      for (const field of section.fields) {
        const key = field.canonicalKey?.trim();
        if (
          key &&
          (!requester || field.exportable === true) &&
          !selected.has(key)
        )
          selected.set(
            key,
            requester ? field : { ...field, canonicalKey: key },
          );
      }
  return [...selected.values()];
}

export async function createExportWorkbook(
  items: RequestExportItem[],
  activeRequester: FormSchemaJson,
  activeCreated: FormSchemaJson,
  actor: Pick<AuthenticatedUserProfile, 'id' | 'role'>,
): Promise<Buffer> {
  const requesterSchemas = new Set([activeRequester]);
  const createdSchemas = new Set([activeCreated]);
  for (const item of items) {
    requesterSchemas.add(item.schemaSnapshot);
    createdSchemas.add(
      resolvePsfCreatedInformationSchema(item.psfCreatedInformationSchema),
    );
  }
  const requesterFields = fields(requesterSchemas, true);
  const createdFields = fields(createdSchemas, false);
  const psfKeys = new Map<FormSchemaJson, Map<string, string>>();
  for (const schema of createdSchemas) {
    const mapping = new Map<string, string>();
    for (const section of schema.sections)
      for (const field of section.fields)
        if (field.canonicalKey?.trim())
          mapping.set(field.canonicalKey.trim(), field.fieldKey);
    psfKeys.set(schema, mapping);
  }

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
    useStyles: false,
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
    const headers = [
      'Request No',
      'Status',
      'Request Date',
      'Updated At',
      ...requesterFields.map((field) => field.label),
      ...createdFields.map((field) => field.label),
    ];
    sheet.columns = headers.map((header, index) => ({
      header,
      key: String(index),
    }));
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const canonical =
        item.canonicalValues ??
        extractCanonicalValues(item.schemaSnapshot, item.requesterData);
      const schema = resolvePsfCreatedInformationSchema(
        item.psfCreatedInformationSchema,
      );
      const mapping = psfKeys.get(schema)!;
      const visible = canActorViewPsfCreatedData(
        item.status,
        actor,
        item.psfReleasedAt,
      );
      sheet
        .addRow([
          serializeCanonicalValue(item.requestNo),
          item.status,
          serializeCanonicalValue(item.requestDate),
          serializeCanonicalValue(item.updatedAt),
          ...requesterFields.map((field) =>
            exportCell(field, canonical[field.canonicalKey]),
          ),
          ...createdFields.map((field) => {
            const key = mapping.get(field.canonicalKey);
            return visible
              ? exportCell(
                  field,
                  key === undefined ? undefined : item.psfCreatedData[key],
                )
              : '';
          }),
        ])
        .commit();
      if ((index + 1) % 500 === 0)
        await new Promise<void>((done) => setImmediate(done));
    }
    sheet.commit();
    await workbook.commit();
    return await collected;
  } catch (error) {
    stream.destroy(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

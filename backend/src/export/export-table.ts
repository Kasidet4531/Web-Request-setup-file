import type {
  FormSchemaField,
  FormSchemaJson,
} from '../admin/form_schema.service';
import { resolvePsfCreatedInformationSchema } from '../admin/form_schema.constants';
import { isNumericText } from '../requests/form-data-validation';
import {
  serializeCanonicalValue,
  type RequestExportItem,
} from '../requests/search-index.service';

export type ExportCell = string | number;

// Shown in the export, never stored, wherever a request has no value.
export const NO_VALUE = 'NA';

// The system records Modified By under this key on every save, whether or not
// a form version has the field (see RequestsService), so it is a metadata
// column rather than a form field.
const MODIFIED_BY = 'modified_by';

export interface ExportTable {
  headers: string[];
  row(item: RequestExportItem): ExportCell[];
}

export function exportCell(
  field: Pick<FormSchemaField, 'type'>,
  value: unknown,
): ExportCell {
  const text = serializeCanonicalValue(value);
  return field.type === 'number' && isNumericText(text) ? Number(text) : text;
}

// Every field of every given form version, once per canonical key, in the
// order the versions are given: the active form first, then captured ones.
function columnFields(
  schemas: Iterable<FormSchemaJson>,
  metadataKeys: string[] = [],
): FormSchemaField[] {
  const selected = new Map<string, FormSchemaField>();
  for (const schema of schemas)
    for (const section of schema.sections)
      for (const field of section.fields) {
        const key = field.canonicalKey?.trim();
        if (key && !metadataKeys.includes(key) && !selected.has(key))
          selected.set(key, { ...field, canonicalKey: key });
      }
  return [...selected.values()];
}

// Maps each canonical key to the field key a request's own form version
// stored its value under.
function fieldKeysOf(
  cache: Map<FormSchemaJson, Map<string, string>>,
  schema: FormSchemaJson,
): Map<string, string> {
  let mapping = cache.get(schema);
  if (!mapping) {
    mapping = new Map();
    for (const section of schema.sections)
      for (const field of section.fields)
        if (field.canonicalKey?.trim())
          mapping.set(field.canonicalKey.trim(), field.fieldKey);
    cache.set(schema, mapping);
  }
  return mapping;
}

// The columns and cells of an export, shared by the workbook and the Export
// Preview. Values are read from each request's current data through its own
// form version, so a later save is always reflected. PSF Created Information
// is exported to every role, released or not (ADR 0019).
export function createExportTable(
  requesterSchemas: Iterable<FormSchemaJson>,
  createdSchemas: Iterable<FormSchemaJson>,
): ExportTable {
  const requesterFields = columnFields(requesterSchemas, [MODIFIED_BY]);
  const createdFields = columnFields(createdSchemas);
  const fieldKeys = new Map<FormSchemaJson, Map<string, string>>();
  return {
    headers: [
      'Request No',
      'Status',
      'Request Date',
      'Updated At',
      'Modified By',
      ...requesterFields.map((field) => field.label),
      ...createdFields.map((field) => field.label),
    ],
    row(item) {
      const requesterKeys = fieldKeysOf(fieldKeys, item.schemaSnapshot);
      const createdKeys = fieldKeysOf(
        fieldKeys,
        resolvePsfCreatedInformationSchema(item.psfCreatedInformationSchema),
      );
      const value = (
        data: Record<string, unknown>,
        keys: Map<string, string>,
        field: FormSchemaField,
      ) => {
        const key = keys.get(field.canonicalKey);
        return exportCell(field, key === undefined ? undefined : data[key]);
      };
      const cells: ExportCell[] = [
        serializeCanonicalValue(item.requestNo),
        item.status,
        serializeCanonicalValue(item.requestDate),
        serializeCanonicalValue(item.updatedAt),
        serializeCanonicalValue(item.requesterData[MODIFIED_BY]),
        ...requesterFields.map((field) =>
          value(item.requesterData, requesterKeys, field),
        ),
        ...createdFields.map((field) =>
          value(item.psfCreatedData, createdKeys, field),
        ),
      ];
      return cells.map((cell) => (cell === '' ? NO_VALUE : cell));
    },
  };
}

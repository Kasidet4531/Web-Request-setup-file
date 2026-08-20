import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  FormSchemaService,
  type FormSchemaField,
  type FormSchemaJson,
} from '../admin/form_schema.service';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import {
  PSF_CREATED_INFORMATION_SCHEMA,
  canActorViewPsfCreatedData,
} from '../requests/requests.service';
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

// ponytail: synchronous export limit 2000; add GI-25 async jobs when volume exceeds it.
const SYNCHRONOUS_EXPORT_LIMIT = 2000;

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
    actor: AuthenticatedUserProfile,
  ): Promise<RequestExportWorkbook> {
    const result = await this.searchIndexService.queryExportRequests(
      {
        ...filters,
        limit: SYNCHRONOUS_EXPORT_LIMIT,
        offset: 0,
      },
      actor,
      SYNCHRONOUS_EXPORT_LIMIT,
    );

    if (result.total > SYNCHRONOUS_EXPORT_LIMIT) {
      throw new PayloadTooLargeException(
        `Synchronous exports are limited to ${SYNCHRONOUS_EXPORT_LIMIT} requests.`,
      );
    }

    const activeSchema =
      await this.formSchemaService.getActiveSchema('psf-request');
    const requesterFields = this.getExportableFields(
      activeSchema.schema,
      actor,
    );
    const psfCreatedFields = this.getAllPsfCreatedFields();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PSF Requests');
    worksheet.columns = [
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

    result.items.forEach((item) => {
      const canonicalValues =
        item.canonicalValues ??
        this.searchIndexService.extractCanonicalValues(
          item.schemaSnapshot,
          item.requesterData,
        );
      const psfCreatedDataVisible = canActorViewPsfCreatedData(
        item.status,
        actor,
      );

      worksheet.addRow([
        ...REQUEST_METADATA_COLUMNS.map((column) =>
          this.searchIndexService.serializeCanonicalValue(column.read(item)),
        ),
        ...requesterFields.map((field) =>
          this.searchIndexService.serializeCanonicalValue(
            canonicalValues[field.canonicalKey],
          ),
        ),
        ...psfCreatedFields.map((field) =>
          psfCreatedDataVisible
            ? this.searchIndexService.serializeCanonicalValue(
                item.psfCreatedData[field.fieldKey],
              )
            : '',
        ),
      ]);
    });

    return {
      content: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: formatRequestExportFilename(new Date()),
    };
  }

  private getExportableFields(
    schema: FormSchemaJson,
    actor: Pick<AuthenticatedUserProfile, 'role'>,
  ): FormSchemaField[] {
    const canonicalKeys = new Set<string>();
    const fields: FormSchemaField[] = [];

    schema.sections.forEach((section) => {
      if (!section.visibleTo.includes(actor.role)) {
        return;
      }

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

  private getAllPsfCreatedFields(): FormSchemaField[] {
    return PSF_CREATED_INFORMATION_SCHEMA.sections.flatMap(
      (section) => section.fields,
    );
  }
}

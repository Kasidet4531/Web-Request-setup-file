import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  SearchIndexService,
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
  constructor(private readonly searchIndexService: SearchIndexService) {}

  async exportRequests(
    filters: RequestExportFilters = {},
  ): Promise<RequestExportWorkbook> {
    const result = await this.searchIndexService.queryRequests(
      {
        ...filters,
        limit: SYNCHRONOUS_EXPORT_LIMIT,
        offset: 0,
      },
      SYNCHRONOUS_EXPORT_LIMIT,
    );

    if (result.total > SYNCHRONOUS_EXPORT_LIMIT) {
      throw new PayloadTooLargeException(
        `Synchronous exports are limited to ${SYNCHRONOUS_EXPORT_LIMIT} requests.`,
      );
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PSF Requests');
    worksheet.columns = [
      { header: 'Request No', key: 'requestNo' },
      { header: 'Title', key: 'title' },
      { header: 'Reference PSF Name', key: 'referencePsfName' },
      { header: 'Status', key: 'status' },
      { header: 'Priority', key: 'priority' },
      { header: 'Requester', key: 'requester' },
      { header: 'Setup File Owner', key: 'setupOwner' },
      { header: 'Setup File Owner Role', key: 'setupOwnerRole' },
      { header: 'Product Type', key: 'productType' },
      { header: 'Request Date', key: 'requestDate' },
      { header: 'Due Date', key: 'dueDate' },
      { header: 'Updated At', key: 'updatedAt' },
    ];

    result.items.forEach((item) => {
      worksheet.addRow({
        requestNo: item.requestNo,
        title: item.title ?? '',
        referencePsfName: item.referencePsfName ?? '',
        status: item.status,
        priority: item.priority ?? '',
        requester: item.requester ?? '',
        setupOwner: item.setupOwner ?? '',
        setupOwnerRole: item.setupOwnerRole ?? '',
        productType: item.productType ?? '',
        requestDate: item.requestDate ?? '',
        dueDate: item.dueDate ?? '',
        updatedAt: item.updatedAt,
      });
    });

    return {
      content: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: formatRequestExportFilename(new Date()),
    };
  }
}

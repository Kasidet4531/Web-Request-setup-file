import ExcelJS from 'exceljs';
import { PayloadTooLargeException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SearchIndexService } from '../requests/search-index.service';
import {
  ExcelExportService,
  formatRequestExportFilename,
} from './excel_export.service';

describe('ExcelExportService', () => {
  let searchIndexService: { queryRequests: jest.Mock };
  let service: ExcelExportService;

  beforeEach(() => {
    searchIndexService = {
      queryRequests: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 2000,
        offset: 0,
      }),
    };
    service = Reflect.construct(ExcelExportService, [
      searchIndexService,
    ]) as ExcelExportService;
  });

  it('is resolvable by Nest with only the search index dependency', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExcelExportService,
        { provide: SearchIndexService, useValue: searchIndexService },
      ],
    }).compile();

    expect(module.get(ExcelExportService)).toBeInstanceOf(ExcelExportService);

    await module.close();
  });

  it('uses request-list status and request-date filters for a bounded synchronous query', async () => {
    const exportService = service as unknown as {
      exportRequests: (filters: {
        status?: string;
        requestDateFrom?: string;
        requestDateTo?: string;
      }) => Promise<unknown>;
    };

    await exportService.exportRequests({
      status: 'Submitted',
      requestDateFrom: '2026-06-01',
      requestDateTo: '2026-06-30',
    });

    expect(searchIndexService.queryRequests).toHaveBeenCalledWith(
      {
        status: 'Submitted',
        requestDateFrom: '2026-06-01',
        requestDateTo: '2026-06-30',
        limit: 2000,
        offset: 0,
      },
      2000,
    );
  });

  it('writes safe request-list baseline fields to a valid workbook row', async () => {
    searchIndexService.queryRequests.mockResolvedValueOnce({
      items: [
        {
          requestId: 'request-1',
          requestNo: 'PSF-0001',
          title: 'Probe card setup',
          referencePsfName: 'REF-PSF',
          psfSetupFileName: 'internal.psf',
          probecardName: 'PC-123',
          status: 'Submitted',
          priority: 'High',
          requester: 'Requester Demo',
          setupOwner: 'Setup Owner Demo',
          setupOwnerRole: 'GNTC',
          productType: 'New Product',
          requestDate: '2026-06-18T01:02:03.000Z',
          dueDate: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-06-18T01:05:03.000Z',
        },
      ],
      total: 1,
      limit: 2000,
      offset: 0,
    });
    const exportService = service as unknown as {
      exportRequests: () => Promise<{ content: Buffer; filename: string }>;
    };

    const result = await exportService.exportRequests();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.content);
    const worksheet = workbook.getWorksheet('PSF Requests');

    if (!worksheet) {
      throw new Error('Expected PSF Requests worksheet');
    }

    expect(
      Array.from(
        { length: 12 },
        (_, index) => worksheet.getRow(1).getCell(index + 1).value,
      ),
    ).toEqual([
      'Request No',
      'Title',
      'Reference PSF Name',
      'Status',
      'Priority',
      'Requester',
      'Setup File Owner',
      'Setup File Owner Role',
      'Product Type',
      'Request Date',
      'Due Date',
      'Updated At',
    ]);
    expect(
      Array.from(
        { length: 12 },
        (_, index) => worksheet.getRow(2).getCell(index + 1).value,
      ),
    ).toEqual([
      'PSF-0001',
      'Probe card setup',
      'REF-PSF',
      'Submitted',
      'High',
      'Requester Demo',
      'Setup Owner Demo',
      'GNTC',
      'New Product',
      '2026-06-18T01:02:03.000Z',
      '2026-07-01T00:00:00.000Z',
      '2026-06-18T01:05:03.000Z',
    ]);
  });

  it('rejects an export exceeding the synchronous record ceiling instead of returning a partial workbook', async () => {
    searchIndexService.queryRequests.mockResolvedValueOnce({
      items: [],
      total: 2001,
      limit: 2000,
      offset: 0,
    });

    await expect(service.exportRequests()).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });

  it('names the workbook with an Asia/Bangkok timestamp', () => {
    expect(
      formatRequestExportFilename(new Date('2026-06-18T17:05:06.000Z')),
    ).toBe('psf_requests_20260619_000506.xlsx');
  });
});

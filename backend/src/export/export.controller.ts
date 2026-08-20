import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import type {
  AuthenticatedRequest,
  AuthenticatedUserProfile,
} from '../auth/session.types';
import { SearchIndexService } from '../requests/search-index.service';
import {
  ExcelExportService,
  type RequestExportFilters,
} from './excel_export.service';
import { ExportJobRepository, type ExportJob } from './export-job.repository';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_JOB_NOT_FOUND_MESSAGE = 'Export job not found.';
const EXPORT_JOB_NOT_READY_MESSAGE = 'Export job is not ready for download.';
const EXPORT_JOB_FAILURE_MESSAGE =
  'Unable to prepare this export. Please try again.';

type ExportActor = AuthenticatedUserProfile & {
  role: 'admin' | 'requester';
};

interface ExportJobStatusResponse {
  id: string;
  status: ExportJob['status'];
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failureMessage?: string;
  downloadUrl?: string;
}

@Controller('requests')
export class ExportController {
  constructor(
    private readonly excelExportService: ExcelExportService,
    private readonly authService: AuthService,
    private readonly searchIndexService: SearchIndexService,
    private readonly exportJobRepository: ExportJobRepository,
    private readonly configService: ConfigService,
  ) {}

  @Get('export.xlsx')
  async exportRequests(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const actor = await this.getExportActor(request);
    const filters = this.parseExportFilters(query);
    const synchronousThreshold = this.getSynchronousExportThreshold();
    const total = await this.searchIndexService.countExportRequests(
      filters,
      actor,
    );

    if (total > synchronousThreshold) {
      const job = await this.exportJobRepository.enqueue(filters, actor);
      response.status(202).json({
        id: job.id,
        status: job.status,
        statusUrl: this.exportJobStatusUrl(job.id),
      });
      return;
    }

    const exportResult = await this.excelExportService.exportRequests(
      filters,
      actor,
      synchronousThreshold,
    );

    response.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportResult.filename}"`,
    );

    response.end(exportResult.content);
  }

  @Get('export-jobs/:jobId/download')
  async downloadExportJob(
    @Param('jobId') jobId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const actor = await this.getExportActor(request);
    const job = await this.exportJobRepository.findOwnedContent(
      this.requireJobId(jobId),
      actor.id,
    );

    if (!job) {
      throw new NotFoundException(EXPORT_JOB_NOT_FOUND_MESSAGE);
    }

    if (job.status !== 'completed' || !job.content || !job.filename) {
      throw new ConflictException(EXPORT_JOB_NOT_READY_MESSAGE);
    }

    response.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${job.filename}"`,
    );
    response.end(job.content);
  }

  @Get('export-jobs/:jobId')
  async getExportJob(
    @Param('jobId') jobId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ExportJobStatusResponse> {
    const actor = await this.getExportActor(request);
    const job = await this.exportJobRepository.findOwned(
      this.requireJobId(jobId),
      actor.id,
    );

    if (!job) {
      throw new NotFoundException(EXPORT_JOB_NOT_FOUND_MESSAGE);
    }

    return this.toStatusResponse(job);
  }

  private parseExportFilters(
    query: Record<string, unknown>,
  ): RequestExportFilters {
    const status = this.readOptionalScalar(query.status, 'status')?.trim();
    const requestDateFrom = this.readOptionalScalar(query.from, 'from')?.trim();
    const requestDateTo = this.readOptionalScalar(query.to, 'to')?.trim();

    this.validateOptionalCalendarDate(requestDateFrom, 'from');
    this.validateOptionalCalendarDate(requestDateTo, 'to');

    return {
      ...(status ? { status } : {}),
      ...(requestDateFrom ? { requestDateFrom } : {}),
      ...(requestDateTo ? { requestDateTo } : {}),
    };
  }

  private readOptionalScalar(value: unknown, name: string): string | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${name} must be a single value.`);
    }

    return value;
  }

  private validateOptionalCalendarDate(
    value: string | undefined,
    name: string,
  ): void {
    const normalizedValue = value?.trim();

    if (!normalizedValue) {
      return;
    }

    const parsedDate = new Date(`${normalizedValue}T00:00:00.000Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== normalizedValue
    ) {
      throw new BadRequestException(
        `${name} must be a valid ISO calendar date.`,
      );
    }
  }

  private async getAuthenticatedActor(
    request: AuthenticatedRequest,
  ): Promise<AuthenticatedUserProfile> {
    const userId = request.session.userId;

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const actor = await this.authService.getProfile(userId);

    if (!actor) {
      request.session.userId = undefined;
      throw new UnauthorizedException('Not authenticated');
    }

    return actor;
  }

  private async getExportActor(
    request: AuthenticatedRequest,
  ): Promise<ExportActor> {
    const actor = await this.getAuthenticatedActor(request);

    if (actor.role !== 'admin' && actor.role !== 'requester') {
      throw new ForbiddenException(
        'Only admins and requesters can export requests.',
      );
    }

    return actor as ExportActor;
  }

  private getSynchronousExportThreshold(): number {
    const configured = this.configService.get<string | number>(
      'EXPORT_SYNC_THRESHOLD',
      2000,
    );
    const threshold =
      typeof configured === 'number' ? configured : Number(configured);

    if (!Number.isFinite(threshold) || threshold < 1) {
      return 2000;
    }

    return Math.trunc(threshold);
  }

  private requireJobId(jobId: string): string {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        jobId,
      )
    ) {
      throw new NotFoundException(EXPORT_JOB_NOT_FOUND_MESSAGE);
    }

    return jobId;
  }

  private toStatusResponse(job: ExportJob): ExportJobStatusResponse {
    const response: ExportJobStatusResponse = {
      id: job.id,
      status: job.status,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      failedAt: job.failedAt,
    };

    if (job.status === 'failed') {
      response.failureMessage =
        job.failureMessage ?? EXPORT_JOB_FAILURE_MESSAGE;
    }

    if (job.status === 'completed') {
      response.downloadUrl = `${this.exportJobStatusUrl(job.id)}/download`;
    }

    return response;
  }

  private exportJobStatusUrl(jobId: string): string {
    return `/requests/export-jobs/${jobId}`;
  }
}

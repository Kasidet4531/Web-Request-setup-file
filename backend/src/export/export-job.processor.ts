import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExcelExportService } from './excel_export.service';
import { ExportJobRepository } from './export-job.repository';

const EXPORT_JOB_FAILURE_MESSAGE =
  'Unable to prepare this export. Please try again.';
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1_000;
const DEFAULT_MAXIMUM_ATTEMPTS = 2;

@Injectable()
export class ExportJobProcessor
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ExportJobProcessor.name);
  private processing = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly exportJobRepository: ExportJobRepository,
    private readonly excelExportService: ExcelExportService,
    private readonly configService: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    this.startProcessing();
    this.timer = setInterval(
      () => this.startProcessing(),
      this.getPositiveInteger(
        'EXPORT_JOB_POLL_INTERVAL_MS',
        DEFAULT_POLL_INTERVAL_MS,
        100,
        60_000,
      ),
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async processNext(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      const staleAfterMs = this.getPositiveInteger(
        'EXPORT_JOB_STALE_AFTER_MS',
        DEFAULT_STALE_AFTER_MS,
        1_000,
        24 * 60 * 60 * 1_000,
      );
      const job = await this.exportJobRepository.claimNext(
        new Date(Date.now() - staleAfterMs),
        this.getPositiveInteger(
          'EXPORT_JOB_MAXIMUM_ATTEMPTS',
          DEFAULT_MAXIMUM_ATTEMPTS,
          1,
          10,
        ),
      );

      if (!job || !job.claimToken) {
        return;
      }

      const stopRenewingClaim = this.startClaimHeartbeat(
        job.id,
        job.claimToken,
        staleAfterMs,
      );
      try {
        const workbook = await this.excelExportService.exportAllRequests(
          job.filters,
          { id: job.ownerUserId, role: job.ownerRole },
        );
        await this.exportJobRepository.complete(
          job.id,
          job.claimToken,
          workbook,
        );
      } catch {
        await this.exportJobRepository.fail(
          job.id,
          job.claimToken,
          EXPORT_JOB_FAILURE_MESSAGE,
        );
      } finally {
        stopRenewingClaim();
      }
    } finally {
      this.processing = false;
    }
  }

  private startProcessing(): void {
    void this.processNext().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Export job processor failed: ${message}`);
    });
  }

  private startClaimHeartbeat(
    jobId: string,
    claimToken: string,
    staleAfterMs: number,
  ): () => void {
    const timer = setInterval(
      () => {
        void this.exportJobRepository
          .refreshClaim(jobId, claimToken)
          .catch(() => {
            this.logger.warn('Unable to renew an export job claim.');
          });
      },
      Math.max(100, Math.floor(staleAfterMs / 3)),
    );
    timer.unref();

    return () => clearInterval(timer);
  }

  private getPositiveInteger(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = this.configService.get<string | number>(key, fallback);
    const parsed = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
  }
}

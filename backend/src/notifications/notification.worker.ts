import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import { MailConfig } from './mail.config';
import { NotificationStorage } from './notification.storage';
import { NotificationDispatcher } from './notification.dispatcher';
@Injectable()
export class NotificationWorker
  implements OnApplicationBootstrap, OnApplicationShutdown, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationWorker.name);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active: Promise<void> | undefined;
  private stopped = false;
  constructor(
    private readonly storage: NotificationStorage,
    private readonly dispatcher: NotificationDispatcher,
    private readonly config: MailConfig,
  ) {}
  async onApplicationBootstrap(): Promise<void> {
    await this.storage.initialize();
    if (this.config.enabled && !this.stopped) this.schedule(0);
  }
  onModuleDestroy(): Promise<void> {
    return this.onApplicationShutdown();
  }
  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    try {
      await this.active;
    } catch (error) {
      this.logger.error(
        'Notification poll failed while draining at shutdown',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
  poll(): Promise<void> {
    if (this.stopped || this.active || !this.config.enabled)
      return Promise.resolve();
    this.active = this.processBatch().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      void this.poll()
        .catch((error: unknown) =>
          this.logger.error(
            'Notification worker poll failed',
            error instanceof Error ? error.stack : String(error),
          ),
        )
        .finally(() => {
          if (!this.stopped) this.schedule(this.config.pollIntervalMs);
        });
    }, delay);
    this.timer.unref();
  }
  private async processBatch(): Promise<void> {
    try {
      await this.storage.recover();
      const jobs = await this.storage.claim(10);
      const results = await Promise.allSettled(
        jobs.map(async (job) => {
          let sentTo: string;
          try {
            sentTo = await this.dispatcher.send(job);
          } catch (error) {
            await this.storage.markFailed(job, error);
            this.logger.error(
              `Notification delivery failed for ${job.id}`,
              error instanceof Error ? error.stack : String(error),
            );
            return;
          }
          // A database completion failure must keep the claim for timeout recovery: SOAP already accepted it.
          await this.storage.markSent(job, sentTo);
        }),
      );
      for (const result of results)
        if (result.status === 'rejected')
          this.logger.error(
            'Notification completion failed',
            result.reason instanceof Error
              ? result.reason.stack
              : String(result.reason),
          );
    } finally {
      // Failed rows retain this obligation through poll errors and process restarts.
      await this.storage.enqueueFailureAlert(this.config.defaultTo.join(','));
    }
  }
}

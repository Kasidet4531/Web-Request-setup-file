import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export const DATABASE_POOL = 'DATABASE_POOL';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {
    this.pool.on('error', (error) => {
      this.logger.error(
        `PostgreSQL pool emitted an error: ${error.message}`,
        error.stack,
      );
    });
  }

  async onModuleInit(): Promise<void> {
    await this.verifyConnection('startup');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async checkHealth(): Promise<{ status: 'up' }> {
    await this.verifyConnection('health check');
    return { status: 'up' };
  }

  private async verifyConnection(context: string): Promise<void> {
    try {
      await this.pool.query('SELECT 1');
      this.logger.debug(`PostgreSQL connection verified during ${context}`);
    } catch (error) {
      const host = this.configService.get<string>('DB_HOST', '127.0.0.1');
      const port = this.configService.get<number>('DB_PORT', 5432);
      const database = this.configService.get<string>('DB_NAME', 'psf_setup_db');
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(
        `PostgreSQL ${context} failed for ${host}:${port}/${database}: ${message}`,
      );
    }
  }
}

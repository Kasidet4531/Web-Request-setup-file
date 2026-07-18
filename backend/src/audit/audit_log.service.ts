import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import { DATABASE_POOL } from '../database/database.service';

type QueryRunner = Pick<Pool | PoolClient, 'query'>;

export const REQUEST_AUDIT_ACTION = {
  DRAFT_CREATED: 'DRAFT_CREATED',
  DRAFT_REQUESTER_DATA_UPDATED: 'DRAFT_REQUESTER_DATA_UPDATED',
  REQUEST_SUBMITTED: 'REQUEST_SUBMITTED',
  REQUEST_STATUS_CHANGED: 'REQUEST_STATUS_CHANGED',
} as const;

export type RequestAuditAction =
  (typeof REQUEST_AUDIT_ACTION)[keyof typeof REQUEST_AUDIT_ACTION];

export interface RecordRequestAuditAction {
  requestId: string;
  actionType: RequestAuditAction;
  actor: AuthenticatedUserProfile;
  metadata: Record<string, unknown>;
}

@Injectable()
export class AuditLogService implements OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.ensureStorage();
  }

  async record(
    event: RecordRequestAuditAction,
    queryRunner: QueryRunner = this.pool,
  ): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO psf_request_audit_logs (
          id,
          request_id,
          action_type,
          actor_id,
          actor_username,
          actor_display_name,
          actor_role,
          metadata_json,
          created_at
        )
        VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8::jsonb, NOW())
      `,
      [
        randomUUID(),
        event.requestId,
        event.actionType,
        event.actor.id,
        event.actor.username,
        event.actor.displayName,
        event.actor.role,
        event.metadata,
      ],
    );
  }

  private async ensureStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS psf_request_audit_logs (
        id UUID PRIMARY KEY,
        request_id UUID NOT NULL,
        action_type TEXT NOT NULL,
        actor_id UUID NOT NULL,
        actor_username TEXT NOT NULL,
        actor_display_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_request_audit_logs_request_created_at
      ON psf_request_audit_logs (request_id, created_at DESC)
    `);
  }
}

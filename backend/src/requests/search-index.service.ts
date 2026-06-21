import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import type { FormSchemaJson } from '../admin/form_schema.service';
import { DATABASE_POOL } from '../database/database.service';
import type { RequesterData } from './requests.service';

export type CanonicalValue = string | number | boolean | string[] | null;
export type CanonicalValues = Record<string, CanonicalValue>;

interface CanonicalValueRow {
  canonicalKey: string;
  value: CanonicalValue;
}

type QueryRunner = Pick<Pool | PoolClient, 'query'>;

@Injectable()
export class SearchIndexService implements OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCanonicalValueStorage();
  }

  extractCanonicalValues(
    schema: FormSchemaJson,
    requesterData: RequesterData,
  ): CanonicalValues {
    const canonicalValues: CanonicalValues = {};

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (!this.shouldExtractField(field)) {
          return;
        }

        canonicalValues[field.canonicalKey] = this.normalizeCanonicalValue(
          requesterData[field.fieldKey],
        );
      });
    });

    return canonicalValues;
  }

  async upsertSubmittedCanonicalValues(
    requestId: string,
    schema: FormSchemaJson,
    requesterData: RequesterData,
    queryRunner: QueryRunner = this.pool,
  ): Promise<CanonicalValues> {
    const canonicalValues = this.extractCanonicalValues(schema, requesterData);
    const rows: CanonicalValueRow[] = Object.entries(canonicalValues).map(
      ([canonicalKey, value]) => ({ canonicalKey, value }),
    );

    await queryRunner.query(
      `
        INSERT INTO canonical_submission_values (
          request_id,
          canonical_key,
          value_json,
          updated_at
        )
        SELECT $1::uuid, value->>'canonicalKey', value->'value', NOW()
        FROM jsonb_array_elements($2::jsonb) AS value
        ON CONFLICT (request_id, canonical_key)
        DO UPDATE SET
          value_json = EXCLUDED.value_json,
          updated_at = EXCLUDED.updated_at
      `,
      [requestId, JSON.stringify(rows)],
    );

    return canonicalValues;
  }

  private async ensureCanonicalValueStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS canonical_submission_values (
        request_id UUID NOT NULL,
        canonical_key TEXT NOT NULL,
        value_json JSONB,
        updated_at TIMESTAMP NOT NULL,
        PRIMARY KEY (request_id, canonical_key)
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_canonical_submission_values_key_value
      ON canonical_submission_values (canonical_key, value_json)
    `);
  }

  private shouldExtractField(
    field: FormSchemaJson['sections'][number]['fields'][number],
  ): boolean {
    return (
      typeof field.canonicalKey === 'string' &&
      field.canonicalKey.trim().length > 0 &&
      (field.searchable === true ||
        field.exportable === true ||
        field.autofillTrigger === true)
    );
  }

  private normalizeCanonicalValue(value: unknown): CanonicalValue {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      const normalized = value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      return normalized.length > 0 ? normalized : null;
    }

    return null;
  }
}

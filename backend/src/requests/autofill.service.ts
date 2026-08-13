import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  AutofillRuleService,
  isRequesterVisibleAutofillRule,
  type AutofillRule,
} from '../admin/autofill_rule.service';
import { FormSchemaService } from '../admin/form_schema.service';
import { DATABASE_POOL } from '../database/database.service';
import type { CanonicalValue } from './search-index.service';

export const AUTOFILL_LOOKUP_FORM_KEY = 'psf-request';

export interface AutofillLookupQuery {
  formKey: string;
  field: string;
  value: string;
}

export type AutofillSuggestedValue = Exclude<CanonicalValue, null>;

export interface AutofillLookupResponse {
  matched: boolean;
  suggestedValues: Record<string, AutofillSuggestedValue>;
}

interface AutofillLookupRow {
  canonical_key: string | null;
  matched: boolean;
  value_json: unknown;
}

function isCanonicalValue(value: unknown): value is AutofillSuggestedValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

@Injectable()
export class AutofillService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly autofillRuleService: AutofillRuleService,
    private readonly formSchemaService: FormSchemaService,
  ) {}

  async getActiveRules(formKey: string): Promise<AutofillRule[]> {
    return this.autofillRuleService.listActiveRules(formKey);
  }

  async lookupSuggestions(
    query: AutofillLookupQuery,
  ): Promise<AutofillLookupResponse> {
    const activeRules = await this.getActiveRules(query.formKey);
    const rule = activeRules.find(
      (candidate) => candidate.triggerCanonicalKey === query.field,
    );
    if (!rule) {
      return { matched: false, suggestedValues: {} };
    }

    const activeSchema = await this.formSchemaService.getActiveSchema(
      query.formKey,
    );
    if (!isRequesterVisibleAutofillRule(rule, activeSchema)) {
      return { matched: false, suggestedValues: {} };
    }

    const result = await this.pool.query<AutofillLookupRow>(
      `
        WITH matched_source AS (
          SELECT source_request.id
          FROM psf_requests AS source_request
          INNER JOIN canonical_submission_values AS trigger_value
            ON trigger_value.request_id = source_request.id
          WHERE source_request.form_key = $1
            AND source_request.status = 'Completed'
            AND source_request.completed_at IS NOT NULL
            AND trigger_value.canonical_key = $2
            AND trigger_value.value_json = $3::jsonb
          ORDER BY source_request.completed_at DESC, source_request.id DESC
          LIMIT 1
        )
        SELECT
          TRUE AS matched,
          target_value.canonical_key,
          target_value.value_json,
          array_position($4::text[], target_value.canonical_key) AS target_position
        FROM matched_source
        LEFT JOIN canonical_submission_values AS target_value
          ON target_value.request_id = matched_source.id
          AND target_value.canonical_key = ANY($4::text[])
          AND target_value.value_json IS NOT NULL
          AND target_value.value_json <> 'null'::jsonb
        UNION ALL
        SELECT FALSE AS matched, NULL AS canonical_key, NULL AS value_json, NULL AS target_position
        WHERE NOT EXISTS (SELECT 1 FROM matched_source)
        ORDER BY target_position NULLS LAST
      `,
      [
        AUTOFILL_LOOKUP_FORM_KEY,
        query.field,
        JSON.stringify(query.value),
        rule.targetCanonicalKeys,
      ],
    );
    if (!result.rows.some((row) => row.matched)) {
      return { matched: false, suggestedValues: {} };
    }

    const returnedValues = new Map<string, AutofillSuggestedValue>();
    result.rows.forEach((row) => {
      if (
        row.canonical_key !== null &&
        rule.targetCanonicalKeys.includes(row.canonical_key) &&
        isCanonicalValue(row.value_json)
      ) {
        returnedValues.set(row.canonical_key, row.value_json);
      }
    });

    const suggestedValues: Record<string, AutofillSuggestedValue> = {};
    rule.targetCanonicalKeys.forEach((canonicalKey) => {
      const value = returnedValues.get(canonicalKey);
      if (value !== undefined) {
        suggestedValues[canonicalKey] = value;
      }
    });

    return { matched: true, suggestedValues };
  }
}

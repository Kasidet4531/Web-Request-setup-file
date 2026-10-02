import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  AutofillRuleService,
  isValidAutofillRuleForSchema,
  type AutofillRule,
} from '../admin/autofill_rule.service';
import { getAutofillRuleSchemaState } from '../admin/autofill-rule-schema';
import { FormSchemaService } from '../admin/form_schema.service';
import { WorkflowTransitionService } from '../admin/workflow_transition.service';
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
    private readonly workflowTransitionService: WorkflowTransitionService,
  ) {}

  async getActiveRules(formKey: string): Promise<AutofillRule[]> {
    return this.autofillRuleService.listActiveRules(formKey);
  }

  async lookupSuggestions(
    query: AutofillLookupQuery,
  ): Promise<AutofillLookupResponse> {
    const activeRules = await this.getActiveRules(query.formKey);
    const storedRule = activeRules.find(
      (candidate) => candidate.triggerCanonicalKey === query.field,
    );
    if (!storedRule || storedRule.status !== 'active') {
      return { matched: false, suggestedValues: {} };
    }

    const activeSchema = await this.formSchemaService.getActiveSchema(
      query.formKey,
    );
    const state = getAutofillRuleSchemaState(storedRule, activeSchema.schema);
    const rule = {
      ...storedRule,
      targetCanonicalKeys: state.targetCanonicalKeys,
    };
    if (
      state.inactiveReason ||
      !isValidAutofillRuleForSchema(rule, activeSchema)
    ) {
      return { matched: false, suggestedValues: {} };
    }

    const configuration = await this.workflowTransitionService.getConfiguration(
      this.pool,
      false,
    );
    const completedStatuses = configuration.entries
      .filter((entry) => entry.kind === 'completed')
      .map((entry) => entry.name);

    const result = await this.pool.query<AutofillLookupRow>(
      `
        WITH historical_values AS NOT MATERIALIZED (
          SELECT request_id, canonical_key, value_json
          FROM canonical_submission_values
          UNION ALL
          SELECT
            historical_request.id AS request_id,
            field.value->>'canonicalKey' AS canonical_key,
            to_jsonb(NULLIF(REGEXP_REPLACE(
              historical_request.requester_data_json->>(field.value->>'fieldKey'),
              '^[[:space:]]+|[[:space:]]+$', '', 'g'
            ), '')) AS value_json
          FROM psf_requests AS historical_request
          CROSS JOIN LATERAL jsonb_array_elements(historical_request.schema_snapshot_json->'sections') AS section(value)
          CROSS JOIN LATERAL jsonb_array_elements(section.value->'fields') AS field(value)
          WHERE historical_request.form_key = $1
            AND historical_request.status = ANY($5::text[])
            AND historical_request.completed_at IS NOT NULL
            AND field.value->>'type' IN ('text', 'textarea', 'date', 'select', 'radio')
            AND field.value->>'canonicalKey' = ANY(array_append($4::text[], $2::text))
            AND jsonb_typeof(historical_request.requester_data_json->(field.value->>'fieldKey')) = 'string'
            AND NOT EXISTS (
              SELECT 1 FROM canonical_submission_values AS indexed_value
              WHERE indexed_value.request_id = historical_request.id
                AND indexed_value.canonical_key = field.value->>'canonicalKey'
            )
        ), matched_source AS (
          SELECT source_request.id
          FROM psf_requests AS source_request
          INNER JOIN historical_values AS trigger_value
            ON trigger_value.request_id = source_request.id
          WHERE source_request.form_key = $1
            AND source_request.status = ANY($5::text[])
            AND source_request.completed_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements(source_request.schema_snapshot_json->'sections') AS historical_section(value)
              WHERE historical_section.value ? 'visibleTo'
                AND CASE WHEN jsonb_typeof(historical_section.value->'visibleTo') = 'array'
                  THEN jsonb_array_length(historical_section.value->'visibleTo') <> 3
                    OR NOT (historical_section.value->'visibleTo' @> '["requester", "setup_owner", "admin"]'::jsonb)
                  ELSE TRUE
                END
            )
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
        LEFT JOIN historical_values AS target_value
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
        completedStatuses,
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

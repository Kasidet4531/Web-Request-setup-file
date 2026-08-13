import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../database/database.service';
import {
  FormSchemaService,
  type ActiveFormSchemaResponse,
  type FormSchemaField,
} from './form_schema.service';

export const AUTOFILL_RULE_FORM_KEY = 'psf-request';
export const AUTOFILL_RULE_LOOKUP_SOURCE = 'previous_completed_submission';
export const AUTOFILL_RULE_STATUS = 'active';

export interface AutofillRuleInput {
  formKey: string;
  triggerCanonicalKey: string;
  targetCanonicalKeys: string[];
}

export interface AutofillRule {
  id: string;
  formKey: string;
  triggerCanonicalKey: string;
  targetCanonicalKeys: string[];
  lookupSource: typeof AUTOFILL_RULE_LOOKUP_SOURCE;
  status: typeof AUTOFILL_RULE_STATUS;
  createdAt: string;
  updatedAt: string;
}

interface AutofillRuleRow {
  id: string;
  form_key: string;
  trigger_canonical_key: string;
  lookup_source: string;
  fill_targets_json: unknown;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class AutofillRuleService implements OnModuleInit {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly formSchemaService: FormSchemaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAutofillRulesStorage();
  }

  async listActiveRules(formKey: string): Promise<AutofillRule[]> {
    this.assertManagedFormKey(formKey);

    const result = await this.pool.query<AutofillRuleRow>(
      `
        SELECT
          id,
          form_key,
          trigger_canonical_key,
          lookup_source,
          fill_targets_json,
          status,
          created_at,
          updated_at
        FROM autofill_rules
        WHERE form_key = $1
          AND lookup_source = $2
          AND status = $3
        ORDER BY created_at ASC, id ASC
      `,
      [
        AUTOFILL_RULE_FORM_KEY,
        AUTOFILL_RULE_LOOKUP_SOURCE,
        AUTOFILL_RULE_STATUS,
      ],
    );

    return result.rows.map((row) => this.toRuleResponse(row));
  }

  async createRule(input: unknown): Promise<AutofillRule> {
    const normalizedInput = this.normalizeRuleInput(input);

    try {
      return await this.withTransaction(async (client) => {
        const activeSchema =
          await this.formSchemaService.getActiveSchemaForUpdate(
            AUTOFILL_RULE_FORM_KEY,
            client,
          );
        this.assertRuleMatchesActiveSchema(normalizedInput, activeSchema);

        const result = await client.query<AutofillRuleRow>(
          `
            INSERT INTO autofill_rules (
              id,
              form_key,
              trigger_canonical_key,
              lookup_source,
              fill_targets_json,
              status,
              created_at,
              updated_at
            )
            VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, NOW(), NOW())
            RETURNING
              id,
              form_key,
              trigger_canonical_key,
              lookup_source,
              fill_targets_json,
              status,
              created_at,
              updated_at
          `,
          [
            randomUUID(),
            normalizedInput.formKey,
            normalizedInput.triggerCanonicalKey,
            AUTOFILL_RULE_LOOKUP_SOURCE,
            JSON.stringify(normalizedInput.targetCanonicalKeys),
            AUTOFILL_RULE_STATUS,
          ],
        );
        const created = result.rows[0];
        if (!created) {
          throw new ConflictException(
            'The autofill rule could not be created.',
          );
        }

        return this.toRuleResponse(created);
      });
    } catch (error) {
      this.rethrowUniqueConstraintViolation(error);
    }
  }

  async updateRule(ruleId: unknown, input: unknown): Promise<AutofillRule> {
    const normalizedRuleId = this.parseRuleId(ruleId);
    const normalizedInput = this.normalizeRuleInput(input);

    try {
      return await this.withTransaction(async (client) => {
        const activeSchema =
          await this.formSchemaService.getActiveSchemaForUpdate(
            AUTOFILL_RULE_FORM_KEY,
            client,
          );
        this.assertRuleMatchesActiveSchema(normalizedInput, activeSchema);

        const result = await client.query<AutofillRuleRow>(
          `
            UPDATE autofill_rules
            SET
              trigger_canonical_key = $1,
              fill_targets_json = $2::jsonb,
              updated_at = NOW()
            WHERE id = $3::uuid AND form_key = $4
            RETURNING
              id,
              form_key,
              trigger_canonical_key,
              lookup_source,
              fill_targets_json,
              status,
              created_at,
              updated_at
          `,
          [
            normalizedInput.triggerCanonicalKey,
            JSON.stringify(normalizedInput.targetCanonicalKeys),
            normalizedRuleId,
            normalizedInput.formKey,
          ],
        );
        const updated = result.rows[0];
        if (!updated) {
          throw new NotFoundException('Autofill rule not found.');
        }

        return this.toRuleResponse(updated);
      });
    } catch (error) {
      this.rethrowUniqueConstraintViolation(error);
    }
  }

  private async ensureAutofillRulesStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS autofill_rules (
        id UUID PRIMARY KEY,
        form_key TEXT NOT NULL,
        trigger_canonical_key TEXT NOT NULL,
        lookup_source TEXT NOT NULL,
        fill_targets_json JSONB NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_autofill_rules_form_trigger
      ON autofill_rules (form_key, trigger_canonical_key)
    `);
  }

  private normalizeRuleInput(input: unknown): AutofillRuleInput {
    if (!isRecord(input)) {
      throw new BadRequestException('An autofill rule object is required.');
    }

    this.assertOnlyKeys(input, [
      'formKey',
      'triggerCanonicalKey',
      'targetCanonicalKeys',
    ]);

    return {
      formKey: this.parseManagedFormKey(input.formKey),
      triggerCanonicalKey: this.parseCanonicalKey(
        input.triggerCanonicalKey,
        'triggerCanonicalKey',
      ),
      targetCanonicalKeys: this.parseTargetCanonicalKeys(
        input.targetCanonicalKeys,
      ),
    };
  }

  private parseManagedFormKey(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('formKey must be a nonblank string.');
    }

    this.assertManagedFormKey(value);
    return value;
  }

  private assertManagedFormKey(value: string): void {
    if (value !== AUTOFILL_RULE_FORM_KEY) {
      throw new BadRequestException(
        `formKey must be ${AUTOFILL_RULE_FORM_KEY}.`,
      );
    }
  }

  private parseCanonicalKey(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${fieldName} must be a nonblank string.`);
    }

    return value;
  }

  private parseTargetCanonicalKeys(value: unknown): string[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException(
        'targetCanonicalKeys must be a nonempty array.',
      );
    }

    const targetCanonicalKeys = value.map((target, index) =>
      this.parseCanonicalKey(target, `targetCanonicalKeys[${index}]`),
    );
    if (new Set(targetCanonicalKeys).size !== targetCanonicalKeys.length) {
      throw new BadRequestException(
        'targetCanonicalKeys must not contain duplicates.',
      );
    }

    return targetCanonicalKeys;
  }

  private parseRuleId(value: unknown): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new BadRequestException('ruleId must be a UUID.');
    }

    return value;
  }

  private assertOnlyKeys(
    value: Record<string, unknown>,
    supportedKeys: string[],
  ): void {
    const unsupportedKey = Object.keys(value).find(
      (key) => !supportedKeys.includes(key),
    );
    if (unsupportedKey) {
      throw new BadRequestException(
        `Autofill rule contains an unsupported field: ${unsupportedKey}.`,
      );
    }
  }

  private assertRuleMatchesActiveSchema(
    rule: AutofillRuleInput,
    activeSchema: ActiveFormSchemaResponse,
  ): void {
    const fields = activeSchema.schema.sections.flatMap((section) =>
      Array.isArray(section.fields) ? section.fields : [],
    );
    const triggerField = this.getExactlyOneField(
      fields,
      rule.triggerCanonicalKey,
      'triggerCanonicalKey',
    );

    if (triggerField.autofillTrigger !== true) {
      throw new BadRequestException(
        'triggerCanonicalKey must reference a field enabled as an autofill trigger.',
      );
    }

    for (const targetCanonicalKey of rule.targetCanonicalKeys) {
      if (targetCanonicalKey === rule.triggerCanonicalKey) {
        throw new BadRequestException(
          'triggerCanonicalKey cannot also be a targetCanonicalKey.',
        );
      }

      this.getExactlyOneField(
        fields,
        targetCanonicalKey,
        'targetCanonicalKeys',
      );
    }
  }

  private getExactlyOneField(
    fields: FormSchemaField[],
    canonicalKey: string,
    fieldName: string,
  ): FormSchemaField {
    const matches = fields.filter(
      (field) => field.canonicalKey === canonicalKey,
    );
    if (matches.length !== 1) {
      throw new BadRequestException(
        `${fieldName} must reference exactly one canonical key in the active schema.`,
      );
    }

    return matches[0];
  }

  private toRuleResponse(row: AutofillRuleRow): AutofillRule {
    if (
      !UUID_PATTERN.test(row.id) ||
      row.form_key !== AUTOFILL_RULE_FORM_KEY ||
      row.lookup_source !== AUTOFILL_RULE_LOOKUP_SOURCE ||
      row.status !== AUTOFILL_RULE_STATUS
    ) {
      throw new ConflictException('Stored autofill rule data is invalid.');
    }

    const targetCanonicalKeys = this.parseStoredTargetCanonicalKeys(
      row.fill_targets_json,
      row.trigger_canonical_key,
    );

    return {
      id: row.id,
      formKey: row.form_key,
      triggerCanonicalKey: row.trigger_canonical_key,
      targetCanonicalKeys,
      lookupSource: AUTOFILL_RULE_LOOKUP_SOURCE,
      status: AUTOFILL_RULE_STATUS,
      createdAt: this.serializeTimestamp(row.created_at),
      updatedAt: this.serializeTimestamp(row.updated_at),
    };
  }

  private parseStoredTargetCanonicalKeys(
    value: unknown,
    triggerCanonicalKey: string,
  ): string[] {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every(
        (target) => typeof target === 'string' && target.trim().length > 0,
      )
    ) {
      throw new ConflictException('Stored autofill rule targets are invalid.');
    }

    const targetCanonicalKeys = value as string[];
    if (
      new Set(targetCanonicalKeys).size !== targetCanonicalKeys.length ||
      targetCanonicalKeys.includes(triggerCanonicalKey)
    ) {
      throw new ConflictException('Stored autofill rule targets are invalid.');
    }

    return [...targetCanonicalKeys];
  }

  private serializeTimestamp(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await this.rollbackTransaction(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async rollbackTransaction(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original rule configuration error if rollback also fails.
    }
  }

  private rethrowUniqueConstraintViolation(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new ConflictException(
        'An autofill rule already exists for this form and trigger canonical key.',
      );
    }

    throw error;
  }
}

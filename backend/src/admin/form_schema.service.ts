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
import type { AuthenticatedUserProfile } from '../auth/session.types';
import { DATABASE_POOL } from '../database/database.service';
import {
  DEFAULT_PSF_REQUEST_SCHEMA,
  LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
  PSF_REQUEST_FORM_KEY,
  SUPPORTED_FORM_KEYS,
  type FormSchemaField,
  type FormSchemaJson,
  type FormSchemaSection,
} from './form_schema.constants';

export type {
  FormSchemaField,
  FormSchemaJson,
  FormSchemaSection,
} from './form_schema.constants';

export interface ActiveFormSchemaResponse {
  formKey: string;
  version: number;
  title: string;
  description: string | null;
  status: string;
  schema: FormSchemaJson;
  publishedAt: string | null;
}

export type FormSchemaStatus = 'active' | 'draft' | 'published';

export interface FormSchemaVersionResponse {
  formKey: string;
  version: number;
  title: string;
  description: string | null;
  status: FormSchemaStatus;
  schema: FormSchemaJson;
  createdBy: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface FormSchemaVersionListResponse {
  formKey: string;
  versions: FormSchemaVersionResponse[];
}

export interface SaveFormSchemaDraftDto {
  description?: string | null;
  draftVersion: number;
  schema: Omit<FormSchemaJson, 'version'>;
}

interface FormDefinitionRow {
  form_key: string;
  version: number;
  title: string;
  description: string | null;
  status: string;
  schema_json: FormSchemaJson;
  created_by: string | null;
  created_at: Date | string;
  published_at: Date | string | null;
}

const FORM_SCHEMA_STATUSES = new Set<FormSchemaStatus>([
  'active',
  'draft',
  'published',
]);
const SUPPORTED_FIELD_TYPES = new Set<FormSchemaField['type']>([
  'text',
  'textarea',
  'date',
  'select',
  'radio',
]);
const UNSAFE_SCHEMA_IDENTITY_KEYS = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  '__proto__',
  'prototype',
]);

type QueryRunner = Pick<PoolClient, 'query'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasRestrictedLegacySection(section: unknown): boolean {
  if (!isRecord(section) || !Object.hasOwn(section, 'visibleTo')) return false;
  const roles = section.visibleTo;
  return (
    !Array.isArray(roles) ||
    roles.length !== 3 ||
    !['requester', 'setup_owner', 'admin'].every((role) => roles.includes(role))
  );
}

@Injectable()
export class FormSchemaService implements OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.ensureFormDefinitionsStorage();
    await this.seedDefaultActiveSchemas();
  }

  async getActiveSchema(
    formKey: string = PSF_REQUEST_FORM_KEY,
  ): Promise<ActiveFormSchemaResponse> {
    this.assertSupportedFormKey(formKey);
    const result = await this.pool.query<FormDefinitionRow>(
      `
        SELECT form_key, version, title, description, status, schema_json, published_at
        FROM form_definitions
        WHERE form_key = $1 AND status = 'active'
        ORDER BY version DESC
        LIMIT 1
      `,
      [formKey],
    );

    const activeSchema = result.rows[0];

    if (!activeSchema) {
      throw new NotFoundException(`No active form schema found for ${formKey}`);
    }
    this.assertNoRestrictedLegacySections(activeSchema.schema_json.sections);

    return {
      formKey: activeSchema.form_key,
      version: activeSchema.version,
      title: activeSchema.title,
      description: activeSchema.description,
      status: activeSchema.status,
      schema: this.normalizeSchemaForResponse(activeSchema),
      publishedAt: this.serializeTimestamp(activeSchema.published_at),
    };
  }

  async getActiveSchemaForUpdate(
    formKey: string,
    client: QueryRunner,
  ): Promise<ActiveFormSchemaResponse> {
    this.assertSupportedFormKey(formKey);
    const lockedRows = await this.lockManagedForm(client, formKey);
    const activeSchema = lockedRows.find((row) => row.status === 'active');

    if (!activeSchema) {
      throw new NotFoundException(`No active form schema found for ${formKey}`);
    }
    this.assertNoRestrictedLegacySections(activeSchema.schema_json.sections);

    return {
      formKey: activeSchema.form_key,
      version: activeSchema.version,
      title: activeSchema.title,
      description: activeSchema.description,
      status: activeSchema.status,
      schema: this.normalizeSchemaForResponse(activeSchema),
      publishedAt: this.serializeTimestamp(activeSchema.published_at),
    };
  }

  async listVersions(
    formKey: string = PSF_REQUEST_FORM_KEY,
  ): Promise<FormSchemaVersionListResponse> {
    this.assertSupportedFormKey(formKey);
    const result = await this.pool.query<FormDefinitionRow>(
      `
        SELECT
          form_key,
          version,
          title,
          description,
          status,
          schema_json,
          created_by,
          created_at,
          published_at
        FROM form_definitions
        WHERE form_key = $1
        ORDER BY version DESC
      `,
      [formKey],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        `No form schema versions found for ${formKey}`,
      );
    }

    return {
      formKey,
      versions: result.rows.map((row) => this.toVersionResponse(row)),
    };
  }

  async saveDraft(
    dto: SaveFormSchemaDraftDto,
    actor: AuthenticatedUserProfile,
    formKey: string = PSF_REQUEST_FORM_KEY,
  ): Promise<FormSchemaVersionResponse> {
    this.assertSupportedFormKey(formKey);
    const normalizedDto = this.assertDraftInput(dto, formKey);
    this.getActorUsername(actor);

    return this.withTransaction(async (client) => {
      const lockedRows = await this.lockManagedForm(client, formKey);
      const draftRows = lockedRows.filter((row) => row.status === 'draft');
      if (draftRows.length > 1) {
        throw new ConflictException(
          `Multiple draft schema versions exist for ${formKey}.`,
        );
      }

      const existingDraft = draftRows[0];
      if (
        !existingDraft ||
        existingDraft.version !== normalizedDto.draftVersion
      ) {
        throw new ConflictException(
          'The selected draft no longer exists. Reload versions before saving.',
        );
      }
      this.assertNoRestrictedLegacySections(existingDraft.schema_json.sections);
      const version = existingDraft.version;
      const schema = this.normalizeDraftSchema(
        normalizedDto.schema,
        version,
        formKey,
      );
      this.assertRuntimeSafeSchema(schema, version, schema.title, formKey);
      const description = normalizedDto.description ?? null;

      const result = await client.query<FormDefinitionRow>(
        `
          UPDATE form_definitions
          SET title = $1, description = $2, schema_json = $3::jsonb
          WHERE form_key = $4 AND version = $5 AND status = 'draft'
          RETURNING form_key, version, title, description, status, schema_json, created_by, created_at, published_at
        `,
        [schema.title, description, schema, formKey, version],
      );
      if (!result.rows[0])
        throw new ConflictException(
          'The schema draft changed before it could be saved.',
        );
      return this.toVersionResponse(result.rows[0]);
    });
  }

  async duplicateVersion(
    sourceVersion: number,
    actor: AuthenticatedUserProfile,
    formKey: string = PSF_REQUEST_FORM_KEY,
  ): Promise<FormSchemaVersionResponse> {
    this.assertSupportedFormKey(formKey);
    this.assertPublishVersion(sourceVersion);
    const createdBy = this.getActorUsername(actor);
    return this.withTransaction(async (client) => {
      const rows = await this.lockManagedForm(client, formKey);
      const source = rows.find((row) => row.version === sourceVersion);
      if (!source)
        throw new NotFoundException(
          `Form schema version ${sourceVersion} was not found.`,
        );
      if (rows.some((row) => row.status === 'draft')) {
        throw new ConflictException(
          'Open or discard the existing draft before duplicating a version.',
        );
      }
      const version = this.nextDraftVersion(rows, formKey);
      const result = await client.query<FormDefinitionRow>(
        `INSERT INTO form_definitions (id, form_key, version, title, description, schema_json, status, created_by, created_at, published_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, 'draft', $7, NOW(), NULL)
         RETURNING form_key, version, title, description, status, schema_json, created_by, created_at, published_at`,
        [
          randomUUID(),
          formKey,
          version,
          source.title,
          source.description,
          this.normalizeDraftSchema(source.schema_json, version, formKey),
          createdBy,
        ],
      );
      if (!result.rows[0])
        throw new ConflictException('The schema draft could not be created.');
      return this.toVersionResponse(result.rows[0]);
    });
  }

  async discardDraft(
    version: number,
    formKey: string = PSF_REQUEST_FORM_KEY,
  ): Promise<void> {
    this.assertPublishVersion(version);
    this.assertSupportedFormKey(formKey);
    await this.withTransaction(async (client) => {
      const rows = await this.lockManagedForm(client, formKey);
      if (
        !rows.some((row) => row.version === version && row.status === 'draft')
      ) {
        throw new ConflictException(
          `Version ${version} is not a draft that can be discarded.`,
        );
      }
      const result = await client.query<{ version: number }>(
        `DELETE FROM form_definitions
         WHERE form_key = $1 AND version = $2 AND status = 'draft' AND published_at IS NULL RETURNING version`,
        [formKey, version],
      );
      if (!result.rows[0])
        throw new ConflictException(
          'The draft changed before it could be discarded.',
        );
    });
  }

  async publishDraft(
    version: number,
    formKey: string = PSF_REQUEST_FORM_KEY,
  ): Promise<FormSchemaVersionResponse> {
    this.assertPublishVersion(version);
    this.assertSupportedFormKey(formKey);

    return this.withTransaction(async (client) => {
      const lockedRows = await this.lockManagedForm(client, formKey);
      const target = lockedRows.find((row) => row.version === version);

      if (!target) {
        throw new NotFoundException(
          `Form schema version ${version} was not found for ${formKey}`,
        );
      }

      if (target.status !== 'draft') {
        throw new ConflictException(
          `Form schema version ${version} is not a publishable draft.`,
        );
      }

      this.assertRuntimeSafeSchema(
        target.schema_json,
        target.version,
        target.title,
        formKey,
      );

      await client.query(
        `
          UPDATE form_definitions
          SET status = 'published'
          WHERE form_key = $1 AND status = 'active'
        `,
        [formKey],
      );

      const result = await client.query<FormDefinitionRow>(
        `
          UPDATE form_definitions
          SET status = 'active', published_at = NOW()
          WHERE form_key = $1 AND version = $2 AND status = 'draft'
          RETURNING
            form_key,
            version,
            title,
            description,
            status,
            schema_json,
            created_by,
            created_at,
            published_at
        `,
        [formKey, version],
      );
      const promoted = result.rows[0];
      if (!promoted) {
        throw new ConflictException(
          'The schema draft changed before it could be published.',
        );
      }

      return this.toVersionResponse(promoted);
    });
  }

  private async ensureFormDefinitionsStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS form_definitions (
        id UUID PRIMARY KEY,
        form_key TEXT NOT NULL,
        version INT NOT NULL,
        title TEXT,
        description TEXT,
        schema_json JSONB NOT NULL,
        status TEXT NOT NULL,
        created_by TEXT,
        created_at TIMESTAMP NOT NULL,
        published_at TIMESTAMP
      )
    `);

    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_form_definitions_form_key_version
      ON form_definitions (form_key, version)
    `);

    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_form_definitions_active_form_key
      ON form_definitions (form_key)
      WHERE status = 'active'
    `);

    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_form_definitions_draft_form_key
      ON form_definitions (form_key)
      WHERE status = 'draft'
    `);
  }

  private async seedDefaultActiveSchemas(): Promise<void> {
    const schemas = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        schema: DEFAULT_PSF_REQUEST_SCHEMA,
        description:
          'Default requester-facing MVP schema for local PSF request creation.',
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        schema: LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
        description: 'Initial PSF Created Information schema.',
      },
    ];

    for (const { id, schema, description } of schemas) {
      await this.pool.query(
        `
          INSERT INTO form_definitions (
            id, form_key, version, title, description, schema_json,
            status, created_by, created_at, published_at
          )
          SELECT $1::uuid, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW(), NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM form_definitions
            WHERE form_key = $2 AND status = 'active'
          )
        `,
        [
          id,
          schema.formKey,
          schema.version,
          schema.title,
          description,
          schema,
          'active',
          'system-seed',
        ],
      );
    }
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
      // Preserve the original database error if rollback also fails.
    }
  }

  private async lockManagedForm(
    client: QueryRunner,
    formKey: string,
  ): Promise<FormDefinitionRow[]> {
    // Each form's earliest version is its stable lifecycle lock anchor.
    const anchor = await client.query<{ form_key: string }>(
      `
        SELECT form_key
        FROM form_definitions
        WHERE form_key = $1
        ORDER BY version ASC
        LIMIT 1
        FOR UPDATE
      `,
      [formKey],
    );

    if (anchor.rows.length === 0) {
      throw new NotFoundException(`No active form schema found for ${formKey}`);
    }

    const result = await client.query<FormDefinitionRow>(
      `
        SELECT
          form_key,
          version,
          title,
          description,
          status,
          schema_json,
          created_by,
          created_at,
          published_at
        FROM form_definitions
        WHERE form_key = $1
        ORDER BY version DESC
        FOR UPDATE
      `,
      [formKey],
    );
    const activeRows = result.rows.filter((row) => row.status === 'active');

    if (activeRows.length === 0) {
      throw new NotFoundException(`No active form schema found for ${formKey}`);
    }

    if (activeRows.length !== 1) {
      throw new ConflictException(
        `Multiple active form schemas exist for ${formKey}.`,
      );
    }

    return result.rows;
  }

  private nextDraftVersion(rows: FormDefinitionRow[], formKey: string): number {
    const maxVersion = Math.max(...rows.map((row) => row.version));

    if (
      !Number.isSafeInteger(maxVersion) ||
      maxVersion < 1 ||
      maxVersion >= Number.MAX_SAFE_INTEGER
    ) {
      throw new ConflictException(
        `Cannot allocate a new schema version for ${formKey}.`,
      );
    }

    return maxVersion + 1;
  }

  private assertSupportedFormKey(
    value: unknown,
  ): asserts value is (typeof SUPPORTED_FORM_KEYS)[number] {
    if (
      typeof value !== 'string' ||
      !SUPPORTED_FORM_KEYS.includes(
        value as (typeof SUPPORTED_FORM_KEYS)[number],
      )
    ) {
      throw new BadRequestException(`Unsupported formKey: ${String(value)}`);
    }
  }

  private assertDraftInput(
    dto: unknown,
    formKey: string,
  ): SaveFormSchemaDraftDto {
    if (!isRecord(dto) || !isRecord(dto.schema)) {
      throw new BadRequestException('A form schema object is required.');
    }

    const description = dto.description;
    if (
      description !== undefined &&
      description !== null &&
      typeof description !== 'string'
    ) {
      throw new BadRequestException('description must be a string or null.');
    }

    const schema = dto.schema;
    if (schema.formKey !== formKey) {
      throw new BadRequestException(`schema.formKey must be ${formKey}.`);
    }

    if (typeof schema.title !== 'string' || schema.title.trim().length === 0) {
      throw new BadRequestException('schema.title must not be blank.');
    }

    if (!Array.isArray(schema.sections)) {
      throw new BadRequestException('schema.sections must be an array.');
    }

    this.assertPublishVersion(dto.draftVersion);

    return {
      description: description ?? null,
      draftVersion: dto.draftVersion,
      schema: {
        formKey,
        title: schema.title.trim(),
        sections: schema.sections as FormSchemaSection[],
      },
    };
  }

  private getActorUsername(actor: AuthenticatedUserProfile): string {
    if (
      typeof actor.username !== 'string' ||
      actor.username.trim().length === 0
    ) {
      throw new BadRequestException(
        'Authenticated actor username is required.',
      );
    }

    return actor.username;
  }

  private normalizeDraftSchema(
    schema: Omit<FormSchemaJson, 'version'>,
    version: number,
    formKey: string,
  ): FormSchemaJson {
    this.assertNoRestrictedLegacySections(schema.sections);
    return {
      formKey,
      version,
      title: schema.title,
      sections: this.stripLegacySectionMetadata(schema.sections),
    };
  }

  private stripLegacySectionMetadata(
    sections: FormSchemaSection[],
  ): FormSchemaSection[] {
    return sections.map((section) => {
      if (!isRecord(section) || hasRestrictedLegacySection(section))
        return section;
      const copy = { ...section } as FormSchemaSection & {
        visibleTo?: unknown;
      };
      delete copy.visibleTo;
      return copy;
    });
  }

  private assertNoRestrictedLegacySections(sections: unknown[]): void {
    if (sections.some(hasRestrictedLegacySection)) {
      throw new ConflictException(
        'Legacy role-restricted form sections require review before use.',
      );
    }
  }

  private assertPublishVersion(version: unknown): asserts version is number {
    if (
      typeof version !== 'number' ||
      !Number.isSafeInteger(version) ||
      version <= 0
    ) {
      throw new BadRequestException('version must be a positive safe integer.');
    }
  }

  private assertRuntimeSafeSchema(
    schema: unknown,
    version: number,
    title: string,
    formKey: string,
  ): void {
    if (!isRecord(schema)) {
      throw new BadRequestException('Draft schema must be an object.');
    }

    if (
      schema.formKey !== formKey ||
      schema.version !== version ||
      schema.title !== title
    ) {
      throw new BadRequestException(
        'Draft schema server-owned form key, version, or title does not match its row.',
      );
    }

    if (!Array.isArray(schema.sections) || schema.sections.length === 0) {
      throw new BadRequestException(
        'Draft schema must contain at least one section before publishing.',
      );
    }
    this.assertNoRestrictedLegacySections(schema.sections);

    const sectionKeys = new Set<string>();
    const fieldKeys = new Set<string>();
    const canonicalKeys = new Set<string>();

    for (const section of schema.sections) {
      if (!isRecord(section)) {
        throw new BadRequestException(
          'Every schema section must be an object.',
        );
      }

      if (
        typeof section.sectionKey !== 'string' ||
        section.sectionKey.trim().length === 0 ||
        UNSAFE_SCHEMA_IDENTITY_KEYS.has(section.sectionKey.trim()) ||
        sectionKeys.has(section.sectionKey)
      ) {
        throw new BadRequestException(
          'Schema section keys must be nonempty and unique.',
        );
      }
      sectionKeys.add(section.sectionKey);

      if (typeof section.title !== 'string') {
        throw new BadRequestException(
          'Every schema section must have a title.',
        );
      }

      if (!Array.isArray(section.fields)) {
        throw new BadRequestException(
          'Schema section fields must be an array.',
        );
      }

      for (const field of section.fields) {
        if (!isRecord(field)) {
          throw new BadRequestException(
            'Every schema field must be an object.',
          );
        }

        if (
          typeof field.fieldKey !== 'string' ||
          field.fieldKey.trim().length === 0 ||
          UNSAFE_SCHEMA_IDENTITY_KEYS.has(field.fieldKey.trim()) ||
          fieldKeys.has(field.fieldKey)
        ) {
          throw new BadRequestException(
            'Schema field keys must be globally nonempty and unique.',
          );
        }
        fieldKeys.add(field.fieldKey);

        if (
          typeof field.canonicalKey !== 'string' ||
          field.canonicalKey.trim().length === 0 ||
          UNSAFE_SCHEMA_IDENTITY_KEYS.has(field.canonicalKey.trim()) ||
          canonicalKeys.has(field.canonicalKey.trim()) ||
          typeof field.label !== 'string' ||
          field.label.trim().length === 0
        ) {
          throw new BadRequestException(
            'Schema fields must have nonempty canonical keys and labels.',
          );
        }
        canonicalKeys.add(field.canonicalKey.trim());

        if (
          typeof field.type !== 'string' ||
          !SUPPORTED_FIELD_TYPES.has(field.type as FormSchemaField['type'])
        ) {
          throw new BadRequestException('Schema field type is not supported.');
        }

        if (typeof field.required !== 'boolean') {
          throw new BadRequestException(
            'Schema field required must be boolean.',
          );
        }

        if (field.type === 'select' || field.type === 'radio') {
          const options = field.options;
          if (
            !Array.isArray(options) ||
            options.length === 0 ||
            !options.every(
              (option) =>
                typeof option === 'string' &&
                option.trim().length > 0 &&
                option === option.trim(),
            ) ||
            new Set(
              options.map((option: unknown) =>
                typeof option === 'string' ? option.trim() : option,
              ),
            ).size !== options.length
          ) {
            throw new BadRequestException(
              'Select and radio schema field options must be nonempty, trimmed, unique strings.',
            );
          }
        }
      }
    }

    if (formKey === PSF_REQUEST_FORM_KEY) {
      const fields: Record<string, unknown>[] = [];
      for (const section of schema.sections as unknown[]) {
        if (!isRecord(section) || !Array.isArray(section.fields)) continue;
        for (const candidate of section.fields as unknown[]) {
          if (isRecord(candidate)) fields.push(candidate);
        }
      }

      for (const requiredFieldKey of ['product_type', 'requester_name']) {
        const field = fields.find(
          (candidate) => candidate.fieldKey === requiredFieldKey,
        );
        if (!isRecord(field) || field.required !== true) {
          throw new BadRequestException(
            `Requester schema must keep ${requiredFieldKey} required.`,
          );
        }
      }
    }

    if (fieldKeys.size === 0) {
      throw new BadRequestException(
        'Draft schema must contain at least one field before publishing.',
      );
    }
  }

  private toVersionResponse(row: FormDefinitionRow): FormSchemaVersionResponse {
    if (!FORM_SCHEMA_STATUSES.has(row.status as FormSchemaStatus)) {
      throw new ConflictException(
        `Unsupported stored form schema status: ${row.status}`,
      );
    }

    return {
      formKey: row.form_key,
      version: row.version,
      title: row.title,
      description: row.description,
      status: row.status as FormSchemaStatus,
      schema: this.normalizeSchemaForResponse(row),
      createdBy: row.created_by,
      createdAt: this.serializeTimestamp(row.created_at),
      publishedAt: this.serializeTimestamp(row.published_at),
    };
  }

  private normalizeSchemaForResponse(row: FormDefinitionRow): FormSchemaJson {
    const storedSchema: Record<string, unknown> = isRecord(row.schema_json)
      ? row.schema_json
      : {};

    return {
      ...storedSchema,
      formKey: row.form_key,
      version: row.version,
      title: row.title,
      sections: Array.isArray(storedSchema.sections)
        ? this.stripLegacySectionMetadata(
            storedSchema.sections as FormSchemaSection[],
          )
        : [],
    };
  }

  private serializeTimestamp(value: Date | string): string;
  private serializeTimestamp(value: Date | string | null): string | null;
  private serializeTimestamp(value: Date | string | null): string | null {
    if (value === null) {
      return null;
    }

    return value instanceof Date ? value.toISOString() : value;
  }
}

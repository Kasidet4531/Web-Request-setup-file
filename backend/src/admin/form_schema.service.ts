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

export interface FormSchemaField {
  fieldKey: string;
  canonicalKey: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'radio';
  required: boolean;
  options?: string[];
  searchable?: boolean;
  exportable?: boolean;
  autofillTrigger?: boolean;
}

export interface FormSchemaSection {
  sectionKey: string;
  title: string;
  visibleTo: string[];
  fields: FormSchemaField[];
}

export interface FormSchemaJson {
  formKey: string;
  version: number;
  title: string;
  sections: FormSchemaSection[];
}

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

const PSF_REQUEST_FORM_KEY = 'psf-request';
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
const SUPPORTED_VISIBLE_TO = new Set(['requester', 'setup_owner', 'admin']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const DEFAULT_PSF_REQUEST_SCHEMA: FormSchemaJson = {
  formKey: PSF_REQUEST_FORM_KEY,
  version: 1,
  title: 'PSF Request Form',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester', 'setup_owner', 'admin'],
      fields: [
        {
          fieldKey: 'product_type',
          canonicalKey: 'product_type',
          label: 'Product Type',
          type: 'radio',
          required: true,
          options: ['New Product', 'Transfer Product', 'Existing Product'],
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'title',
          canonicalKey: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'requester_name',
          canonicalKey: 'requester',
          label: 'Requester Name',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'due_date',
          canonicalKey: 'due_date',
          label: 'Due Date',
          type: 'date',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'priority',
          canonicalKey: 'priority',
          label: 'Priority',
          type: 'select',
          required: true,
          options: ['Low', 'Normal', 'High', 'Urgent'],
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'product',
          canonicalKey: 'product',
          label: 'Product',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'wafer_fab',
          canonicalKey: 'wafer_fab',
          label: 'Wafer FAB',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'probecard_name',
          canonicalKey: 'probecard_name',
          label: 'Probecard Name',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'reference_psf_name',
          canonicalKey: 'reference_psf_name',
          label: 'Reference PSF Name',
          type: 'text',
          required: false,
          searchable: true,
          exportable: true,
          autofillTrigger: true,
        },
        {
          fieldKey: 'request_note',
          canonicalKey: 'request_note',
          label: 'Request Note',
          type: 'textarea',
          required: false,
          exportable: true,
        },
      ],
    },
  ],
};

@Injectable()
export class FormSchemaService implements OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.ensureFormDefinitionsStorage();
    await this.seedDefaultActivePsfRequestSchema();
  }

  async getActiveSchema(formKey: string): Promise<ActiveFormSchemaResponse> {
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

    return {
      formKey: activeSchema.form_key,
      version: activeSchema.version,
      title: activeSchema.title,
      description: activeSchema.description,
      status: activeSchema.status,
      schema: activeSchema.schema_json,
      publishedAt: this.serializeTimestamp(activeSchema.published_at),
    };
  }

  async listVersions(): Promise<FormSchemaVersionListResponse> {
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
      [PSF_REQUEST_FORM_KEY],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        `No form schema versions found for ${PSF_REQUEST_FORM_KEY}`,
      );
    }

    return {
      formKey: PSF_REQUEST_FORM_KEY,
      versions: result.rows.map((row) => this.toVersionResponse(row)),
    };
  }

  async saveDraft(
    dto: SaveFormSchemaDraftDto,
    actor: AuthenticatedUserProfile,
  ): Promise<FormSchemaVersionResponse> {
    const normalizedDto = this.assertDraftInput(dto);
    const createdBy = this.getActorUsername(actor);

    return this.withTransaction(async (client) => {
      const lockedRows = await this.lockManagedForm(client);
      const draftRows = lockedRows.filter((row) => row.status === 'draft');
      if (draftRows.length > 1) {
        throw new ConflictException(
          'Multiple draft schema versions exist for the managed form.',
        );
      }

      const existingDraft = draftRows[0];
      const version =
        existingDraft?.version ?? this.nextDraftVersion(lockedRows);
      const schema = this.normalizeDraftSchema(normalizedDto.schema, version);
      const description = normalizedDto.description ?? null;

      if (existingDraft) {
        const result = await client.query<FormDefinitionRow>(
          `
            UPDATE form_definitions
            SET title = $1, description = $2, schema_json = $3::jsonb
            WHERE form_key = $4 AND version = $5 AND status = 'draft'
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
          [
            schema.title,
            description,
            schema,
            PSF_REQUEST_FORM_KEY,
            existingDraft.version,
          ],
        );
        const updated = result.rows[0];
        if (!updated) {
          throw new ConflictException(
            'The schema draft changed before it could be saved.',
          );
        }

        return this.toVersionResponse(updated);
      }

      const result = await client.query<FormDefinitionRow>(
        `
          INSERT INTO form_definitions (
            id,
            form_key,
            version,
            title,
            description,
            schema_json,
            status,
            created_by,
            created_at,
            published_at
          )
          VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW(), NULL)
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
        [
          randomUUID(),
          PSF_REQUEST_FORM_KEY,
          version,
          schema.title,
          description,
          schema,
          'draft',
          createdBy,
        ],
      );
      const created = result.rows[0];
      if (!created) {
        throw new ConflictException('The schema draft could not be created.');
      }

      return this.toVersionResponse(created);
    });
  }

  async publishDraft(version: number): Promise<FormSchemaVersionResponse> {
    this.assertPublishVersion(version);

    return this.withTransaction(async (client) => {
      const lockedRows = await this.lockManagedForm(client);
      const target = lockedRows.find((row) => row.version === version);

      if (!target) {
        throw new NotFoundException(
          `Form schema version ${version} was not found for ${PSF_REQUEST_FORM_KEY}`,
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
      );

      await client.query(
        `
          UPDATE form_definitions
          SET status = 'published'
          WHERE form_key = $1 AND status = 'active'
        `,
        [PSF_REQUEST_FORM_KEY],
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
        [PSF_REQUEST_FORM_KEY, version],
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

  private async seedDefaultActivePsfRequestSchema(): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO form_definitions (
          id,
          form_key,
          version,
          title,
          description,
          schema_json,
          status,
          created_by,
          created_at,
          published_at
        )
        SELECT
          '00000000-0000-4000-8000-000000000001',
          $1,
          $2,
          $3,
          $4,
          $5::jsonb,
          $6,
          $7,
          NOW(),
          NOW()
        WHERE NOT EXISTS (
          SELECT 1
          FROM form_definitions
          WHERE form_key = $1 AND status = 'active'
        )
      `,
      [
        PSF_REQUEST_FORM_KEY,
        DEFAULT_PSF_REQUEST_SCHEMA.version,
        DEFAULT_PSF_REQUEST_SCHEMA.title,
        'Default requester-facing MVP schema for local PSF request creation.',
        DEFAULT_PSF_REQUEST_SCHEMA,
        'active',
        'system-seed',
      ],
    );
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
    client: PoolClient,
  ): Promise<FormDefinitionRow[]> {
    // Acquire the stable per-form anchor first. The second locked read then
    // starts with a fresh READ COMMITTED snapshot after any waiter is released.
    const anchor = await client.query<{ form_key: string }>(
      `
        SELECT form_key
        FROM form_definitions
        WHERE form_key = $1
        ORDER BY version ASC
        LIMIT 1
        FOR UPDATE
      `,
      [PSF_REQUEST_FORM_KEY],
    );

    if (anchor.rows.length === 0) {
      throw new NotFoundException(
        `No active form schema found for ${PSF_REQUEST_FORM_KEY}`,
      );
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
      [PSF_REQUEST_FORM_KEY],
    );
    const activeRows = result.rows.filter((row) => row.status === 'active');

    if (activeRows.length === 0) {
      throw new NotFoundException(
        `No active form schema found for ${PSF_REQUEST_FORM_KEY}`,
      );
    }

    if (activeRows.length !== 1) {
      throw new ConflictException(
        `Multiple active form schemas exist for ${PSF_REQUEST_FORM_KEY}.`,
      );
    }

    return result.rows;
  }

  private nextDraftVersion(rows: FormDefinitionRow[]): number {
    const maxVersion = Math.max(...rows.map((row) => row.version));

    if (
      !Number.isSafeInteger(maxVersion) ||
      maxVersion < 1 ||
      maxVersion >= Number.MAX_SAFE_INTEGER
    ) {
      throw new ConflictException(
        `Cannot allocate a new schema version for ${PSF_REQUEST_FORM_KEY}.`,
      );
    }

    return maxVersion + 1;
  }

  private assertDraftInput(dto: unknown): SaveFormSchemaDraftDto {
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
    if (schema.formKey !== PSF_REQUEST_FORM_KEY) {
      throw new BadRequestException(
        `schema.formKey must be ${PSF_REQUEST_FORM_KEY}.`,
      );
    }

    if (typeof schema.title !== 'string' || schema.title.trim().length === 0) {
      throw new BadRequestException('schema.title must not be blank.');
    }

    if (!Array.isArray(schema.sections)) {
      throw new BadRequestException('schema.sections must be an array.');
    }

    return {
      description: description ?? null,
      schema: {
        formKey: PSF_REQUEST_FORM_KEY,
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
  ): FormSchemaJson {
    return {
      formKey: PSF_REQUEST_FORM_KEY,
      version,
      title: schema.title,
      sections: schema.sections,
    };
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
  ): void {
    if (!isRecord(schema)) {
      throw new BadRequestException('Draft schema must be an object.');
    }

    if (
      schema.formKey !== PSF_REQUEST_FORM_KEY ||
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

    const sectionKeys = new Set<string>();
    const fieldKeys = new Set<string>();

    for (const section of schema.sections) {
      if (!isRecord(section)) {
        throw new BadRequestException(
          'Every schema section must be an object.',
        );
      }

      if (
        typeof section.sectionKey !== 'string' ||
        section.sectionKey.trim().length === 0 ||
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

      if (
        !Array.isArray(section.visibleTo) ||
        section.visibleTo.length === 0 ||
        !section.visibleTo.every(
          (role) => typeof role === 'string' && SUPPORTED_VISIBLE_TO.has(role),
        )
      ) {
        throw new BadRequestException(
          'Schema section visibleTo values must be supported roles.',
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
          typeof field.label !== 'string' ||
          field.label.trim().length === 0
        ) {
          throw new BadRequestException(
            'Schema fields must have nonempty canonical keys and labels.',
          );
        }

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

        if (
          (field.type === 'select' || field.type === 'radio') &&
          (!Array.isArray(field.options) ||
            !field.options.every((option) => typeof option === 'string'))
        ) {
          throw new BadRequestException(
            'Select and radio schema field options must be strings.',
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
        ? (storedSchema.sections as FormSchemaSection[])
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

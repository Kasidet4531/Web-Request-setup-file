import {
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
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

interface FormDefinitionRow {
  form_key: string;
  version: number;
  title: string;
  description: string | null;
  status: string;
  schema_json: FormSchemaJson;
  published_at: Date | string | null;
}

const PSF_REQUEST_FORM_KEY = 'psf-request';

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

  private serializeTimestamp(value: Date | string | null): string | null {
    if (value === null) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return value;
  }
}

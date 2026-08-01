import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_POOL } from '../database/database.service';
import { FormSchemaService, type FormSchemaJson } from './form_schema.service';

const PSF_REQUEST_FORM_KEY = 'psf-request';

const adminActor = {
  id: 'admin-1',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};

const makeValidSchema = (
  version: number,
  title = 'PSF Request Form',
): FormSchemaJson => ({
  formKey: PSF_REQUEST_FORM_KEY,
  version,
  title,
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester', 'setup_owner', 'admin'],
      fields: [
        {
          fieldKey: 'title',
          canonicalKey: 'title',
          label: 'Title',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
});

const makeRow = (
  version: number,
  status: string,
  overrides: Record<string, unknown> = {},
) => ({
  form_key: PSF_REQUEST_FORM_KEY,
  version,
  title: `PSF Request Form v${version}`,
  description: `Schema version ${version}`,
  status,
  schema_json: makeValidSchema(version, `PSF Request Form v${version}`),
  created_by: 'admin.demo',
  created_at: new Date('2026-06-01T00:00:00.000Z'),
  published_at:
    status === 'active' || status === 'published'
      ? new Date('2026-06-01T00:00:00.000Z')
      : null,
  ...overrides,
});

describe('FormSchemaService', () => {
  const transactionClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const pool = {
    query: jest.fn(),
    connect: jest.fn(),
  };

  let service: FormSchemaService;

  const configureTransaction = (
    handler: (query: string, values?: unknown[]) => unknown,
  ): void => {
    transactionClient.query.mockImplementation(
      (query: string, values?: unknown[]) => {
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(query)) {
          return Promise.resolve({ rows: [] });
        }

        return handler(query, values);
      },
    );
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    pool.connect.mockResolvedValue(transactionClient);
    configureTransaction(() => ({ rows: [] }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormSchemaService,
        {
          provide: DATABASE_POOL,
          useValue: pool,
        },
      ],
    }).compile();

    service = module.get(FormSchemaService);
  });

  it('creates form_definitions storage and seeds the default active PSF request schema', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await service.onModuleInit();

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS form_definitions'),
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('idx_form_definitions_active_form_key'),
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('idx_form_definitions_draft_form_key'),
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO form_definitions'),
      expect.arrayContaining([
        'psf-request',
        1,
        'PSF Request Form',
        'active',
        'system-seed',
        expect.objectContaining({
          formKey: 'psf-request',
          version: 1,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          sections: expect.arrayContaining([
            expect.objectContaining({
              sectionKey: 'requester_information',
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              fields: expect.arrayContaining([
                expect.objectContaining({
                  fieldKey: 'product_type',
                  type: 'radio',
                  required: true,
                  options: [
                    'New Product',
                    'Transfer Product',
                    'Existing Product',
                  ],
                }),
                expect.objectContaining({ fieldKey: 'title', required: true }),
                expect.objectContaining({
                  fieldKey: 'probecard_name',
                  required: true,
                }),
              ]),
            }),
          ]),
        }),
      ]),
    );
  });

  it('returns the active schema using the public API response shape', async () => {
    const schemaJson = {
      formKey: 'psf-request',
      version: 1,
      sections: [],
    };
    pool.query.mockResolvedValue({
      rows: [
        {
          form_key: 'psf-request',
          version: 1,
          title: 'PSF Request Form',
          description: 'Requester-facing MVP schema',
          status: 'active',
          schema_json: schemaJson,
          published_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });

    await expect(service.getActiveSchema('psf-request')).resolves.toEqual({
      formKey: 'psf-request',
      version: 1,
      title: 'PSF Request Form',
      description: 'Requester-facing MVP schema',
      status: 'active',
      schema: schemaJson,
      publishedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('raises NotFoundException when no active schema exists for a form key', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await expect(
      service.getActiveSchema('missing-form'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists stored PSF request schema versions newest first and maps server-owned schema fields', async () => {
    const newest = makeRow(3, 'draft', {
      schema_json: {
        ...makeValidSchema(999, 'Client title'),
        formKey: 'untrusted-form-key',
        version: 999,
      },
    });
    const active = makeRow(2, 'active');
    pool.query.mockResolvedValue({ rows: [newest, active] });

    await expect(service.listVersions()).resolves.toEqual({
      formKey: PSF_REQUEST_FORM_KEY,
      versions: [
        expect.objectContaining({
          formKey: PSF_REQUEST_FORM_KEY,
          version: 3,
          title: 'PSF Request Form v3',
          description: 'Schema version 3',
          status: 'draft',
          createdBy: 'admin.demo',
          createdAt: '2026-06-01T00:00:00.000Z',
          publishedAt: null,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          schema: expect.objectContaining({
            formKey: PSF_REQUEST_FORM_KEY,
            version: 3,
            title: 'PSF Request Form v3',
          }),
        }),
        expect.objectContaining({
          version: 2,
          status: 'active',
        }),
      ],
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY version DESC'),
      [PSF_REQUEST_FORM_KEY],
    );
  });

  it('raises NotFoundException when the fixed form has no stored versions', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await expect(service.listVersions()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('locks the managed form before allocating its first draft, normalizes server-owned fields, and records the server actor', async () => {
    const active = makeRow(1, 'active');
    const created = makeRow(2, 'draft', {
      title: 'Updated PSF Request Form',
      description: 'Editable draft',
      schema_json: makeValidSchema(2, 'Updated PSF Request Form'),
      created_at: new Date('2026-06-02T00:00:00.000Z'),
      published_at: null,
    });
    configureTransaction((query) => {
      if (query.includes('ORDER BY version ASC')) {
        return { rows: [{ form_key: PSF_REQUEST_FORM_KEY }] };
      }

      if (query.includes('FOR UPDATE')) {
        return { rows: [active] };
      }

      if (query.includes('INSERT INTO form_definitions')) {
        return { rows: [created] };
      }

      throw new Error(`Unexpected query: ${query}`);
    });
    const suppliedSchema = {
      ...makeValidSchema(999, '  Updated PSF Request Form  '),
      formKey: PSF_REQUEST_FORM_KEY,
      version: 999,
      status: 'active',
      createdBy: 'client-controlled',
    };

    await expect(
      service.saveDraft(
        {
          description: 'Editable draft',
          schema: suppliedSchema,
        },
        adminActor,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        formKey: PSF_REQUEST_FORM_KEY,
        version: 2,
        status: 'draft',
        createdBy: 'admin.demo',
        createdAt: '2026-06-02T00:00:00.000Z',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        schema: expect.objectContaining({
          formKey: PSF_REQUEST_FORM_KEY,
          version: 2,
          title: 'Updated PSF Request Form',
        }),
      }),
    );

    expect(transactionClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(transactionClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ORDER BY version ASC'),
      [PSF_REQUEST_FORM_KEY],
    );
    expect(transactionClient.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('ORDER BY version DESC'),
      [PSF_REQUEST_FORM_KEY],
    );
    expect(transactionClient.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO form_definitions'),
      [
        expect.any(String),
        PSF_REQUEST_FORM_KEY,
        2,
        'Updated PSF Request Form',
        'Editable draft',
        {
          formKey: PSF_REQUEST_FORM_KEY,
          version: 2,
          title: 'Updated PSF Request Form',
          sections: suppliedSchema.sections,
        },
        'draft',
        'admin.demo',
      ],
    );
    expect(transactionClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });

  it('rereads managed rows after a stable anchor lock before updating a concurrent draft', async () => {
    const active = makeRow(1, 'active');
    const existingDraft = makeRow(2, 'draft', {
      created_by: 'first.admin',
      published_at: null,
    });
    const updated = makeRow(2, 'draft', {
      title: 'Concurrent Draft',
      schema_json: makeValidSchema(2, 'Concurrent Draft'),
      created_by: 'first.admin',
      published_at: null,
    });
    configureTransaction((query) => {
      if (query.includes('ORDER BY version ASC')) {
        return { rows: [{ form_key: PSF_REQUEST_FORM_KEY }] };
      }

      if (query.includes('ORDER BY version DESC')) {
        return { rows: [active, existingDraft] };
      }

      if (query.includes('SET title = $1')) {
        return { rows: [updated] };
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    await expect(
      service.saveDraft(
        {
          schema: {
            formKey: PSF_REQUEST_FORM_KEY,
            title: 'Concurrent Draft',
            sections: makeValidSchema(2).sections,
          },
        },
        adminActor,
      ),
    ).resolves.toMatchObject({ version: 2, status: 'draft' });

    const statements = transactionClient.query.mock.calls.map(
      ([query]) => query as string,
    );
    const anchorLockIndex = statements.findIndex((query) =>
      query.includes('ORDER BY version ASC'),
    );
    const rereadIndex = statements.findIndex((query) =>
      query.includes('ORDER BY version DESC'),
    );
    const updateIndex = statements.findIndex((query) =>
      query.includes('SET title = $1'),
    );

    expect(anchorLockIndex).toBeGreaterThan(0);
    expect(rereadIndex).toBeGreaterThan(anchorLockIndex);
    expect(updateIndex).toBeGreaterThan(rereadIndex);
    expect(statements[anchorLockIndex]).toContain('FOR UPDATE');
    expect(statements[rereadIndex]).toContain('FOR UPDATE');
    expect(transactionClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO form_definitions'),
      expect.anything(),
    );
  });

  it('updates the same locked draft instead of allocating another version', async () => {
    const active = makeRow(1, 'active');
    const existingDraft = makeRow(2, 'draft', {
      created_by: 'first.admin',
      published_at: null,
    });
    const updated = makeRow(2, 'draft', {
      title: 'Retitled Draft',
      description: null,
      schema_json: makeValidSchema(2, 'Retitled Draft'),
      created_by: 'first.admin',
      published_at: null,
    });
    configureTransaction((query) => {
      if (query.includes('FOR UPDATE')) {
        return { rows: [active, existingDraft] };
      }

      if (query.includes('SET title = $1')) {
        return { rows: [updated] };
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    await expect(
      service.saveDraft(
        {
          schema: {
            formKey: PSF_REQUEST_FORM_KEY,
            title: 'Retitled Draft',
            sections: makeValidSchema(2).sections,
          },
        },
        adminActor,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        version: 2,
        status: 'draft',
        createdBy: 'first.admin',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        schema: expect.objectContaining({ version: 2 }),
      }),
    );

    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "WHERE form_key = $4 AND version = $5 AND status = 'draft'",
      ),
      [
        'Retitled Draft',
        null,
        {
          formKey: PSF_REQUEST_FORM_KEY,
          version: 2,
          title: 'Retitled Draft',
          sections: makeValidSchema(2).sections,
        },
        PSF_REQUEST_FORM_KEY,
        2,
      ],
    );
    expect(transactionClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO form_definitions'),
      expect.anything(),
    );
    expect(transactionClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the lock query has no active managed form anchor', async () => {
    configureTransaction((query) => {
      if (query.includes('FOR UPDATE')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    await expect(
      service.saveDraft(
        {
          schema: {
            formKey: PSF_REQUEST_FORM_KEY,
            title: 'Draft',
            sections: [],
          },
        },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(transactionClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });

  it('demotes the locked active schema before atomically promoting a valid draft while preserving the prior publication timestamp', async () => {
    const active = makeRow(1, 'active', {
      published_at: new Date('2026-06-01T00:00:00.000Z'),
    });
    const draft = makeRow(2, 'draft', {
      published_at: null,
      schema_json: makeValidSchema(2, 'Published Draft'),
      title: 'Published Draft',
    });
    const promoted = makeRow(2, 'active', {
      published_at: new Date('2026-06-03T00:00:00.000Z'),
      schema_json: makeValidSchema(2, 'Published Draft'),
      title: 'Published Draft',
    });
    configureTransaction((query) => {
      if (query.includes('FOR UPDATE')) {
        return { rows: [active, draft] };
      }

      if (query.includes("SET status = 'published'")) {
        return { rows: [] };
      }

      if (query.includes("SET status = 'active'")) {
        return { rows: [promoted] };
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    await expect(service.publishDraft(2)).resolves.toEqual(
      expect.objectContaining({
        formKey: PSF_REQUEST_FORM_KEY,
        version: 2,
        status: 'active',
        publishedAt: '2026-06-03T00:00:00.000Z',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        schema: expect.objectContaining({
          formKey: PSF_REQUEST_FORM_KEY,
          version: 2,
        }),
      }),
    );

    const statements = transactionClient.query.mock.calls.map(
      ([query]) => query as string,
    );
    const demotionIndex = statements.findIndex((query) =>
      query.includes("SET status = 'published'"),
    );
    const promotionIndex = statements.findIndex((query) =>
      query.includes("SET status = 'active'"),
    );
    expect(demotionIndex).toBeGreaterThan(0);
    expect(promotionIndex).toBeGreaterThan(demotionIndex);
    expect(statements[demotionIndex]).not.toContain('published_at');
    expect(statements[promotionIndex]).toContain('published_at = NOW()');
    expect(transactionClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back publishing a missing version after locking the managed form', async () => {
    const active = makeRow(1, 'active');
    configureTransaction((query) => {
      if (query.includes('FOR UPDATE')) {
        return { rows: [active] };
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    await expect(service.publishDraft(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(transactionClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back publishing an existing version that is not a draft', async () => {
    const active = makeRow(1, 'active');
    const historical = makeRow(2, 'published');
    configureTransaction((query) => {
      if (query.includes('FOR UPDATE')) {
        return { rows: [active, historical] };
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    await expect(service.publishDraft(2)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transactionClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      description: 'duplicate field keys',
      schema: {
        ...makeValidSchema(2, 'PSF Request Form v2'),
        sections: [
          {
            sectionKey: 'requester_information',
            title: 'Requester Information',
            visibleTo: ['requester'],
            fields: [
              {
                fieldKey: 'title',
                canonicalKey: 'title',
                label: 'Title',
                type: 'text',
                required: true,
              },
              {
                fieldKey: 'title',
                canonicalKey: 'alternate_title',
                label: 'Alternate title',
                type: 'text',
                required: false,
              },
            ],
          },
        ],
      },
    },
    {
      description: 'an unsupported visible role',
      schema: {
        ...makeValidSchema(2, 'PSF Request Form v2'),
        sections: [
          {
            ...makeValidSchema(2, 'PSF Request Form v2').sections[0],
            visibleTo: ['auditor'],
          },
        ],
      },
    },
    {
      description: 'non-string select options',
      schema: {
        ...makeValidSchema(2, 'PSF Request Form v2'),
        sections: [
          {
            ...makeValidSchema(2, 'PSF Request Form v2').sections[0],
            fields: [
              {
                fieldKey: 'priority',
                canonicalKey: 'priority',
                label: 'Priority',
                type: 'select',
                required: true,
                options: ['High', 7],
              },
            ],
          },
        ],
      },
    },
  ])(
    'rejects a draft with $description before changing active status',
    async ({ schema }) => {
      const active = makeRow(1, 'active');
      const invalidDraft = makeRow(2, 'draft', {
        schema_json: schema,
        published_at: null,
      });
      configureTransaction((query) => {
        if (query.includes('FOR UPDATE')) {
          return { rows: [active, invalidDraft] };
        }

        throw new Error(`Unexpected query: ${query}`);
      });

      await expect(service.publishDraft(2)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(transactionClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'published'"),
        expect.anything(),
      );
      expect(transactionClient.query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(transactionClient.release).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves the original database error when rollback itself fails', async () => {
    const active = makeRow(1, 'active');
    const insertFailure = new Error('draft insert failed');
    transactionClient.query.mockImplementation((query: string) => {
      if (query === 'BEGIN') {
        return Promise.resolve({ rows: [] });
      }

      if (query.includes('FOR UPDATE')) {
        return Promise.resolve({ rows: [active] });
      }

      if (query.includes('INSERT INTO form_definitions')) {
        return Promise.reject(insertFailure);
      }

      if (query === 'ROLLBACK') {
        return Promise.reject(new Error('rollback failed'));
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    await expect(
      service.saveDraft(
        {
          schema: {
            formKey: PSF_REQUEST_FORM_KEY,
            title: 'Draft',
            sections: [],
          },
        },
        adminActor,
      ),
    ).rejects.toBe(insertFailure);
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });
});

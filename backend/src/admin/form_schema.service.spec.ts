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
      fields: [
        {
          fieldKey: 'product_type',
          canonicalKey: 'product_type',
          label: 'Product Type',
          type: 'radio',
          required: true,
          options: ['New Product', 'Transfer Product', 'Existing Product'],
        },
        {
          fieldKey: 'requester_name',
          canonicalKey: 'requester',
          label: 'Requester Name',
          type: 'text',
          required: true,
        },
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

  it('seeds the fixed PSF Created Information schema as an independent active form', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await service.onModuleInit();

    const seedCalls = pool.query.mock.calls.filter(([, values]) =>
      (values as unknown[] | undefined)?.includes('psf-created-information'),
    );
    expect(seedCalls).toHaveLength(1);
    const seedCall = seedCalls[0] as [string, unknown[]?] | undefined;
    expect(seedCall?.[1]).toEqual(
      expect.arrayContaining([
        'psf-created-information',
        1,
        'PSF Created Information',
        'active',
        'system-seed',
      ]),
    );
  });

  it('returns the active schema using the public API response shape', async () => {
    const schemaJson = makeValidSchema(1, 'PSF Request Form');
    const storedSchema = structuredClone(schemaJson);
    Object.assign(storedSchema.sections[0], {
      visibleTo: ['requester', 'setup_owner', 'admin'],
    });
    pool.query.mockResolvedValue({
      rows: [
        {
          form_key: 'psf-request',
          version: 1,
          title: 'PSF Request Form',
          description: 'Requester-facing MVP schema',
          status: 'active',
          schema_json: storedSchema,
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

  it('locks and reads the active schema through the caller transaction', async () => {
    const active = makeRow(2, 'active');
    transactionClient.query.mockResolvedValue({ rows: [active] });

    await expect(
      service.getActiveSchemaForUpdate(PSF_REQUEST_FORM_KEY, transactionClient),
    ).resolves.toEqual(
      expect.objectContaining({
        formKey: PSF_REQUEST_FORM_KEY,
        version: 2,
        status: 'active',
      }),
    );

    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      [PSF_REQUEST_FORM_KEY],
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects an unsupported form key before querying active schema storage', async () => {
    await expect(
      service.getActiveSchema('missing-form'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('refuses a legacy active schema with restricted roles instead of exposing its fields', async () => {
    const active = makeRow(1, 'active');
    Object.assign(active.schema_json.sections[0], { visibleTo: ['admin'] });
    pool.query.mockResolvedValue({ rows: [active] });

    await expect(
      service.getActiveSchema(PSF_REQUEST_FORM_KEY),
    ).rejects.toBeInstanceOf(ConflictException);
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
      expect.stringContaining('WHERE form_key = $1'),
      [PSF_REQUEST_FORM_KEY],
    );
    const calls = pool.query.mock.calls as [string, unknown[]][];
    expect(calls[0][0]).not.toContain('discarded');
  });

  it('normalizes shared legacy sections for admin responses without erasing restricted historical metadata', async () => {
    const active = makeRow(2, 'active');
    const historical = makeRow(1, 'published');
    Object.assign(active.schema_json.sections[0], {
      visibleTo: ['requester', 'setup_owner', 'admin'],
    });
    Object.assign(historical.schema_json.sections[0], { visibleTo: ['admin'] });
    pool.query.mockResolvedValue({ rows: [active, historical] });

    const result = await service.listVersions();
    expect(result.versions[0].schema.sections[0]).not.toHaveProperty(
      'visibleTo',
    );
    expect(result.versions[1].schema.sections[0]).toHaveProperty('visibleTo', [
      'admin',
    ]);
    expect(active.schema_json.sections[0]).toHaveProperty('visibleTo');
  });

  it('raises NotFoundException when the fixed form has no stored versions', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await expect(service.listVersions()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('duplicates a historical version into a new draft without modifying the source', async () => {
    const old = makeRow(1, 'published');
    Object.assign(old.schema_json.sections[0], {
      visibleTo: ['requester', 'setup_owner', 'admin'],
    });
    const active = makeRow(2, 'active');
    const copy = makeRow(3, 'draft', {
      schema_json: makeValidSchema(3, old.title),
      title: old.title,
    });
    configureTransaction((query) => {
      if (query.includes('ORDER BY version ASC'))
        return { rows: [{ form_key: PSF_REQUEST_FORM_KEY }] };
      if (query.includes('FOR UPDATE')) return { rows: [active, old] };
      if (query.includes('INSERT INTO form_definitions'))
        return { rows: [copy] };
      throw new Error(`Unexpected query: ${query}`);
    });
    await expect(
      service.duplicateVersion(1, adminActor),
    ).resolves.toMatchObject({ version: 3, status: 'draft' });
    const insert = transactionClient.query.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO form_definitions'),
    ) as [string, unknown[]] | undefined;
    expect(insert?.[1]).toEqual(
      expect.arrayContaining([
        3,
        old.title,
        {
          ...old.schema_json,
          version: 3,
          sections: old.schema_json.sections.map((section) => ({
            sectionKey: section.sectionKey,
            title: section.title,
            fields: section.fields,
          })),
        },
      ]),
    );
    expect(old.schema_json.sections[0]).toHaveProperty('visibleTo', [
      'requester',
      'setup_owner',
      'admin',
    ]);
  });

  it('allocates PSF Created Information versions independently of requester form versions', async () => {
    const psfCreatedSchema = {
      formKey: 'psf-created-information',
      version: 1,
      title: 'PSF Created Information',
      sections: [
        {
          sectionKey: 'setup',
          title: 'Setup',
          fields: [
            {
              fieldKey: 'mirror_die_available',
              canonicalKey: 'mirror_die_available',
              label: 'Mirror Die Available',
              type: 'select' as const,
              required: false,
              options: ['Yes', 'No'],
            },
          ],
        },
      ],
    };
    const active = makeRow(1, 'active', {
      form_key: 'psf-created-information',
      title: psfCreatedSchema.title,
      schema_json: psfCreatedSchema,
    });
    const draft = makeRow(2, 'draft', {
      form_key: 'psf-created-information',
      title: psfCreatedSchema.title,
      schema_json: { ...psfCreatedSchema, version: 2 },
    });
    configureTransaction((query) => {
      if (query.includes('ORDER BY version ASC'))
        return { rows: [{ form_key: 'psf-created-information' }] };
      if (query.includes('ORDER BY version DESC')) return { rows: [active] };
      if (query.includes('INSERT INTO form_definitions'))
        return { rows: [draft] };
      throw new Error(`Unexpected query: ${query}`);
    });

    await expect(
      service.duplicateVersion(1, adminActor, 'psf-created-information'),
    ).resolves.toMatchObject({
      formKey: 'psf-created-information',
      version: 2,
      status: 'draft',
    });
    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO form_definitions'),
      expect.arrayContaining([
        'psf-created-information',
        2,
        expect.objectContaining({
          formKey: 'psf-created-information',
          version: 2,
        }),
      ]),
    );
  });

  it('rejects duplication while another draft exists without overwriting it', async () => {
    configureTransaction((query) => {
      if (query.includes('ORDER BY version ASC'))
        return { rows: [{ form_key: PSF_REQUEST_FORM_KEY }] };
      if (query.includes('FOR UPDATE'))
        return {
          rows: [
            makeRow(3, 'draft'),
            makeRow(2, 'active'),
            makeRow(1, 'published'),
          ],
        };
      throw new Error(`Unexpected query: ${query}`);
    });
    await expect(
      service.duplicateVersion(1, adminActor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transactionClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('refuses to save when no draft exists rather than silently creating one', async () => {
    configureTransaction((query) => {
      if (query.includes('ORDER BY version ASC'))
        return { rows: [{ form_key: PSF_REQUEST_FORM_KEY }] };
      if (query.includes('FOR UPDATE')) return { rows: [makeRow(1, 'active')] };
      throw new Error(`Unexpected query: ${query}`);
    });
    await expect(
      service.saveDraft(
        { draftVersion: 2, schema: makeValidSchema(1) },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transactionClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('never updates an existing draft unless its exact version was supplied', async () => {
    configureTransaction((query) => {
      if (query.includes('ORDER BY version ASC'))
        return { rows: [{ form_key: PSF_REQUEST_FORM_KEY }] };
      if (query.includes('FOR UPDATE'))
        return { rows: [makeRow(2, 'draft'), makeRow(1, 'active')] };
      throw new Error(`Unexpected query: ${query}`);
    });
    await expect(
      service.saveDraft(
        { schema: makeValidSchema(1), draftVersion: 1 },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transactionClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('refuses to erase restricted legacy metadata from an existing draft', async () => {
    const draft = makeRow(2, 'draft');
    Object.assign(draft.schema_json.sections[0], { visibleTo: ['admin'] });
    configureTransaction((query) => {
      if (query.includes('ORDER BY version ASC'))
        return { rows: [{ form_key: PSF_REQUEST_FORM_KEY }] };
      if (query.includes('FOR UPDATE'))
        return { rows: [draft, makeRow(1, 'active')] };
      throw new Error(`Unexpected query: ${query}`);
    });
    await expect(
      service.saveDraft(
        { draftVersion: 2, schema: makeValidSchema(2) },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      transactionClient.query.mock.calls.some(([sql]) =>
        (sql as string).includes('SET title = $1'),
      ),
    ).toBe(false);
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
          draftVersion: 2,
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
          draftVersion: 2,
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
          draftVersion: 2,
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

  it('deletes only the unpublished draft so its version can be used again', async () => {
    let rows = [makeRow(2, 'draft'), makeRow(1, 'active')];
    configureTransaction((query) => {
      if (query.includes('ORDER BY version ASC'))
        return { rows: [{ form_key: PSF_REQUEST_FORM_KEY }] };
      if (query.includes('FOR UPDATE')) return { rows };
      if (query.includes('DELETE FROM form_definitions')) {
        rows = rows.filter((row) => row.version !== 2);
        return { rows: [{ version: 2 }] };
      }
      if (query.includes('INSERT INTO form_definitions')) {
        const next = makeRow(2, 'draft');
        rows = [next, ...rows];
        return { rows: [next] };
      }
      throw new Error(`Unexpected query: ${query}`);
    });
    await expect(service.discardDraft(2)).resolves.toBeUndefined();
    expect(rows.map((row) => row.version)).toEqual([1]);
    await expect(
      service.duplicateVersion(1, adminActor),
    ).resolves.toMatchObject({ version: 2 });
    expect(rows.map((row) => row.version)).toEqual([2, 1]);
    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM form_definitions'),
      [PSF_REQUEST_FORM_KEY, 2],
    );
    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'draft' AND published_at IS NULL"),
      [PSF_REQUEST_FORM_KEY, 2],
    );
  });

  it('refuses to discard an active or historical version', async () => {
    configureTransaction((query) => {
      if (query.includes('ORDER BY version ASC'))
        return { rows: [{ form_key: PSF_REQUEST_FORM_KEY }] };
      if (query.includes('FOR UPDATE'))
        return { rows: [makeRow(2, 'active'), makeRow(1, 'published')] };
      throw new Error(`Unexpected query: ${query}`);
    });
    await expect(service.discardDraft(2)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('publishes a safe draft with a new canonical identity while preserving the prior publication timestamp', async () => {
    const active = makeRow(1, 'active', {
      published_at: new Date('2026-06-01T00:00:00.000Z'),
    });
    const schemaWithoutVisibility = {
      ...makeValidSchema(2, 'Published Draft'),
      sections: [
        {
          sectionKey: 'requester_information',
          title: 'Requester Information',
          fields: makeValidSchema(2).sections[0].fields,
        },
      ],
    };
    schemaWithoutVisibility.sections[0].fields[2].canonicalKey = 'title_v2';
    const draft = makeRow(2, 'draft', {
      published_at: null,
      schema_json: schemaWithoutVisibility,
      title: 'Published Draft',
    });
    const promoted = makeRow(2, 'active', {
      published_at: new Date('2026-06-03T00:00:00.000Z'),
      schema_json: schemaWithoutVisibility,
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
      exception: BadRequestException,
      schema: {
        ...makeValidSchema(2, 'PSF Request Form v2'),
        sections: [
          {
            sectionKey: 'requester_information',
            title: 'Requester Information',
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
      description: 'a restricted legacy section',
      exception: ConflictException,
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
      exception: BadRequestException,
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
    ...[
      { description: 'empty select options', options: [] },
      { description: 'blank select options', options: ['   '] },
      { description: 'duplicate select options', options: ['Yes', 'Yes'] },
      { description: 'untrimmed select options', options: [' Yes', 'No'] },
      {
        description: 'trim-colliding select options',
        options: ['Yes', ' Yes '],
      },
    ].map(({ description, options }) => ({
      description,
      exception: BadRequestException,
      schema: {
        ...makeValidSchema(2, 'PSF Request Form v2'),
        sections: [
          {
            ...makeValidSchema(2, 'PSF Request Form v2').sections[0],
            fields: [
              {
                fieldKey: 'product_type',
                canonicalKey: 'product_type',
                label: 'Product Type',
                type: 'select',
                required: true,
                options,
              },
              ...makeValidSchema(
                2,
                'PSF Request Form v2',
              ).sections[0].fields.slice(1),
            ],
          },
        ],
      },
    })),
    {
      description: 'a prototype-reserved field key',
      exception: BadRequestException,
      schema: {
        ...makeValidSchema(2, 'PSF Request Form v2'),
        sections: [
          {
            ...makeValidSchema(2, 'PSF Request Form v2').sections[0],
            fields: [
              ...makeValidSchema(2, 'PSF Request Form v2').sections[0].fields,
              {
                fieldKey: 'constructor',
                canonicalKey: 'custom_field',
                label: 'Custom Field',
                type: 'text',
                required: false,
              },
            ],
          },
        ],
      },
    },
    {
      description: 'a prototype-reserved canonical key',
      exception: BadRequestException,
      schema: {
        ...makeValidSchema(2, 'PSF Request Form v2'),
        sections: [
          {
            ...makeValidSchema(2, 'PSF Request Form v2').sections[0],
            fields: [
              {
                ...makeValidSchema(2, 'PSF Request Form v2').sections[0]
                  .fields[0],
                canonicalKey: 'toString',
              },
              ...makeValidSchema(
                2,
                'PSF Request Form v2',
              ).sections[0].fields.slice(1),
            ],
          },
        ],
      },
    },
    {
      description: 'a prototype-reserved section key',
      exception: BadRequestException,
      schema: {
        ...makeValidSchema(2, 'PSF Request Form v2'),
        sections: [
          {
            ...makeValidSchema(2, 'PSF Request Form v2').sections[0],
            sectionKey: '__proto__',
          },
        ],
      },
    },
    {
      description: 'canonical keys that collide after trimming across sections',
      exception: BadRequestException,
      schema: {
        ...makeValidSchema(2, 'PSF Request Form v2'),
        sections: [
          {
            ...makeValidSchema(2, 'PSF Request Form v2').sections[0],
            fields: [
              ...makeValidSchema(2, 'PSF Request Form v2').sections[0].fields,
              {
                fieldKey: 'first_custom_field',
                canonicalKey: 'shared_identity',
                label: 'First',
                type: 'text',
                required: false,
              },
            ],
          },
          {
            sectionKey: 'other_section',
            title: 'Other Section',
            fields: [
              {
                fieldKey: 'second_custom_field',
                canonicalKey: ' shared_identity ',
                label: 'Second',
                type: 'text',
                required: false,
              },
            ],
          },
        ],
      },
    },
  ])(
    'rejects a draft with $description before changing active status',
    async ({ schema, exception }) => {
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

      await expect(service.publishDraft(2)).rejects.toBeInstanceOf(exception);
      expect(transactionClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'published'"),
        expect.anything(),
      );
      expect(transactionClient.query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(transactionClient.release).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects invalid schema choices before updating a draft', async () => {
    const active = makeRow(1, 'active');
    const draft = makeRow(2, 'draft');
    const invalidSchema = makeValidSchema(2);
    invalidSchema.sections[0].fields[0].options = [];
    configureTransaction((query) => {
      if (query.includes('FOR UPDATE')) return { rows: [draft, active] };
      if (query.includes('SET title = $1')) {
        return {
          rows: [makeRow(2, 'draft', { schema_json: invalidSchema })],
        };
      }
      throw new Error(`Unexpected query: ${query}`);
    });

    await expect(
      service.saveDraft({ draftVersion: 2, schema: invalidSchema }, adminActor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactionClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET title = $1'),
      expect.anything(),
    );
    expect(transactionClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('preserves the original database error when rollback itself fails', async () => {
    const updateFailure = new Error('draft update failed');
    transactionClient.query.mockImplementation((query: string) => {
      if (query === 'BEGIN') return Promise.resolve({ rows: [] });
      if (query.includes('FOR UPDATE'))
        return Promise.resolve({
          rows: [makeRow(2, 'draft'), makeRow(1, 'active')],
        });
      if (query.includes('UPDATE form_definitions'))
        return Promise.reject(updateFailure);
      if (query === 'ROLLBACK')
        return Promise.reject(new Error('rollback failed'));
      throw new Error(`Unexpected query: ${query}`);
    });
    await expect(
      service.saveDraft(
        { draftVersion: 2, schema: makeValidSchema(2) },
        adminActor,
      ),
    ).rejects.toBe(updateFailure);
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });
});

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_POOL } from '../database/database.service';
import {
  FormSchemaService,
  type ActiveFormSchemaResponse,
} from './form_schema.service';
import { AutofillRuleService } from './autofill_rule.service';

type StoredRule = {
  id: string;
  form_key: string;
  trigger_canonical_key: string;
  lookup_source: string;
  fill_targets_json: string[];
  status: string;
  created_at: Date;
  updated_at: Date;
};

const activeSchema = {
  formKey: 'psf-request',
  version: 1,
  title: 'PSF Request Form',
  description: null,
  status: 'active',
  publishedAt: '2026-08-11T00:00:00.000Z',
  schema: {
    formKey: 'psf-request',
    version: 1,
    title: 'PSF Request Form',
    sections: [
      {
        sectionKey: 'requester_information',
        title: 'Requester Information',
        visibleTo: ['requester', 'setup_owner', 'admin'],
        fields: [
          {
            fieldKey: 'reference_psf_name',
            canonicalKey: 'reference_psf_name',
            label: 'Reference PSF Name',
            type: 'text',
            required: false,
            autofillTrigger: true,
          },
          {
            fieldKey: 'reference_product',
            canonicalKey: 'reference_product',
            label: 'Reference Product',
            type: 'text',
            required: false,
            autofillTrigger: true,
          },
          {
            fieldKey: 'product',
            canonicalKey: 'product',
            label: 'Product',
            type: 'text',
            required: true,
          },
          {
            fieldKey: 'wafer_fab',
            canonicalKey: 'wafer_fab',
            label: 'Wafer FAB',
            type: 'text',
            required: true,
          },
        ],
      },
    ],
  },
};

const validInput = {
  formKey: 'psf-request',
  triggerCanonicalKey: 'reference_psf_name',
  targetCanonicalKeys: ['product', 'wafer_fab'],
};

function cloneSchema(): ActiveFormSchemaResponse {
  return JSON.parse(JSON.stringify(activeSchema)) as ActiveFormSchemaResponse;
}

function makeSchemaWithAdminOnlyAutofillFields(): ActiveFormSchemaResponse {
  const schema = cloneSchema();
  schema.schema.sections.push({
    sectionKey: 'admin_only_autofill',
    title: 'Admin-only Autofill',
    visibleTo: ['admin'],
    fields: [
      {
        fieldKey: 'private_trigger',
        canonicalKey: 'private_trigger',
        label: 'Private Trigger',
        type: 'text',
        required: false,
        autofillTrigger: true,
      },
      {
        fieldKey: 'private_target',
        canonicalKey: 'private_target',
        label: 'Private Target',
        type: 'text',
        required: false,
      },
    ],
  });
  return schema;
}

describe('AutofillRuleService', () => {
  let service: AutofillRuleService;
  let formSchemaService: { getActiveSchemaForUpdate: jest.Mock };
  let pool: { connect: jest.Mock; query: jest.Mock };
  let transactionClient: { query: jest.Mock; release: jest.Mock };
  let storedRules: StoredRule[];
  let lastPersistedTargetJson: string | null;

  beforeEach(async () => {
    storedRules = [];
    lastPersistedTargetJson = null;
    formSchemaService = {
      getActiveSchemaForUpdate: jest.fn().mockResolvedValue(cloneSchema()),
    };

    const executeQuery = (query: string, values?: unknown[]) => {
      if (query.includes('INSERT INTO autofill_rules')) {
        const [
          id,
          formKey,
          triggerCanonicalKey,
          lookupSource,
          fillTargetsJson,
          status,
        ] = values as [string, string, string, string, string, string];
        if (
          storedRules.some(
            (rule) =>
              rule.form_key === formKey &&
              rule.trigger_canonical_key === triggerCanonicalKey,
          )
        ) {
          return Promise.reject(
            Object.assign(new Error('duplicate rule'), { code: '23505' }),
          );
        }

        lastPersistedTargetJson = fillTargetsJson;
        const created: StoredRule = {
          id,
          form_key: formKey,
          trigger_canonical_key: triggerCanonicalKey,
          lookup_source: lookupSource,
          fill_targets_json: JSON.parse(fillTargetsJson) as string[],
          status,
          created_at: new Date('2026-08-11T10:00:00.000Z'),
          updated_at: new Date('2026-08-11T10:00:00.000Z'),
        };
        storedRules.push(created);
        return Promise.resolve({ rows: [created] });
      }

      if (query.includes('UPDATE autofill_rules')) {
        const [triggerCanonicalKey, fillTargetsJson, ruleId, formKey] =
          values as [string, string, string, string];
        const existing = storedRules.find(
          (rule) => rule.id === ruleId && rule.form_key === formKey,
        );
        if (!existing) {
          return Promise.resolve({ rows: [] });
        }
        if (
          storedRules.some(
            (rule) =>
              rule.id !== ruleId &&
              rule.form_key === formKey &&
              rule.trigger_canonical_key === triggerCanonicalKey,
          )
        ) {
          return Promise.reject(
            Object.assign(new Error('duplicate rule'), { code: '23505' }),
          );
        }

        existing.trigger_canonical_key = triggerCanonicalKey;
        lastPersistedTargetJson = fillTargetsJson;
        existing.fill_targets_json = JSON.parse(fillTargetsJson) as string[];
        existing.updated_at = new Date('2026-08-11T11:00:00.000Z');
        return Promise.resolve({ rows: [existing] });
      }

      if (query.includes('FROM autofill_rules')) {
        const [formKey] = values as [string];
        return Promise.resolve({
          rows: storedRules.filter(
            (rule) =>
              rule.form_key === formKey &&
              rule.lookup_source === 'previous_completed_submission' &&
              rule.status === 'active',
          ),
        });
      }

      return Promise.resolve({ rows: [] });
    };

    transactionClient = {
      query: jest.fn((query: string, values?: unknown[]) => {
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(query)) {
          return Promise.resolve({ rows: [] });
        }

        return executeQuery(query, values);
      }),
      release: jest.fn(),
    };
    pool = {
      connect: jest.fn().mockResolvedValue(transactionClient),
      query: jest.fn(executeQuery),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutofillRuleService,
        { provide: DATABASE_POOL, useValue: pool },
        { provide: FormSchemaService, useValue: formSchemaService },
      ],
    }).compile();

    service = module.get(AutofillRuleService);
  });

  it('creates idempotent PostgreSQL storage without seeding a business rule', async () => {
    await service.onModuleInit();

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS autofill_rules'),
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_autofill_rules_form_trigger',
      ),
    );
    expect(storedRules).toEqual([]);
  });

  it('persists only ordered canonical trigger and target keys after schema validation', async () => {
    const saved = await service.createRule(validInput);

    expect(typeof saved.id).toBe('string');
    expect(saved).toMatchObject({
      formKey: 'psf-request',
      triggerCanonicalKey: 'reference_psf_name',
      targetCanonicalKeys: ['product', 'wafer_fab'],
      lookupSource: 'previous_completed_submission',
      status: 'active',
      createdAt: '2026-08-11T10:00:00.000Z',
      updatedAt: '2026-08-11T10:00:00.000Z',
    });
    expect(storedRules).toEqual([
      expect.objectContaining({
        trigger_canonical_key: 'reference_psf_name',
        fill_targets_json: ['product', 'wafer_fab'],
        lookup_source: 'previous_completed_submission',
        status: 'active',
      }),
    ]);
    expect(lastPersistedTargetJson).toBe(
      JSON.stringify(['product', 'wafer_fab']),
    );
    expect(formSchemaService.getActiveSchemaForUpdate).toHaveBeenCalledWith(
      'psf-request',
      transactionClient,
    );
    expect(transactionClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(transactionClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    {},
    { ...validInput, targetCanonicalKeys: [] },
    { ...validInput, targetCanonicalKeys: ['product', 'product'] },
    { ...validInput, triggerCanonicalKey: ' ' },
    { ...validInput, formKey: 'other-form' },
    { ...validInput, unexpected: true },
  ])(
    'rejects malformed input before opening a write transaction',
    async (input) => {
      await expect(service.createRule(input)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(pool.connect).not.toHaveBeenCalled();
      expect(storedRules).toEqual([]);
    },
  );

  it.each([
    {
      description: 'an unknown trigger key',
      input: { ...validInput, triggerCanonicalKey: 'unknown_key' },
    },
    {
      description: 'a trigger field that is not marked for autofill',
      input: { ...validInput, triggerCanonicalKey: 'product' },
    },
    {
      description: 'an unknown target key',
      input: { ...validInput, targetCanonicalKeys: ['unknown_key'] },
    },
    {
      description: 'a self-targeting rule',
      input: {
        ...validInput,
        targetCanonicalKeys: ['reference_psf_name'],
      },
    },
  ])(
    'rejects $description before writing and rolls the transaction back',
    async ({ input }) => {
      await expect(service.createRule(input)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(transactionClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(
        transactionClient.query.mock.calls.some(([query]) =>
          typeof query === 'string'
            ? query.includes('INSERT INTO autofill_rules')
            : false,
        ),
      ).toBe(false);
      expect(storedRules).toEqual([]);
    },
  );

  it('rejects admin-only trigger and target keys on both create and update', async () => {
    const adminOnlySchema = makeSchemaWithAdminOnlyAutofillFields();
    formSchemaService.getActiveSchemaForUpdate.mockResolvedValueOnce(
      adminOnlySchema,
    );

    await expect(
      service.createRule({
        formKey: 'psf-request',
        triggerCanonicalKey: 'private_trigger',
        targetCanonicalKeys: ['product'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      transactionClient.query.mock.calls.some(([query]) =>
        typeof query === 'string'
          ? query.includes('INSERT INTO autofill_rules')
          : false,
      ),
    ).toBe(false);
    expect(storedRules).toEqual([]);

    formSchemaService.getActiveSchemaForUpdate.mockResolvedValueOnce(
      adminOnlySchema,
    );
    transactionClient.query.mockClear();
    await expect(
      service.createRule({
        formKey: 'psf-request',
        triggerCanonicalKey: 'reference_psf_name',
        targetCanonicalKeys: ['private_target'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      transactionClient.query.mock.calls.some(([query]) =>
        typeof query === 'string'
          ? query.includes('INSERT INTO autofill_rules')
          : false,
      ),
    ).toBe(false);
    expect(storedRules).toEqual([]);

    const created = await service.createRule(validInput);
    const rulesBeforeRejectedUpdate = JSON.stringify(storedRules);
    transactionClient.query.mockClear();
    formSchemaService.getActiveSchemaForUpdate.mockResolvedValueOnce(
      adminOnlySchema,
    );

    await expect(
      service.updateRule(created.id, {
        formKey: 'psf-request',
        triggerCanonicalKey: 'reference_psf_name',
        targetCanonicalKeys: ['private_target'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      transactionClient.query.mock.calls.some(([query]) =>
        typeof query === 'string'
          ? query.includes('UPDATE autofill_rules')
          : false,
      ),
    ).toBe(false);
    expect(JSON.stringify(storedRules)).toBe(rulesBeforeRejectedUpdate);

    transactionClient.query.mockClear();
    formSchemaService.getActiveSchemaForUpdate.mockResolvedValueOnce(
      adminOnlySchema,
    );
    await expect(
      service.updateRule(created.id, {
        formKey: 'psf-request',
        triggerCanonicalKey: 'private_trigger',
        targetCanonicalKeys: ['product'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      transactionClient.query.mock.calls.some(([query]) =>
        typeof query === 'string'
          ? query.includes('UPDATE autofill_rules')
          : false,
      ),
    ).toBe(false);
    expect(JSON.stringify(storedRules)).toBe(rulesBeforeRejectedUpdate);
  });

  it('rejects schema-invalid duplicate canonical fields before persistence', async () => {
    const schemaWithDuplicateTarget = cloneSchema();
    schemaWithDuplicateTarget.schema.sections[0].fields.push({
      fieldKey: 'product_alias',
      canonicalKey: 'product',
      label: 'Product Alias',
      type: 'text',
      required: false,
    });
    formSchemaService.getActiveSchemaForUpdate.mockResolvedValueOnce(
      schemaWithDuplicateTarget,
    );

    await expect(service.createRule(validInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(transactionClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(storedRules).toEqual([]);
  });

  it('turns the database uniqueness violation into a conflict without partially persisting a duplicate', async () => {
    await service.createRule(validInput);
    transactionClient.query.mockClear();
    transactionClient.release.mockClear();

    await expect(service.createRule(validInput)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(storedRules).toHaveLength(1);
    expect(transactionClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });

  it('updates an existing rule with JSON-serialized target keys and exposes its canonical persisted contract through the read path', async () => {
    const created = await service.createRule(validInput);
    transactionClient.query.mockClear();
    transactionClient.release.mockClear();

    const updated = await service.updateRule(created.id, {
      formKey: 'psf-request',
      triggerCanonicalKey: 'reference_product',
      targetCanonicalKeys: ['wafer_fab'],
    });

    expect(updated).toMatchObject({
      id: created.id,
      triggerCanonicalKey: 'reference_product',
      targetCanonicalKeys: ['wafer_fab'],
      updatedAt: '2026-08-11T11:00:00.000Z',
    });
    expect(lastPersistedTargetJson).toBe(JSON.stringify(['wafer_fab']));
    await expect(service.listActiveRules('psf-request')).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        triggerCanonicalKey: 'reference_product',
        targetCanonicalKeys: ['wafer_fab'],
        lookupSource: 'previous_completed_submission',
        status: 'active',
      }),
    ]);
    expect(transactionClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(transactionClient.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('rejects an invalid or missing edit without mutating the saved rule', async () => {
    const created = await service.createRule(validInput);
    const before = storedRules.map((rule) => ({
      ...rule,
      fill_targets_json: [...rule.fill_targets_json],
    }));
    transactionClient.query.mockClear();

    await expect(
      service.updateRule('not-a-uuid', validInput),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pool.connect).toHaveBeenCalledTimes(1);

    await expect(
      service.updateRule('f8a0d932-cbc2-40fe-98af-34a441cce1a1', validInput),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storedRules).toEqual(before);
    expect(transactionClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(created.id).not.toBe('f8a0d932-cbc2-40fe-98af-34a441cce1a1');
  });

  it('rejects an edit that conflicts with another trigger rule without modifying either row', async () => {
    const first = await service.createRule(validInput);
    const second = await service.createRule({
      formKey: 'psf-request',
      triggerCanonicalKey: 'reference_product',
      targetCanonicalKeys: ['product'],
    });
    const before = storedRules.map((rule) => ({
      ...rule,
      fill_targets_json: [...rule.fill_targets_json],
    }));
    transactionClient.query.mockClear();

    await expect(
      service.updateRule(first.id, {
        formKey: 'psf-request',
        triggerCanonicalKey: second.triggerCanonicalKey,
        targetCanonicalKeys: ['wafer_fab'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storedRules).toEqual(before);
    expect(transactionClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});

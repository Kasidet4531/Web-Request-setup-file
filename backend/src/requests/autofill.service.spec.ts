import { Test, TestingModule } from '@nestjs/testing';
import { AutofillRuleService } from '../admin/autofill_rule.service';
import { FormSchemaService } from '../admin/form_schema.service';
import { WorkflowTransitionService } from '../admin/workflow_transition.service';
import { DATABASE_POOL } from '../database/database.service';
import { AutofillService } from './autofill.service';

const activeRule = {
  id: '75806824-f1b1-4c2a-bb47-41928cb78609',
  formKey: 'psf-request',
  triggerCanonicalKey: 'reference_psf_name',
  targetCanonicalKeys: ['product', 'wafer_fab'],
  lookupSource: 'previous_completed_submission' as const,
  status: 'active' as const,
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:00:00.000Z',
};

const workflowConfiguration = {
  entries: [
    { id: 'draft', name: 'Draft', kind: 'draft', requestCount: null },
    {
      id: 'completed',
      name: 'Fulfilled after rename',
      kind: 'completed',
      requestCount: null,
    },
    {
      id: 'open-completed-label',
      name: '100% -- Completed',
      kind: 'open',
      requestCount: null,
    },
  ],
};

const requesterVisibleSchema = {
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
            fieldKey: 'product',
            canonicalKey: 'product',
            label: 'Product',
            type: 'text',
            required: false,
          },
          {
            fieldKey: 'wafer_fab',
            canonicalKey: 'wafer_fab',
            label: 'Wafer FAB',
            type: 'text',
            required: false,
          },
        ],
      },
    ],
  },
};

describe('AutofillService', () => {
  let autofillRuleService: { listActiveRules: jest.Mock };
  let formSchemaService: { getActiveSchema: jest.Mock };
  let workflowTransitionService: { getConfiguration: jest.Mock };
  let pool: { query: jest.Mock };
  let service: AutofillService;

  beforeEach(async () => {
    autofillRuleService = {
      listActiveRules: jest.fn(),
    };
    formSchemaService = {
      getActiveSchema: jest.fn().mockResolvedValue(requesterVisibleSchema),
    };
    workflowTransitionService = {
      getConfiguration: jest.fn().mockResolvedValue(workflowConfiguration),
    };
    pool = { query: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutofillService,
        { provide: AutofillRuleService, useValue: autofillRuleService },
        { provide: FormSchemaService, useValue: formSchemaService },
        {
          provide: WorkflowTransitionService,
          useValue: workflowTransitionService,
        },
        { provide: DATABASE_POOL, useValue: pool },
      ],
    }).compile();
    service = module.get(AutofillService);
  });

  it('exposes active canonical configuration from the shared admin rule store without performing matching', async () => {
    autofillRuleService.listActiveRules.mockResolvedValue([activeRule]);

    await expect(service.getActiveRules('psf-request')).resolves.toEqual([
      activeRule,
    ]);
    expect(autofillRuleService.listActiveRules).toHaveBeenCalledWith(
      'psf-request',
    );
  });

  it('returns a normal no-match response without querying canonical rows when no configured trigger rule exists', async () => {
    autofillRuleService.listActiveRules.mockResolvedValue([]);

    await expect(
      service.lookupSuggestions({
        formKey: 'psf-request',
        field: 'reference_psf_name',
        value: 'REF-PSF-1',
      }),
    ).resolves.toEqual({ matched: false, suggestedValues: {} });

    expect(pool.query).not.toHaveBeenCalled();
  });

  it('fails closed without querying historical canonical values when a stored rule targets an unknown field', async () => {
    autofillRuleService.listActiveRules.mockResolvedValue([
      {
        ...activeRule,
        targetCanonicalKeys: ['unknown_target'],
      },
    ]);
    pool.query.mockResolvedValue({
      rows: [
        {
          canonical_key: 'unknown_target',
          matched: true,
          value_json: 'historical-value',
        },
      ],
    });

    await expect(
      service.lookupSuggestions({
        formKey: 'psf-request',
        field: 'reference_psf_name',
        value: 'REF-PSF-1',
      }),
    ).resolves.toEqual({ matched: false, suggestedValues: {} });

    expect(formSchemaService.getActiveSchema).toHaveBeenCalledWith(
      'psf-request',
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('fails closed without querying historical canonical values when a stored rule has an unknown trigger', async () => {
    autofillRuleService.listActiveRules.mockResolvedValue([
      {
        ...activeRule,
        triggerCanonicalKey: 'unknown_trigger',
        targetCanonicalKeys: ['product'],
      },
    ]);

    await expect(
      service.lookupSuggestions({
        formKey: 'psf-request',
        field: 'unknown_trigger',
        value: 'REF-PSF-1',
      }),
    ).resolves.toEqual({ matched: false, suggestedValues: {} });

    expect(formSchemaService.getActiveSchema).toHaveBeenCalledWith(
      'psf-request',
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('uses the catalog completed kind after status renames and returns only safe configured target values', async () => {
    autofillRuleService.listActiveRules.mockResolvedValue([activeRule]);
    let executedQuery = '';
    pool.query.mockImplementation((query: string) => {
      executedQuery = query;
      return Promise.resolve({
        rows: [
          {
            canonical_key: 'product',
            matched: true,
            value_json: 'New Product',
          },
          {
            canonical_key: 'wafer_fab',
            matched: true,
            value_json: ['Fab A', 'Fab B'],
          },
          {
            canonical_key: 'unconfigured_private_value',
            matched: true,
            value_json: 'must not leak',
          },
          {
            canonical_key: 'product',
            matched: true,
            value_json: { unsafe: true },
          },
        ],
      });
    });

    await expect(
      service.lookupSuggestions({
        formKey: 'psf-request',
        field: 'reference_psf_name',
        value: 'REF-PSF-1',
      }),
    ).resolves.toEqual({
      matched: true,
      suggestedValues: {
        product: 'New Product',
        wafer_fab: ['Fab A', 'Fab B'],
      },
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM psf_requests AS source_request'),
      [
        'psf-request',
        'reference_psf_name',
        JSON.stringify('REF-PSF-1'),
        ['product', 'wafer_fab'],
        ['Fulfilled after rename'],
      ],
    );
    expect(workflowTransitionService.getConfiguration).toHaveBeenCalledWith(
      pool,
      false,
    );
    expect(executedQuery).toContain('source_request.status = ANY($5::text[])');
    expect(executedQuery).toContain('source_request.completed_at IS NOT NULL');
    expect(executedQuery).toContain('trigger_value.value_json = $3::jsonb');
    expect(executedQuery).toContain(
      'target_value.canonical_key = ANY($4::text[])',
    );
    expect(executedQuery).toContain(
      'ORDER BY source_request.completed_at DESC, source_request.id DESC',
    );
    expect(executedQuery).not.toContain('requester_data_json');
    expect(executedQuery).not.toContain('request_no');
    expect(executedQuery).not.toContain('psf_created_data_json');
  });

  it('reports a source match with an empty suggestion map when every configured target is missing or null', async () => {
    autofillRuleService.listActiveRules.mockResolvedValue([activeRule]);
    pool.query.mockResolvedValue({
      rows: [{ canonical_key: null, matched: true, value_json: null }],
    });

    await expect(
      service.lookupSuggestions({
        formKey: 'psf-request',
        field: 'reference_psf_name',
        value: 'REF-PSF-1',
      }),
    ).resolves.toEqual({ matched: true, suggestedValues: {} });
  });

  it('returns a normal no-match response when no Completed source has the exact canonical trigger value', async () => {
    autofillRuleService.listActiveRules.mockResolvedValue([activeRule]);
    pool.query.mockResolvedValue({
      rows: [{ canonical_key: null, matched: false, value_json: null }],
    });

    await expect(
      service.lookupSuggestions({
        formKey: 'psf-request',
        field: 'reference_psf_name',
        value: 'NO-MATCH',
      }),
    ).resolves.toEqual({ matched: false, suggestedValues: {} });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE NOT EXISTS (SELECT 1 FROM matched_source)',
      ),
      [
        'psf-request',
        'reference_psf_name',
        JSON.stringify('NO-MATCH'),
        ['product', 'wafer_fab'],
        ['Fulfilled after rename'],
      ],
    );
  });
});

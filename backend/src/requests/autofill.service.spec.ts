import { Test, TestingModule } from '@nestjs/testing';
import { AutofillRuleService } from '../admin/autofill_rule.service';
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

describe('AutofillService', () => {
  it('exposes active canonical configuration from the shared admin rule store without performing matching', async () => {
    const autofillRuleService = {
      listActiveRules: jest.fn().mockResolvedValue([activeRule]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutofillService,
        { provide: AutofillRuleService, useValue: autofillRuleService },
      ],
    }).compile();
    const service = module.get(AutofillService);
    const getActiveRules = Reflect.get(service, 'getActiveRules') as
      | undefined
      | ((formKey: string) => Promise<(typeof activeRule)[]>);

    expect(typeof getActiveRules).toBe('function');
    if (!getActiveRules) {
      return;
    }

    await expect(getActiveRules.call(service, 'psf-request')).resolves.toEqual([
      activeRule,
    ]);
    expect(autofillRuleService.listActiveRules).toHaveBeenCalledWith(
      'psf-request',
    );
  });
});

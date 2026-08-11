import { Injectable } from '@nestjs/common';
import {
  AutofillRuleService,
  type AutofillRule,
} from '../admin/autofill_rule.service';

@Injectable()
export class AutofillService {
  constructor(private readonly autofillRuleService: AutofillRuleService) {}

  async getActiveRules(formKey: string): Promise<AutofillRule[]> {
    return this.autofillRuleService.listActiveRules(formKey);
  }
}

import { Module } from '@nestjs/common';
import { AutofillRuleController } from './autofill_rule.controller';
import { AutofillRuleService } from './autofill_rule.service';
import { AuthModule } from '../auth/auth.module';
import { FormSchemaController } from './form_schema.controller';
import { FormSchemaService } from './form_schema.service';
import { UserManagementController } from './user_management.controller';
import { WorkflowTransitionController } from './workflow_transition.controller';
import { WorkflowTransitionService } from './workflow_transition.service';

@Module({
  imports: [AuthModule],
  providers: [
    FormSchemaService,
    WorkflowTransitionService,
    AutofillRuleService,
  ],
  controllers: [
    FormSchemaController,
    UserManagementController,
    WorkflowTransitionController,
    AutofillRuleController,
  ],
  exports: [FormSchemaService, WorkflowTransitionService, AutofillRuleService],
})
export class AdminModule {}

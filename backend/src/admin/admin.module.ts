import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FormSchemaController } from './form_schema.controller';
import { FormSchemaService } from './form_schema.service';
import { UserManagementController } from './user_management.controller';
import { WorkflowTransitionController } from './workflow_transition.controller';
import { WorkflowTransitionService } from './workflow_transition.service';

@Module({
  imports: [AuthModule],
  providers: [FormSchemaService, WorkflowTransitionService],
  controllers: [
    FormSchemaController,
    UserManagementController,
    WorkflowTransitionController,
  ],
  exports: [FormSchemaService, WorkflowTransitionService],
})
export class AdminModule {}

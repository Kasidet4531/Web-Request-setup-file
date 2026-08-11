import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FormSchemaController } from './form_schema.controller';
import { FormSchemaService } from './form_schema.service';
import { UserManagementController } from './user_management.controller';

@Module({
  imports: [AuthModule],
  providers: [FormSchemaService],
  controllers: [FormSchemaController, UserManagementController],
  exports: [FormSchemaService],
})
export class AdminModule {}

import { Module } from '@nestjs/common';
import { FormSchemaService } from './form_schema.service';
import { AdminController } from './admin.controller';

@Module({
  providers: [FormSchemaService],
  controllers: [AdminController],
  exports: [FormSchemaService],
})
export class AdminModule {}

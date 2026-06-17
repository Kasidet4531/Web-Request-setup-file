import { Module } from '@nestjs/common';
import { FormSchemaService } from './form_schema.service';

@Module({
  providers: [FormSchemaService],
  exports: [FormSchemaService],
})
export class AdminModule {}

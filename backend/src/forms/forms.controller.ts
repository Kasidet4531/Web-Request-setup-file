import { Controller, Get, Param } from '@nestjs/common';
import {
  ActiveFormSchemaResponse,
  FormSchemaService,
} from '../admin/form_schema.service';

@Controller('forms')
export class FormsController {
  constructor(private readonly formSchemaService: FormSchemaService) {}

  @Get(':formKey/schema')
  getActiveFormSchema(
    @Param('formKey') formKey: string,
  ): Promise<ActiveFormSchemaResponse> {
    return this.formSchemaService.getActiveSchema(formKey);
  }
}

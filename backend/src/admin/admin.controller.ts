import { Controller, Get, Param } from '@nestjs/common';
import {
  ActiveFormSchemaResponse,
  FormSchemaService,
} from './form_schema.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly formSchemaService: FormSchemaService) {}

  @Get('form-definitions/:formKey/active')
  getActiveFormSchema(
    @Param('formKey') formKey: string,
  ): Promise<ActiveFormSchemaResponse> {
    return this.formSchemaService.getActiveSchema(formKey);
  }
}

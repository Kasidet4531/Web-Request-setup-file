import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import type {
  AuthenticatedRequest,
  AuthenticatedUserProfile,
} from '../auth/session.types';
import {
  FormSchemaService,
  type FormSchemaSection,
  type FormSchemaVersionListResponse,
  type FormSchemaVersionResponse,
  type SaveFormSchemaDraftDto,
} from './form_schema.service';

const PSF_REQUEST_FORM_KEY = 'psf-request';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Controller('admin/form-config')
export class FormSchemaController {
  constructor(
    private readonly formSchemaService: FormSchemaService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async getFormConfig(
    @Req() request: AuthenticatedRequest,
  ): Promise<FormSchemaVersionListResponse> {
    await this.getAuthenticatedAdmin(request);

    return this.formSchemaService.listVersions();
  }

  @Put()
  async saveDraft(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<FormSchemaVersionResponse> {
    const actor = await this.getAuthenticatedAdmin(request);
    const dto = this.parseSaveDraft(body);

    return this.formSchemaService.saveDraft(dto, actor);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  async publishDraft(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<FormSchemaVersionResponse> {
    await this.getAuthenticatedAdmin(request);

    return this.formSchemaService.publishDraft(this.parsePublishVersion(body));
  }

  private async getAuthenticatedAdmin(
    request: AuthenticatedRequest,
  ): Promise<AuthenticatedUserProfile> {
    const userId = request.session.userId;

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const actor = await this.authService.getProfile(userId);
    if (!actor) {
      request.session.userId = undefined;
      throw new UnauthorizedException('Not authenticated');
    }

    if (actor.role !== 'admin') {
      throw new ForbiddenException(
        'Only admins can manage form schema configurations.',
      );
    }

    return actor;
  }

  private parseSaveDraft(body: unknown): SaveFormSchemaDraftDto {
    if (!isRecord(body) || !isRecord(body.schema)) {
      throw new BadRequestException('A form schema object is required.');
    }

    const description = body.description;
    if (
      description !== undefined &&
      description !== null &&
      typeof description !== 'string'
    ) {
      throw new BadRequestException('description must be a string or null.');
    }

    const schema = body.schema;
    if (schema.formKey !== PSF_REQUEST_FORM_KEY) {
      throw new BadRequestException(
        `schema.formKey must be ${PSF_REQUEST_FORM_KEY}.`,
      );
    }

    if (typeof schema.title !== 'string' || schema.title.trim().length === 0) {
      throw new BadRequestException('schema.title must not be blank.');
    }

    if (!Array.isArray(schema.sections)) {
      throw new BadRequestException('schema.sections must be an array.');
    }

    return {
      description: description ?? undefined,
      schema: {
        formKey: PSF_REQUEST_FORM_KEY,
        title: schema.title.trim(),
        sections: schema.sections as FormSchemaSection[],
      },
    };
  }

  private parsePublishVersion(body: unknown): number {
    if (
      !isRecord(body) ||
      typeof body.version !== 'number' ||
      !Number.isSafeInteger(body.version) ||
      body.version <= 0
    ) {
      throw new BadRequestException('version must be a positive safe integer.');
    }

    return body.version;
  }
}

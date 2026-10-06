import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
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

import {
  PSF_REQUEST_FORM_KEY,
  SUPPORTED_FORM_KEYS,
} from './form_schema.constants';

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
    @Query() query: unknown,
  ): Promise<FormSchemaVersionListResponse> {
    await this.getAuthenticatedAdmin(request);
    const formKey = this.parseFormKey(query);

    return formKey === undefined
      ? this.formSchemaService.listVersions()
      : this.formSchemaService.listVersions(formKey);
  }

  @Put()
  async saveDraft(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<FormSchemaVersionResponse> {
    const actor = await this.getAuthenticatedAdmin(request);
    const formKey = this.parseFormKey(query);
    const dto = this.parseSaveDraft(body, formKey ?? PSF_REQUEST_FORM_KEY);

    return formKey === undefined
      ? this.formSchemaService.saveDraft(dto, actor)
      : this.formSchemaService.saveDraft(dto, actor, formKey);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  async publishDraft(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<FormSchemaVersionResponse> {
    await this.getAuthenticatedAdmin(request);
    const formKey = this.parseFormKey(query);
    const version = this.parsePublishVersion(body);

    return formKey === undefined
      ? this.formSchemaService.publishDraft(version)
      : this.formSchemaService.publishDraft(version, formKey);
  }

  @Post('duplicate')
  async duplicateVersion(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<FormSchemaVersionResponse> {
    const actor = await this.getAuthenticatedAdmin(request);
    const version = this.parsePublishVersion(body);
    const formKey = this.parseFormKey(query);

    return formKey === undefined
      ? this.formSchemaService.duplicateVersion(version, actor)
      : this.formSchemaService.duplicateVersion(version, actor, formKey);
  }

  @Delete('draft/:version')
  @HttpCode(HttpStatus.NO_CONTENT)
  async discardDraft(
    @Param('version') version: string,
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<void> {
    await this.getAuthenticatedAdmin(request);
    const formKey = this.parseFormKey(query);
    const numericVersion = Number(version);
    if (
      !/^\d+$/.test(version) ||
      !Number.isSafeInteger(numericVersion) ||
      numericVersion <= 0
    ) {
      throw new BadRequestException('version must be a positive safe integer.');
    }
    if (formKey === undefined) {
      await this.formSchemaService.discardDraft(numericVersion);
    } else {
      await this.formSchemaService.discardDraft(numericVersion, formKey);
    }
  }

  private parseFormKey(
    query: unknown,
  ): (typeof SUPPORTED_FORM_KEYS)[number] | undefined {
    if (query === undefined) return undefined;
    if (
      !isRecord(query) ||
      Reflect.ownKeys(query).some((key) => key !== 'formKey')
    ) {
      throw new BadRequestException(
        'Only the formKey query parameter is allowed.',
      );
    }
    if (!Object.hasOwn(query, 'formKey')) return undefined;

    const value = query.formKey;
    if (
      typeof value === 'string' &&
      SUPPORTED_FORM_KEYS.includes(
        value as (typeof SUPPORTED_FORM_KEYS)[number],
      )
    ) {
      return value as (typeof SUPPORTED_FORM_KEYS)[number];
    }
    throw new BadRequestException(
      `formKey must be one of: ${SUPPORTED_FORM_KEYS.join(', ')}.`,
    );
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

  private parseSaveDraft(
    body: unknown,
    formKey: string,
  ): SaveFormSchemaDraftDto {
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
    if (schema.formKey !== formKey) {
      throw new BadRequestException(`schema.formKey must be ${formKey}.`);
    }

    if (typeof schema.title !== 'string' || schema.title.trim().length === 0) {
      throw new BadRequestException('schema.title must not be blank.');
    }

    if (!Array.isArray(schema.sections)) {
      throw new BadRequestException('schema.sections must be an array.');
    }
    const draftVersion = this.parsePublishVersion({
      version: body.draftVersion,
    });

    return {
      description: description ?? undefined,
      draftVersion,
      schema: {
        formKey,
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

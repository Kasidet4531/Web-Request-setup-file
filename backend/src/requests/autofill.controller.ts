import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
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
  AUTOFILL_LOOKUP_FORM_KEY,
  AutofillService,
  type AutofillLookupQuery,
  type AutofillLookupResponse,
} from './autofill.service';

const AUTOFILL_QUERY_KEYS = ['formKey', 'field', 'value'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Controller('autofill')
export class AutofillController {
  constructor(
    private readonly autofillService: AutofillService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async lookup(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<AutofillLookupResponse> {
    const parsedQuery = this.parseLookupQuery(query);
    await this.getAuthenticatedRequesterEditor(request);

    return this.autofillService.lookupSuggestions(parsedQuery);
  }

  private async getAuthenticatedRequesterEditor(
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

    if (actor.role === 'setup_owner') {
      throw new ForbiddenException(
        'Setup File Owners cannot edit requester-owned fields',
      );
    }

    if (actor.role !== 'requester' && actor.role !== 'admin') {
      throw new ForbiddenException(
        'Only requesters and admins can look up requester autofill suggestions.',
      );
    }

    return actor;
  }

  private parseLookupQuery(query: unknown): AutofillLookupQuery {
    if (!isRecord(query)) {
      throw new BadRequestException(
        'Autofill lookup query must contain exactly formKey, field, and value.',
      );
    }

    const hasExactKeys =
      Object.keys(query).length === AUTOFILL_QUERY_KEYS.length &&
      AUTOFILL_QUERY_KEYS.every((key) => Object.hasOwn(query, key));
    if (!hasExactKeys) {
      throw new BadRequestException(
        'Autofill lookup query must contain exactly formKey, field, and value.',
      );
    }

    const formKey = this.parseNonblankScalar(query.formKey, 'formKey');
    if (formKey !== AUTOFILL_LOOKUP_FORM_KEY) {
      throw new BadRequestException(
        `formKey must be ${AUTOFILL_LOOKUP_FORM_KEY}.`,
      );
    }

    return {
      formKey,
      field: this.parseNonblankScalar(query.field, 'field'),
      value: this.parseNonblankScalar(query.value, 'value'),
    };
  }

  private parseNonblankScalar(value: unknown, name: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(
        `Autofill lookup query ${name} must be a single string value.`,
      );
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new BadRequestException(
        `Autofill lookup query ${name} must not be empty.`,
      );
    }

    return normalized;
  }
}

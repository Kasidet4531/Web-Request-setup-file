import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
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
  AutofillRuleService,
  type AutofillRule,
  type AutofillRuleInput,
} from './autofill_rule.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULE_BODY_KEYS = [
  'formKey',
  'triggerCanonicalKey',
  'targetCanonicalKeys',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Controller('admin/autofill')
export class AutofillRuleController {
  constructor(
    private readonly autofillRuleService: AutofillRuleService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listRules(
    @Req() request: AuthenticatedRequest,
  ): Promise<AutofillRule[]> {
    await this.getAuthenticatedAdmin(request);

    return this.autofillRuleService.listActiveRules('psf-request');
  }

  @Post()
  async createRule(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<AutofillRule> {
    await this.getAuthenticatedAdmin(request);

    return this.autofillRuleService.createRule(this.parseRuleInput(body));
  }

  @Put(':ruleId')
  async updateRule(
    @Param('ruleId') ruleId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<AutofillRule> {
    await this.getAuthenticatedAdmin(request);

    return this.autofillRuleService.updateRule(
      this.parseRuleId(ruleId),
      this.parseRuleInput(body),
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
      throw new ForbiddenException('Only admins can manage autofill rules.');
    }

    return actor;
  }

  private parseRuleInput(body: unknown): AutofillRuleInput {
    if (!isRecord(body)) {
      throw new BadRequestException('An autofill rule object is required.');
    }

    const hasExactKeys =
      Object.keys(body).length === RULE_BODY_KEYS.length &&
      RULE_BODY_KEYS.every((key) => Object.hasOwn(body, key));
    if (!hasExactKeys) {
      throw new BadRequestException(
        'Autofill rule must contain exactly formKey, triggerCanonicalKey, and targetCanonicalKeys.',
      );
    }

    return body as unknown as AutofillRuleInput;
  }

  private parseRuleId(value: string): string {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException('ruleId must be a UUID.');
    }

    return value;
  }
}

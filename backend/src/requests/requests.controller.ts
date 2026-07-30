import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RequestAuditHistoryEntry } from '../audit/audit_log.service';
import { AuthService } from '../auth/auth.service';
import type {
  AuthenticatedRequest,
  AuthenticatedUserProfile,
} from '../auth/session.types';
import { RequestsService } from './requests.service';
import type {
  CreateDraftRequestDto,
  PsfRequestResponse,
  RequestQueryDto,
  RequestStatusOptionsResponse,
  SubmitDraftRequestDto,
  UpdateDraftRequesterDataDto,
  UpdatePsfCreatedDataBodyDto,
  UpdateRequestStatusBodyDto,
} from './requests.service';
import type { RequestSearchResult } from './search-index.service';

@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  async createDraft(
    @Body() body: CreateDraftRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PsfRequestResponse> {
    const actor = await this.getAuthenticatedActor(request);

    return this.requestsService.createDraft(body, actor);
  }

  @Get()
  async queryRequests(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestSearchResult> {
    const parsedQuery = this.parseRequestQuery(query);
    const actor = await this.getAuthenticatedActor(request);

    return this.requestsService.queryRequests(parsedQuery, actor);
  }

  @Get(':requestId/status-options')
  async getAllowedStatusTransitions(
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestStatusOptionsResponse> {
    const actor = await this.getAuthenticatedActor(request);

    return this.requestsService.getAllowedStatusTransitions(requestId, actor);
  }

  @Get(':requestId/history')
  async getRequestHistory(
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestAuditHistoryEntry[]> {
    const actor = await this.getAuthenticatedActor(request);

    return this.requestsService.getRequestHistory(requestId, actor);
  }

  @Get(':requestId')
  async getRequest(
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<PsfRequestResponse> {
    const actor = await this.getAuthenticatedActor(request);

    return this.requestsService.getRequest(requestId, actor);
  }

  @Put(':requestId/requester-data')
  async updateDraftRequesterData(
    @Param('requestId') requestId: string,
    @Body() body: UpdateDraftRequesterDataDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PsfRequestResponse> {
    const actor = await this.getAuthenticatedActor(request);

    return this.requestsService.updateDraftRequesterData(
      requestId,
      body,
      actor,
    );
  }

  @Put(':requestId/psf-created-data')
  async updatePsfCreatedData(
    @Param('requestId') requestId: string,
    @Body() body: UpdatePsfCreatedDataBodyDto | null,
    @Req() request: AuthenticatedRequest,
  ): Promise<PsfRequestResponse> {
    const actor = await this.getAuthenticatedActor(request);

    return this.requestsService.updatePsfCreatedData(requestId, {
      actor,
      expectedUpdatedAt: body?.expectedUpdatedAt,
      psfCreatedData: body?.psfCreatedData,
    });
  }

  @Put(':requestId/status')
  async updateRequestStatus(
    @Param('requestId') requestId: string,
    @Body() body: UpdateRequestStatusBodyDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PsfRequestResponse> {
    const actor = await this.getAuthenticatedActor(request);

    return this.requestsService.updateRequestStatus(requestId, {
      status: body.status,
      actor,
    });
  }

  @Post(':requestId/submit')
  async submitRequest(
    @Param('requestId') requestId: string,
    @Body() body: SubmitDraftRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PsfRequestResponse> {
    const actor = await this.getAuthenticatedActor(request);

    return this.requestsService.submitRequest(requestId, body, actor);
  }

  private async getAuthenticatedActor(
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

    return actor;
  }

  private parseRequestQuery(
    rawQuery: Record<string, unknown>,
  ): RequestQueryDto {
    const allowedKeys = new Set([
      'keyword',
      'status',
      'priority',
      'setupOwner',
      'setupOwnerRole',
      'productType',
      'requester',
      'requestDateFrom',
      'requestDateTo',
      'dueDateFrom',
      'dueDateTo',
      'limit',
      'offset',
    ]);
    const unsupportedKey = Object.keys(rawQuery).find(
      (key) => !allowedKeys.has(key),
    );
    if (unsupportedKey) {
      throw new BadRequestException(
        `Unsupported request query filter: ${unsupportedKey}`,
      );
    }

    const requestDateFrom = this.parseOptionalDateFilter(
      rawQuery.requestDateFrom,
      'requestDateFrom',
    );
    const requestDateTo = this.parseOptionalDateFilter(
      rawQuery.requestDateTo,
      'requestDateTo',
    );
    const dueDateFrom = this.parseOptionalDateFilter(
      rawQuery.dueDateFrom,
      'dueDateFrom',
    );
    const dueDateTo = this.parseOptionalDateFilter(
      rawQuery.dueDateTo,
      'dueDateTo',
    );
    this.assertDateRange(requestDateFrom, requestDateTo, 'request date');
    this.assertDateRange(dueDateFrom, dueDateTo, 'due date');

    return {
      keyword: this.parseOptionalTextFilter(rawQuery.keyword, 'keyword'),
      status: this.parseOptionalTextFilter(rawQuery.status, 'status'),
      priority: this.parseOptionalTextFilter(rawQuery.priority, 'priority'),
      setupOwner: this.parseOptionalTextFilter(
        rawQuery.setupOwner,
        'setupOwner',
      ),
      setupOwnerRole: this.parseOptionalTextFilter(
        rawQuery.setupOwnerRole,
        'setupOwnerRole',
      ),
      productType: this.parseOptionalTextFilter(
        rawQuery.productType,
        'productType',
      ),
      requester: this.parseOptionalTextFilter(rawQuery.requester, 'requester'),
      requestDateFrom,
      requestDateTo,
      dueDateFrom,
      dueDateTo,
      limit: this.parseOptionalIntegerFilter(rawQuery.limit, 'limit', 1),
      offset: this.parseOptionalIntegerFilter(rawQuery.offset, 'offset', 0),
    };
  }

  private parseOptionalTextFilter(
    value: unknown,
    name: string,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(
        `Request query filter ${name} must be a single string value`,
      );
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new BadRequestException(
        `Request query filter ${name} must not be empty`,
      );
    }

    return normalized;
  }

  private parseOptionalIntegerFilter(
    value: unknown,
    name: string,
    minimum: number,
  ): number | undefined {
    const scalarValue = this.parseOptionalTextFilter(value, name);
    if (scalarValue === undefined) {
      return undefined;
    }

    if (!/^(0|[1-9]\d*)$/.test(scalarValue)) {
      throw new BadRequestException(
        `Request query filter ${name} must be a whole number`,
      );
    }

    const parsed = Number(scalarValue);
    if (!Number.isSafeInteger(parsed) || parsed < minimum) {
      throw new BadRequestException(
        `Request query filter ${name} must be at least ${minimum}`,
      );
    }

    return parsed;
  }

  private parseOptionalDateFilter(
    value: unknown,
    name: string,
  ): string | undefined {
    const scalarValue = this.parseOptionalTextFilter(value, name);
    if (scalarValue === undefined) {
      return undefined;
    }

    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scalarValue);
    if (!parts) {
      throw new BadRequestException(
        `Request query filter ${name} must use YYYY-MM-DD`,
      );
    }

    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      year < 1 ||
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new BadRequestException(
        `Request query filter ${name} must be a valid calendar date`,
      );
    }

    return scalarValue;
  }

  private assertDateRange(
    from: string | undefined,
    to: string | undefined,
    label: string,
  ): void {
    if (from && to && from > to) {
      throw new BadRequestException(
        `Request query ${label} range must be in chronological order`,
      );
    }
  }
}

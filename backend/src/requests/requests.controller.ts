import {
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
  queryRequests(@Query() query: RequestQueryDto): Promise<RequestSearchResult> {
    return this.requestsService.queryRequests(query);
  }

  @Get(':requestId/status-options')
  async getAllowedStatusTransitions(
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestStatusOptionsResponse> {
    const actor = await this.getAuthenticatedActor(request);

    return this.requestsService.getAllowedStatusTransitions(requestId, actor);
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
}

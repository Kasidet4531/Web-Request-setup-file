import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { RequestsService } from './requests.service';
import type {
  CreateDraftRequestDto,
  PsfRequestResponse,
  RequestQueryDto,
  SubmitDraftRequestDto,
  UpdateDraftRequesterDataDto,
} from './requests.service';
import type { RequestSearchResult } from './search-index.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  createDraft(
    @Body() body: CreateDraftRequestDto,
  ): Promise<PsfRequestResponse> {
    return this.requestsService.createDraft(body);
  }

  @Get()
  queryRequests(@Query() query: RequestQueryDto): Promise<RequestSearchResult> {
    return this.requestsService.queryRequests(query);
  }

  @Get(':requestId')
  getRequest(
    @Param('requestId') requestId: string,
  ): Promise<PsfRequestResponse> {
    return this.requestsService.getRequest(requestId);
  }

  @Put(':requestId/requester-data')
  updateDraftRequesterData(
    @Param('requestId') requestId: string,
    @Body() body: UpdateDraftRequesterDataDto,
  ): Promise<PsfRequestResponse> {
    return this.requestsService.updateDraftRequesterData(requestId, body);
  }

  @Post(':requestId/submit')
  submitRequest(
    @Param('requestId') requestId: string,
    @Body() body: SubmitDraftRequestDto,
  ): Promise<PsfRequestResponse> {
    return this.requestsService.submitRequest(requestId, body);
  }
}

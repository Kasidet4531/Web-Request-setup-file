import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { RequestsService } from './requests.service';
import type {
  CreateDraftRequestDto,
  PsfRequestResponse,
  UpdateDraftRequesterDataDto,
} from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  createDraft(
    @Body() body: CreateDraftRequestDto,
  ): Promise<PsfRequestResponse> {
    return this.requestsService.createDraft(body);
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
}

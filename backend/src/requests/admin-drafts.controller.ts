import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedRequest } from '../auth/session.types';
import { RequestsService } from './requests.service';
@Controller('admin')
export class AdminDraftsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly auth: AuthService,
  ) {}
  private async actor(request: AuthenticatedRequest) {
    const user = request.session.userId
      ? await this.auth.getProfile(request.session.userId)
      : null;
    if (!user) throw new UnauthorizedException('Not authenticated.');
    return user;
  }
  @Get('drafts')
  async list(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.requests.listAdminDrafts(query, await this.actor(request));
  }
  @Get('drafts/:id')
  async detail(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.requests.getAdminDraft(id, await this.actor(request));
  }
  @Get('draft-deletions')
  async deletions(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.requests.listDraftDeletions(query, await this.actor(request));
  }
}

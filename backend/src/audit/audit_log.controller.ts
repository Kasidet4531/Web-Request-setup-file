import {
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
  AuditLogService,
  type GlobalAuditLogEntry,
  type GlobalAuditLogFilters,
} from './audit_log.service';

@Controller('audit-logs')
export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async getAuditLogs(
    @Query() filters: GlobalAuditLogFilters,
    @Req() request: AuthenticatedRequest,
  ): Promise<GlobalAuditLogEntry[]> {
    const actor = await this.getAuthenticatedActor(request);

    if (actor.role !== 'admin') {
      throw new ForbiddenException('Only admins can view global audit logs.');
    }

    return this.auditLogService.findGlobalAuditLogs(filters);
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

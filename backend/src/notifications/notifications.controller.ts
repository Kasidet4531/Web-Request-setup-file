import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedRequest } from '../auth/session.types';
import { MailConfig } from './mail.config';
import {
  NotificationStorage,
  type OutboxListFilters,
} from './notification.storage';
import { NotificationDispatcher } from './notification.dispatcher';
import { escapeHtml } from './notification.template';
import { safeMailError } from './soap-mail';
@Controller('admin/notifications')
export class NotificationsController {
  constructor(
    private readonly storage: NotificationStorage,
    private readonly auth: AuthService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly config: MailConfig,
  ) {}
  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() filters: OutboxListFilters,
  ) {
    await this.requireAdmin(request);
    return this.storage.list(filters);
  }
  @Post(':id/resend')
  async resend(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    await this.requireAdmin(request);
    return this.storage.resend(id);
  }
  @Post('test')
  async test(@Req() request: AuthenticatedRequest) {
    const actor = await this.requireAdmin(request);
    if (!this.config.enabled)
      throw new BadRequestException(
        'Mail service is disabled (MAIL_ENABLED=false)',
      );
    const job = await this.storage.insertClaimedTest({
      event_type: 'ADMIN_TEST',
      request_id: null,
      to_recipients: this.config.adminTo.join(','),
      cc_recipients: '',
      bcc_recipients: '',
      subject: 'PSF Setup File - SOAP Email Test',
      body_html: `<h1>PSF Setup File - SOAP Email Test</h1><p>This is a test of the configured mail service.</p><p>Requested by: ${escapeHtml(actor.displayName)} (${escapeHtml(actor.role)})</p>`,
    });
    const id = job.id;
    let sentTo: string;
    try {
      sentTo = await this.dispatcher.send(job);
    } catch (error) {
      await this.storage.markFailed(job, error, true);
      return { success: false, outboxId: id, message: safeMailError(error) };
    }
    const saved = await this.storage.markSent(job, sentTo);
    return {
      success: saved,
      sentTo,
      outboxId: id,
      message: saved
        ? 'Test email sent successfully'
        : 'Mail accepted; delivery result could not be recorded because the claim expired',
    };
  }
  private async requireAdmin(request: AuthenticatedRequest) {
    const userId = request.session.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    const actor = await this.auth.getProfile(userId);
    if (!actor) {
      request.session.userId = undefined;
      throw new UnauthorizedException('Not authenticated');
    }
    if (actor.role !== 'admin')
      throw new ForbiddenException('Only admins can manage notifications');
    return actor;
  }
}

import {
  Controller,
  ForbiddenException,
  Get,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedRequest } from '../auth/session.types';
import { DraftReminderService } from './draft-reminder.service';
@Controller('admin/draft-reminders')
export class DraftRemindersController {
  constructor(
    private readonly reminders: DraftReminderService,
    private readonly auth: AuthService,
  ) {}
  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    const userId = request.session.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    const actor = await this.auth.getProfile(userId);
    if (!actor) {
      request.session.userId = undefined;
      throw new UnauthorizedException('Not authenticated');
    }
    if (actor.role !== 'admin')
      throw new ForbiddenException('Only admins can inspect Draft reminders');
    return this.reminders.list();
  }
}

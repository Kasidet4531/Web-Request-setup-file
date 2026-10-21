import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedRequest } from '../auth/session.types';
import { AttachmentStorage, type AttachmentPolicy } from './attachment-storage';

// Outside `requests/`, where a word would be taken for a requestId: New Request
// shows the policy before its Draft exists.
@Controller('attachment-policy')
export class AttachmentPolicyController {
  constructor(
    private readonly storage: AttachmentStorage,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async get(@Req() request: AuthenticatedRequest): Promise<AttachmentPolicy> {
    await this.assertAuthenticated(request);
    return this.storage.policy;
  }

  private async assertAuthenticated(
    request: AuthenticatedRequest,
  ): Promise<void> {
    const userId = request.session.userId;

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    if (!(await this.authService.getProfile(userId))) {
      request.session.userId = undefined;
      throw new UnauthorizedException('Not authenticated');
    }
  }
}

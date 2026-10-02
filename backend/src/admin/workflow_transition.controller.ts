import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
  WorkflowTransitionService,
  type PublicWorkflowConfiguration,
  type WorkflowConfiguration,
} from './workflow_transition.service';

@Controller('admin/workflow')
export class WorkflowTransitionController {
  constructor(
    private readonly workflowTransitionService: WorkflowTransitionService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async getWorkflowTransitionConfiguration(
    @Req() request: AuthenticatedRequest,
  ): Promise<WorkflowConfiguration> {
    await this.getAuthenticatedAdmin(request);

    return this.workflowTransitionService.getConfiguration();
  }

  @Put()
  async replaceWorkflowTransitionConfiguration(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<WorkflowConfiguration> {
    const actor = await this.getAuthenticatedAdmin(request);
    return this.workflowTransitionService.applyOperation(body, actor);
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
      throw new ForbiddenException(
        'Only admins can manage workflow status catalog settings.',
      );
    }

    return actor;
  }
}

@Controller('workflow')
export class WorkflowStatusController {
  constructor(
    private readonly workflowTransitionService: WorkflowTransitionService,
    private readonly authService: AuthService,
  ) {}

  @Get('statuses')
  async getStatuses(
    @Req() request: AuthenticatedRequest,
  ): Promise<PublicWorkflowConfiguration> {
    const userId = request.session.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    const actor = await this.authService.getProfile(userId);
    if (!actor) {
      request.session.userId = undefined;
      throw new UnauthorizedException('Not authenticated');
    }

    return this.workflowTransitionService.getPublicConfiguration();
  }
}

import {
  BadRequestException,
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
  type WorkflowTransitionConfiguration,
  type WorkflowTransitionConfigurationInput,
} from './workflow_transition.service';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Controller('admin/workflow')
export class WorkflowTransitionController {
  constructor(
    private readonly workflowTransitionService: WorkflowTransitionService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async getWorkflowTransitionConfiguration(
    @Req() request: AuthenticatedRequest,
  ): Promise<WorkflowTransitionConfiguration> {
    await this.getAuthenticatedAdmin(request);

    return this.workflowTransitionService.getConfiguration();
  }

  @Put()
  async replaceWorkflowTransitionConfiguration(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<WorkflowTransitionConfiguration> {
    await this.getAuthenticatedAdmin(request);

    return this.workflowTransitionService.replaceConfiguration(
      this.parseReplacement(body),
    );
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
        'Only admins can manage workflow transition configurations.',
      );
    }

    return actor;
  }

  private parseReplacement(
    body: unknown,
  ): WorkflowTransitionConfigurationInput {
    if (!isRecord(body) || !Array.isArray(body.transitions)) {
      throw new BadRequestException('workflow transitions must be an array.');
    }

    const unsupportedKey = Object.keys(body).find(
      (key) => key !== 'transitions',
    );
    if (unsupportedKey) {
      throw new BadRequestException(
        `workflow configuration contains an unsupported field: ${unsupportedKey}.`,
      );
    }

    return { transitions: body.transitions as never };
  }
}

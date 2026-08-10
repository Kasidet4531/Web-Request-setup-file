import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, type UpdateUserProfileInput } from '../auth/auth.service';
import type {
  AuthenticatedRequest,
  AuthenticatedUserProfile,
  UserRole,
} from '../auth/session.types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Controller('admin/users')
export class UserManagementController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  async listUsers(
    @Req() request: AuthenticatedRequest,
  ): Promise<AuthenticatedUserProfile[]> {
    await this.getAuthenticatedAdmin(request);

    return this.authService.listUsers();
  }

  @Put(':userId')
  async updateUser(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<AuthenticatedUserProfile> {
    await this.getAuthenticatedAdmin(request);

    const user = await this.authService.updateUser(
      userId,
      this.parseUpdateUser(body),
    );
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
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
      throw new ForbiddenException('Only admins can manage users.');
    }

    return actor;
  }

  private parseUpdateUser(body: unknown): UpdateUserProfileInput {
    if (!isRecord(body)) {
      throw new BadRequestException('A user role and department are required.');
    }

    const role = body.role;
    if (!this.isUserRole(role)) {
      throw new BadRequestException(
        'role must be requester, setup_owner, or admin.',
      );
    }

    if (!Object.hasOwn(body, 'setupOwnerDepartment')) {
      throw new BadRequestException('setupOwnerDepartment is required.');
    }

    const setupOwnerDepartment = body.setupOwnerDepartment;
    if (role === 'setup_owner') {
      if (setupOwnerDepartment !== 'GNTC' && setupOwnerDepartment !== 'MFG') {
        throw new BadRequestException(
          'Setup File Owners must belong to GNTC or MFG.',
        );
      }

      return { role, setupOwnerDepartment };
    }

    if (setupOwnerDepartment !== null) {
      throw new BadRequestException(
        'Only Setup File Owners may have a department.',
      );
    }

    return { role, setupOwnerDepartment: null };
  }

  private isUserRole(value: unknown): value is UserRole {
    return (
      value === 'requester' || value === 'setup_owner' || value === 'admin'
    );
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import type { Response } from 'express';
import type { AuthenticatedRequest, AuthenticatedUserProfile } from './session.types';

interface LoginBody {
  username?: string;
  password?: string;
}

interface MeResponse {
  user: AuthenticatedUserProfile;
}

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginBody,
    @Req() request: AuthenticatedRequest,
  ): Promise<MeResponse> {
    const user = await this.authService.validateCredentials(
      body.username ?? '',
      body.password ?? '',
    );

    request.session.userId = user.id;
    await this.saveSession(request);

    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookieName = this.configService.get<string>('SESSION_COOKIE_NAME', 'psf.sid');

    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    response.clearCookie(cookieName);
  }

  @Get('me')
  async me(@Req() request: AuthenticatedRequest): Promise<MeResponse> {
    const userId = request.session.userId;

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const user = await this.authService.getProfile(userId);

    if (!user) {
      request.session.userId = undefined;
      throw new UnauthorizedException('Not authenticated');
    }

    return { user };
  }

  private async saveSession(request: AuthenticatedRequest): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      request.session.save((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

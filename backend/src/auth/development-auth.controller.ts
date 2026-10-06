import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { DevelopmentAuthService } from './development-auth.service';
import type { AuthenticatedRequest } from './session.types';

@Controller('dev')
export class DevelopmentAuthController {
  constructor(private readonly auth: DevelopmentAuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { identity?: unknown },
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.auth.login(body?.identity);
    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((error: unknown) => {
        if (error)
          reject(
            error instanceof Error
              ? error
              : new Error('Unable to regenerate session'),
          );
        else resolve();
      });
    });
    request.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      request.session.save((error: unknown) => {
        if (error)
          reject(
            error instanceof Error
              ? error
              : new Error('Unable to save session'),
          );
        else resolve();
      });
    });
    return { user };
  }
}

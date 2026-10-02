import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DevelopmentAuthService } from './development-auth.service';
import { DevelopmentAuthController } from './development-auth.controller';

@Module({
  providers: [AuthService, DevelopmentAuthService],
  controllers: [AuthController, DevelopmentAuthController],
  exports: [AuthService],
})
export class AuthModule {}

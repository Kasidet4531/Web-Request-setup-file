import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  async getHealth() {
    try {
      return await this.appService.getHealth();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new ServiceUnavailableException({
        status: 'error',
        database: {
          status: 'down',
          message,
        },
      });
    }
  }
}

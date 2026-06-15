import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

@Injectable()
export class AppService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getHealth() {
    const database = await this.databaseService.checkHealth();

    return {
      status: 'ok',
      application: 'backend',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}

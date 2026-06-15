import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHealth: jest.fn().mockResolvedValue({
              status: 'ok',
              application: 'backend',
              database: { status: 'up' },
              timestamp: '2026-01-01T00:00:00.000Z',
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return application and database status', async () => {
      await expect(appController.getHealth()).resolves.toEqual({
        status: 'ok',
        application: 'backend',
        database: { status: 'up' },
        timestamp: '2026-01-01T00:00:00.000Z',
      });
    });
  });
});

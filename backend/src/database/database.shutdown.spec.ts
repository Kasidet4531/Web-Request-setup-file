import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DATABASE_POOL, DatabaseService } from './database.service';

describe('database shutdown ordering', () => {
  it('keeps the pool open until background workers have drained on module destroy', async () => {
    const events: string[] = [];
    @Injectable()
    class DrainingWorker implements OnModuleDestroy {
      async onModuleDestroy() {
        events.push('draining');
        await Promise.resolve();
        events.push('drained');
      }
    }
    const pool = {
      on: jest.fn(),
      query: jest.fn().mockResolvedValue({ rows: [] }),
      end: jest.fn(() => {
        events.push('pool closed');
        return Promise.resolve();
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        DrainingWorker,
        { provide: DATABASE_POOL, useValue: pool },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, fallback: unknown) => fallback },
        },
      ],
    }).compile();
    await module.init();
    await module.close();
    expect(events).toEqual(['draining', 'drained', 'pool closed']);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});

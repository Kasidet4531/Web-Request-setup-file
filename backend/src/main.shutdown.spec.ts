import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

describe('production worker lifecycle wiring', () => {
  it('registers shutdown hooks before listening so workers can drain on process signals', async () => {
    const app = {
      get: () => ({ get: (_key: string, fallback: unknown) => fallback }),
      enableCors: jest.fn(),
      use: jest.fn(),
      setGlobalPrefix: jest.fn(),
      enableShutdownHooks: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    const create = jest
      .spyOn(NestFactory, 'create')
      .mockResolvedValue(app as never);
    const log = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    try {
      jest.requireActual('./main');
      await new Promise((resolve) => setImmediate(resolve));
      expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
      expect(app.enableShutdownHooks.mock.invocationCallOrder[0]).toBeLessThan(
        app.listen.mock.invocationCallOrder[0],
      );
    } finally {
      create.mockRestore();
      log.mockRestore();
    }
  });
});

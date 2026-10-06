import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import EmbeddedPostgres from 'embedded-postgres';
import { stopPostgres } from './email-system.fixture.mjs';

// Break caught: cleanup waits forever for an exit event that happened during startup.
test(
  'failed PostgreSQL startup cleans up without waiting for a second exit',
  { timeout: 15_000 },
  async (t) => {
    const directory = await mkdtemp(
      join(tmpdir(), 'psf-email-startup-failure-'),
    );
    const occupied = createServer();
    occupied.listen(0, '127.0.0.1');
    await once(occupied, 'listening');
    t.after(async () => {
      await new Promise((done) => occupied.close(done));
      await rm(directory, { recursive: true, force: true });
    });
    const postgres = new EmbeddedPostgres({
      databaseDir: join(directory, 'data'),
      port: occupied.address().port,
      user: 'postgres',
      password: 'offline-only',
      persistent: false,
      createPostgresUser: false,
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => {},
      onError: () => {},
    });
    await postgres.initialise();
    await assert.rejects(() => postgres.start());
    let timer;
    try {
      await Promise.race([
        stopPostgres(postgres),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Startup cleanup hung')),
            1000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  },
);

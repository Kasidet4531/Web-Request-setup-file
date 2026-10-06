import EmbeddedPostgres from 'embedded-postgres';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'request-assignment-unit-'));
const listener = createServer();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const postgres = new EmbeddedPostgres({
  databaseDir: join(directory, 'db'),
  port,
  user: 'assignment_test',
  password: 'disposable-assignment',
  persistent: false,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => undefined,
  onError: () => undefined,
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await postgres.stop();
  await rm(directory, { recursive: true, force: true });
  process.exit(0);
}
process.on('message', () => void stop());
process.on('disconnect', () => void stop());
await postgres.initialise();
await postgres.start();
process.send({ port });

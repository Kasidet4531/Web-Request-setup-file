/** Real compiled export routes/workers/queue against an owned synthetic database. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import type { Request, Response, NextFunction } from 'express';
import {
  createFixtureTables,
  poolFor,
  seed,
  verify,
  captureFixture,
  restoreFixture,
  mutateFixture,
} from './verify-export-scale';
import { identity, type Role } from '../test/fixtures/export-scale';

const actors = Array.from({ length: 6 }, (_, index) => ({
  id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
  username: `fixture-${index}`,
  displayName: `Fixture ${index}`,
  role: (['admin', 'requester', 'setup_owner'] as Role[])[index % 3],
  setupOwnerDepartment: index % 3 === 2 ? 'GNTC' : null,
}));
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const round = (n: number) => Math.round(n * 10) / 10;
const log = (event: string, data: object = {}) =>
  console.log(JSON.stringify({ event, ...data }));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
interface ServerOptions {
  port: number;
  rows: number;
  threshold: number;
  mutate?: boolean;
  directory: string;
}

async function server(options: ServerOptions) {
  // Load build output exactly as deployed; no reflection overrides of the
  // exporter, writer, row mapper, controller, repository or processor.
  const load = createRequire(__filename);
  const { ExcelExportService } = load(
    '../dist/export/excel_export.service',
  ) as typeof import('../src/export/excel_export.service');
  const { ExportController } = load(
    '../dist/export/export.controller',
  ) as typeof import('../src/export/export.controller');
  const { ExportJobRepository } = load(
    '../dist/export/export-job.repository',
  ) as typeof import('../src/export/export-job.repository');
  const { ExportJobProcessor } = load(
    '../dist/export/export-job.processor',
  ) as typeof import('../src/export/export-job.processor');
  const { SearchIndexService } = load(
    '../dist/requests/search-index.service',
  ) as typeof import('../src/requests/search-index.service');
  const { FormSchemaService } = load(
    '../dist/admin/form_schema.service',
  ) as typeof import('../src/admin/form_schema.service');
  const { AuthService } = load(
    '../dist/auth/auth.service',
  ) as typeof import('../src/auth/auth.service');
  const pool = poolFor(options.port, 10);
  const snapshots: Array<{
    pages: number;
    countWindows: number;
    committed: boolean;
  }> = [];
  let mutation: Record<string, boolean> | undefined;
  let mutated = false;
  const exportPool = {
    query: pool.query.bind(pool),
    connect: async () => {
      const client = await pool.connect();
      const stats = { pages: 0, countWindows: 0, committed: false };
      snapshots.push(stats);
      return {
        release: () => client.release(),
        query: async (sql: string, params?: unknown[]) => {
          const result = await client.query(sql, params);
          if (sql.includes('WITH export_page AS MATERIALIZED')) {
            stats.pages++;
            if (sql.includes('COUNT(*) OVER()')) stats.countWindows++;
            if (options.mutate && !mutated) {
              mutated = true;
              mutation = await mutateFixture(options.port, options.rows);
              log('mutation-committed', mutation);
            }
          }
          if (sql === 'COMMIT') stats.committed = true;
          return result;
        },
      };
    },
  };
  const search = new SearchIndexService(exportPool as unknown as Pool);
  const forms = new FormSchemaService(pool);
  const excel = new ExcelExportService(search, forms);
  const repository = new ExportJobRepository(pool);
  const config = new ConfigService({
    EXPORT_SYNC_THRESHOLD: options.threshold,
    EXPORT_JOB_POLL_INTERVAL_MS: 1000,
  });
  const processor = new ExportJobProcessor(repository, excel, config);
  const module = await Test.createTestingModule({
    controllers: [ExportController],
    providers: [
      { provide: ExcelExportService, useValue: excel },
      {
        provide: SearchIndexService,
        useValue: {
          countExportRequests: search.countExportRequests.bind(search),
        },
      },
      { provide: ExportJobRepository, useValue: repository },
      { provide: ExportJobProcessor, useValue: processor },
      { provide: ConfigService, useValue: config },
      {
        provide: AuthService,
        useValue: {
          getProfile: (id: string) =>
            actors.find((actor) => actor.id === id) || null,
        },
      },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((request: Request, _response: Response, next: NextFunction) => {
    Reflect.set(request, 'session', {
      userId: request.header('x-fixture-actor'),
    });
    next();
  });
  app
    .getHttpAdapter()
    .get('/api/fixture-health', (_request: Request, response: Response) => {
      void pool.query('SELECT 1').then(() => response.json({ status: 'ok' }));
    });
  await app.listen(0, '127.0.0.1');
  const address = (app.getHttpServer() as Server).address() as { port: number };
  process.send?.({ type: 'ready', origin: `http://127.0.0.1:${address.port}` });
  process.once('message', () => {
    void (async () => {
      await app.close();
      await writeFile(
        join(options.directory, 'server-metrics.json'),
        JSON.stringify({ snapshots, mutation }, null, 2) + '\n',
      );
      await pool.end();
    })().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

async function startServer(options: ServerOptions) {
  await mkdir(options.directory, { recursive: true });
  const child = spawn(
    process.execPath,
    [
      '--max-old-space-size=5120',
      '--require',
      'ts-node/register/transpile-only',
      __filename,
      '--server',
      JSON.stringify(options),
    ],
    { cwd: resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
  );
  let output = '';
  child.stdout?.on('data', (data) => {
    output += String(data);
  });
  child.stderr?.on('data', (data) => {
    output += String(data);
  });
  let peakRss = 0,
    abortReason: string | undefined;
  const monitor = setInterval(() => {
    void Promise.all([
      readFile(`/proc/${child.pid}/status`, 'utf8'),
      readFile('/sys/fs/cgroup/memory.stat', 'utf8'),
    ])
      .then(([value, memory]) => {
        const rss = Number(/VmRSS:\s+(\d+)/.exec(value)?.[1] || 0) / 1024;
        peakRss = Math.max(peakRss, rss);
        const resident = ['anon', 'shmem', 'kernel'].reduce(
          (sum, key) =>
            sum +
            Number(new RegExp(`^${key} (\\d+)$`, 'm').exec(memory)?.[1] || 0),
          0,
        );
        if (rss > 6144 || resident > 7.3 * 1024 ** 3) {
          abortReason = 'Benchmark exceeded its Node/cgroup memory guard';
          child.kill('SIGKILL');
        }
      })
      .catch(() => {});
  }, 100);
  const deadline = setTimeout(() => {
    abortReason = 'server cohort exceeded 600 seconds';
    child.kill('SIGKILL');
  }, 600000);
  const exited = new Promise<{ code: number | null; signal: string | null }>(
    (done, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => done({ code, signal }));
    },
  );
  const ready = new Promise<string>((done, reject) => {
    child.once('message', (message: { type?: string; origin?: string }) => {
      if (message.type === 'ready' && message.origin) done(message.origin);
      else reject(new Error('Invalid server startup message'));
    });
    void exited.then(() =>
      reject(new Error(abortReason || output || 'server stopped before ready')),
    );
  });
  try {
    const origin = await ready;
    return {
      origin,
      peakRss: () => round(peakRss),
      stop: async () => {
        if (child.connected) child.send({ type: 'stop' });
        const exit = await exited;
        clearInterval(monitor);
        clearTimeout(deadline);
        await writeFile(join(options.directory, 'server.log'), output);
        assert.equal(exit.code, 0, abortReason || output);
        return JSON.parse(
          await readFile(
            join(options.directory, 'server-metrics.json'),
            'utf8',
          ),
        ) as {
          snapshots: Array<{
            pages: number;
            countWindows: number;
            committed: boolean;
          }>;
          mutation?: Record<string, boolean>;
        };
      },
    };
  } catch (error) {
    clearInterval(monitor);
    clearTimeout(deadline);
    child.kill('SIGKILL');
    throw error;
  }
}

async function exportThroughApi(
  origin: string,
  actorIndex: number,
  output: string,
  kind: 'sync' | 'queue',
) {
  const actor = actors[actorIndex];
  const headers = { 'x-fixture-actor': actor.id };
  const start = performance.now();
  let response = await fetch(`${origin}/api/requests/export.xlsx`, { headers });
  let readyMs: number | undefined;
  if (kind === 'queue') {
    assert.equal(response.status, 202);
    const job = (await response.json()) as { id: string; statusUrl: string };
    for (;;) {
      await delay(100);
      const statusResponse = await fetch(`${origin}/api${job.statusUrl}`, {
        headers,
      });
      assert.equal(statusResponse.status, 200);
      const status = (await statusResponse.json()) as {
        status: string;
        failureMessage?: string;
        downloadUrl?: string;
      };
      if (status.status === 'failed') throw new Error(status.failureMessage);
      if (status.status === 'completed') {
        assert.ok(status.downloadUrl);
        readyMs = round(performance.now() - start);
        response = await fetch(`${origin}/api${status.downloadUrl}`, {
          headers,
        });
        break;
      }
    }
  }
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /spreadsheetml/);
  assert.match(
    response.headers.get('content-disposition') || '',
    /psf_requests_\d{8}_\d{6}\.xlsx/,
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  const totalMs = round(performance.now() - start);
  await writeFile(output, bytes);
  return {
    actorIndex,
    role: actor.role,
    output,
    totalMs,
    readyMs,
    bytes: bytes.length,
  };
}

async function cohort(
  port: number,
  rows: number,
  kind: 'sync' | 'queue',
  directory: string,
) {
  const runtime = await startServer({
    port,
    rows,
    threshold: kind === 'sync' ? rows : Math.min(2000, rows - 1),
    directory,
  });
  const batches: Record<string, unknown>[] = [];
  try {
    // Cover all roles individually; larger batches then exercise shared service
    // instances with differing role contents at the same time.
    const groups = [
      [0],
      [1],
      [2],
      [0, 1],
      ...(rows < 100000 ? [[0, 1, 2, 3]] : []),
    ];
    for (let group = 0; group < groups.length; group++) {
      const indices = groups[group];
      const health: number[] = [];
      const healthErrors: string[] = [];
      let pending: Promise<void> | undefined;
      const probe = setInterval(() => {
        if (pending) return;
        const began = performance.now();
        pending = fetch(`${runtime.origin}/api/fixture-health`)
          .then(async (response) => {
            assert.equal(response.status, 200);
            await response.arrayBuffer();
            health.push(performance.now() - began);
          })
          .catch((error: unknown) => {
            healthErrors.push(String(error));
          })
          .finally(() => {
            pending = undefined;
          });
      }, 100);
      const started = performance.now();
      let files: Awaited<ReturnType<typeof exportThroughApi>>[];
      try {
        files = await Promise.all(
          indices.map((index) =>
            exportThroughApi(
              runtime.origin,
              index,
              join(directory, `batch-${group}-actor-${index}.xlsx`),
              kind,
            ),
          ),
        );
      } finally {
        clearInterval(probe);
        await pending;
      }
      const wallMs = round(performance.now() - started);
      assert.equal(healthErrors.length, 0, healthErrors.join('\n'));
      const verified = [];
      for (const file of files) {
        const correctness = await verify(file.output, rows);
        assert.ok(correctness.strictPass && correctness.diffs === 0);
        verified.push({ ...file, ...correctness });
      }
      const result = {
        rows,
        kind,
        concurrency: indices.length,
        wallMs,
        jobMedianMs: round(median(files.map((file) => file.totalMs))),
        healthSamples: health.length,
        healthP95Ms: health.length
          ? round(
              [...health].sort((a, b) => a - b)[
                Math.ceil(health.length * 0.95) - 1
              ],
            )
          : null,
        healthMaxMs: health.length ? round(Math.max(...health)) : null,
        nodePeakRssMiB: runtime.peakRss(),
        files: verified,
      };
      batches.push(result);
      log('api-batch', result);
    }
  } finally {
    const metrics = await runtime.stop();
    assert.equal(metrics.snapshots.length, rows < 100000 ? 9 : 5);
    assert.ok(
      metrics.snapshots.every(
        (snapshot) =>
          snapshot.committed &&
          snapshot.countWindows === 1 &&
          snapshot.pages === Math.ceil(rows / 500),
      ),
    );
    await writeFile(
      join(directory, 'cohort.json'),
      JSON.stringify({ batches, metrics }, null, 2) + '\n',
    );
  }
  return batches;
}

async function main() {
  if (process.argv[2] === '--server') {
    await server(JSON.parse(process.argv[3]) as ServerOptions);
    return;
  }
  const option = (name: string) =>
    process.argv
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.slice(name.length + 3);
  const sizes = (option('sizes') || '5570,100000').split(',').map(Number);
  assert.ok(
    sizes.every((n) => Number.isSafeInteger(n) && n >= 20 && n <= 100000),
  );
  const directory = resolve(
    option('output-dir') || '../.cache/export-app-integration/final',
  );
  await mkdir(directory, { recursive: true });
  const socket = createServer();
  await new Promise<void>((done, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', done);
  });
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((done) => socket.close(() => done()));
  const databaseDir = await mkdtemp(join(directory, 'postgres-'));
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const db = new EmbeddedPostgres({
    databaseDir,
    port,
    persistent: false,
    password: 'synthetic-export-fixture',
    postgresFlags: [
      '-k',
      '',
      '-c',
      'listen_addresses=127.0.0.1',
      '-c',
      'shared_buffers=64MB',
    ],
    onLog: () => {},
    onError: (error) => log('postgres-error', { error: String(error) }),
  });
  const report: {
    [key: string]: unknown;
    batches: Record<string, unknown>[];
    datasets: unknown[];
    mutations: unknown[];
  } = {
    timestamp: new Date().toISOString(),
    implementation: 'compiled application routes and workers',
    cpuQuota: (await readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim(),
    memoryLimitBytes: Number(
      await readFile('/sys/fs/cgroup/memory.max', 'utf8'),
    ),
    sessionAndProfileFixtureOnly: true,
    queueThreshold: 2000,
    syncThresholdOverrideForTest: true,
    healthProbeIntervalMs: 100,
    statusPollIntervalMs: 100,
    datasets: [],
    batches: [],
    mutations: [],
  };
  let pool: Pool | undefined,
    started = false;
  try {
    await db.initialise();
    await db.start();
    started = true;
    pool = poolFor(port);
    await createFixtureTables(pool);
    for (const rows of sizes) {
      report.datasets.push(await seed(pool, rows));
      await pool.query(
        `UPDATE form_definitions SET title = schema_json->>'title'`,
      );
      for (const kind of ['sync', 'queue'] as const) {
        report.batches.push(
          ...(await cohort(
            port,
            rows,
            kind,
            join(directory, `${rows}-${kind}`),
          )),
        );
        await writeFile(
          join(directory, 'report.json'),
          JSON.stringify(report, null, 2) + '\n',
        );
      }
      const saved = await captureFixture(pool, rows);
      const mutationDirectory = join(directory, `${rows}-snapshot-mutation`);
      const runtime = await startServer({
        port,
        rows,
        threshold: rows,
        directory: mutationDirectory,
        mutate: true,
      });
      let mutationResult: Record<string, unknown> | undefined;
      let metrics: Awaited<ReturnType<typeof runtime.stop>> | undefined;
      try {
        const file = await exportThroughApi(
          runtime.origin,
          0,
          join(mutationDirectory, 'snapshot.xlsx'),
          'sync',
        );
        const correctness = await verify(file.output, rows);
        assert.ok(correctness.strictPass);
        mutationResult = { rows, ...correctness, ...file };
      } finally {
        try {
          metrics = await runtime.stop();
        } finally {
          await restoreFixture(pool, saved);
        }
      }
      assert.ok(
        metrics.mutation && Object.values(metrics.mutation).every(Boolean),
      );
      report.mutations.push({ ...mutationResult, proof: metrics.mutation });
      assert.equal(
        (
          await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM psf_requests WHERE status <> 'Draft'",
          )
        ).rows[0].n,
        rows,
      );
      assert.equal(
        (
          await pool.query<{ request_no: string }>(
            'SELECT request_no FROM psf_requests WHERE id=$1',
            [identity(1).id],
          )
        ).rows[0].request_no,
        identity(1).requestNo,
      );
    }
    report.allFilesCorrect = true;
    await writeFile(
      join(directory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    log('all-complete', {
      report: join(directory, 'report.json'),
      allFilesCorrect: true,
    });
  } finally {
    await pool?.end();
    if (started) await db.stop();
    await rm(databaseDir, { recursive: true, force: true });
  }
}

if (require.main === module)
  main()
    .then(() => {
      if (process.exitCode) process.exit(process.exitCode);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });

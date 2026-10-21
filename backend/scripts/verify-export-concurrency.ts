/** Synthetic concurrency probe. No .env or configured database is used. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import type { UserRole } from '../src/auth/session.types';
import type {
  ExcelExportService,
  RequestExportFilters,
} from '../src/export/excel_export.service';
import { ExportJobProcessor } from '../src/export/export-job.processor';
import { ExportJobRepository } from '../src/export/export-job.repository';
import {
  createFixtureTables,
  poolFor,
  runCase,
  seed,
  verify,
} from './verify-export-scale';

type Kind = 'parallel' | 'queue';
interface Batch {
  rows: number;
  concurrency: number;
  repeat: number;
  kind: Kind;
  port: number;
  directory: string;
}
interface Job {
  index: number;
  role: UserRole;
  actorId: string;
  output: string;
  submittedAt: number;
  totalMs: number;
  serviceMs: number;
  queueWaitMs: number;
  success: boolean;
  error?: string;
  metrics?: Awaited<ReturnType<typeof runCase>>;
  verification?: Awaited<ReturnType<typeof verify>>;
}
const roles: UserRole[] = ['admin', 'requester', 'setup_owner'];
const round = (n: number) => Math.round(n * 10) / 10;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const log = (event: string, data: object = {}) =>
  console.log(JSON.stringify({ event, ...data }));
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function cgroupMemory() {
  const [current, stat] = await Promise.all([
    readFile('/sys/fs/cgroup/memory.current', 'utf8'),
    readFile('/sys/fs/cgroup/memory.stat', 'utf8'),
  ]);
  return {
    totalMiB: Number(current) / 1024 ** 2,
    anonymousMiB: Number(/^anon (\d+)$/m.exec(stat)?.[1] || 0) / 1024 ** 2,
  };
}

async function runBatch(batch: Batch) {
  const pool = poolFor(batch.port, 10);
  const repository = new ExportJobRepository(pool);
  let processor: ExportJobProcessor | undefined;
  await mkdir(batch.directory, { recursive: true });
  const jobs: Job[] = Array.from({ length: batch.concurrency }, (_, index) => ({
    index,
    role: roles[(index + batch.repeat) % roles.length],
    actorId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    output: join(batch.directory, `job-${index}.xlsx`),
    submittedAt: 0,
    totalMs: 0,
    serviceMs: 0,
    queueWaitMs: 0,
    success: false,
  }));
  let active = 0,
    maxActive = 0;
  async function exportJob(job: Job) {
    const started = performance.now();
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      job.metrics = await runCase(
        {
          rows: batch.rows,
          role: job.role,
          mode: 'application',
          port: batch.port,
          output: job.output,
          deferVerification: true,
          mutateDuringExport: false,
        },
        pool,
      );
    } catch (error) {
      job.error = message(error);
      throw error;
    } finally {
      active--;
      job.serviceMs = round(performance.now() - started);
    }
  }
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  let peakRss = 0;
  const memory = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss / 1024 ** 2);
  }, 100);
  memory.unref();
  try {
    await pool.query('TRUNCATE psf_export_jobs');
    await pool.query('SELECT 1');
    global.gc?.();
    histogram.enable();
    const cpuStart = process.cpuUsage();
    const start = performance.now();
    if (batch.kind === 'parallel') {
      await Promise.allSettled(
        jobs.map(async (job) => {
          job.submittedAt = performance.now();
          try {
            await exportJob(job);
            job.success = true;
          } finally {
            job.totalMs = round(performance.now() - job.submittedAt);
          }
        }),
      );
    } else {
      const stored = await Promise.all(
        jobs.map(async (job) => {
          job.submittedAt = performance.now();
          return repository.enqueue({}, { id: job.actorId, role: job.role });
        }),
      );
      const exportProxy = {
        exportAllRequests: async (
          _filters: RequestExportFilters,
          actor: { id: string },
        ) => {
          const job = jobs.find((candidate) => candidate.actorId === actor.id);
          assert.ok(job);
          await exportJob(job);
          return {
            filename: `concurrency-${job.index}.xlsx`,
            content: await readFile(job.output),
          };
        },
      } as ExcelExportService;
      processor = new ExportJobProcessor(
        repository,
        exportProxy,
        new ConfigService({
          EXPORT_JOB_POLL_INTERVAL_MS: 1000,
          EXPORT_JOB_STALE_AFTER_MS: 900000,
          EXPORT_JOB_MAXIMUM_ATTEMPTS: 2,
        }),
      );
      processor.onApplicationBootstrap();
      const finished = new Set<string>();
      while (finished.size < jobs.length) {
        const status = await pool.query<{
          id: string;
          status: string;
          queued_at: Date;
          started_at: Date | null;
          completed_at: Date | null;
        }>(
          'SELECT id,status,queued_at,started_at,completed_at FROM psf_export_jobs',
        );
        for (const row of status.rows) {
          if (
            finished.has(row.id) ||
            !['completed', 'failed'].includes(row.status)
          )
            continue;
          const index = stored.findIndex((job) => job.id === row.id);
          assert.ok(index >= 0);
          const job = jobs[index];
          job.success = row.status === 'completed';
          job.totalMs = round(performance.now() - job.submittedAt);
          job.queueWaitMs = row.started_at
            ? round(row.started_at.getTime() - row.queued_at.getTime())
            : 0;
          finished.add(row.id);
          log('queue-job-ready', {
            rows: batch.rows,
            concurrency: batch.concurrency,
            index,
            role: job.role,
            totalMs: job.totalMs,
          });
        }
        if (finished.size < jobs.length) await delay(100);
      }
      assert.equal(
        maxActive,
        1,
        'The real processor must retain its one-job behavior.',
      );
      processor.onModuleDestroy();
      processor = undefined;
    }
    const wallMs = round(performance.now() - start);
    const cpu = process.cpuUsage(cpuStart);
    histogram.disable();
    clearInterval(memory);
    peakRss = Math.max(peakRss, process.memoryUsage().rss / 1024 ** 2);
    const measurement = {
      wallMs,
      maximumActiveExports: maxActive,
      nodePeakRssMiB: round(peakRss),
      nodeCpuMs: round((cpu.user + cpu.system) / 1000),
      eventLoopDelayP95Ms: round(histogram.percentile(95) / 1e6),
      eventLoopDelayMaxMs: round(histogram.max / 1e6),
      successfulFiles: jobs.filter((job) => job.success).length,
      jobs,
    };
    // Persist timings before running any oracle. Verification never competes with
    // timed export work or holds a database read snapshot open.
    await writeFile(
      join(batch.directory, 'timings.json'),
      JSON.stringify(measurement, null, 2) + '\n',
    );
    global.gc?.();
    for (const job of jobs) {
      if (!job.success) continue;
      if (batch.kind === 'queue') {
        const stored = await pool.query<{ content: Buffer }>(
          "SELECT content FROM psf_export_jobs WHERE owner_user_id=$1::uuid AND status='completed'",
          [job.actorId],
        );
        assert.equal(stored.rows.length, 1);
        await writeFile(job.output, stored.rows[0].content);
      }
      job.verification = await verify(job.output, batch.rows, job.role);
      assert.ok(job.verification.strictPass && job.verification.diffs === 0);
      log('file-verified', {
        rows: batch.rows,
        kind: batch.kind,
        index: job.index,
        role: job.role,
        checkedCells: job.verification.checkedCells,
        diffs: job.verification.diffs,
      });
      global.gc?.();
    }
    assert.equal(
      jobs.filter((job) => job.success).length,
      batch.concurrency,
      'An export failed.',
    );
    if (batch.kind === 'parallel') assert.equal(maxActive, batch.concurrency);
    const result = { ...batch, ...measurement, success: true };
    await writeFile(
      join(batch.directory, 'result.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
  } finally {
    processor?.onModuleDestroy();
    histogram.disable();
    clearInterval(memory);
    await pool.end();
  }
}

async function guardedBatch(batch: Batch): Promise<Record<string, unknown>> {
  // A repeated command must not read a previous run's completion marker.
  await Promise.all([
    rm(join(batch.directory, 'timings.json'), { force: true }),
    rm(join(batch.directory, 'result.json'), { force: true }),
  ]);
  const child = spawn(
    process.execPath,
    [
      `--max-old-space-size=${batch.kind === 'parallel' && batch.rows >= 100000 && batch.concurrency > 1 ? 5120 : 3072}`,
      '--expose-gc',
      '--require',
      'ts-node/register/transpile-only',
      __filename,
      '--batch',
      JSON.stringify(batch),
    ],
    { cwd: resolve(__dirname, '..'), stdio: ['ignore', 'inherit', 'pipe'] },
  );
  let aborted: string | null = null;
  const errors: string[] = [];
  child.stderr.on('data', (data) => {
    errors.push(String(data));
    if (errors.length > 10) errors.shift();
  });
  let rssPeak = 0,
    groupPeak = 0,
    anonPeak = 0;
  let exportRssPeak = 0,
    exportGroupPeak = 0;
  const timeout = setTimeout(() => {
    aborted = 'batch exceeded 600 seconds';
    child.kill('SIGKILL');
  }, 600000);
  const monitor = setInterval(() => {
    void Promise.all([
      readFile(`/proc/${child.pid}/status`, 'utf8'),
      cgroupMemory(),
      readFile(join(batch.directory, 'timings.json'), 'utf8').then(
        () => true,
        () => false,
      ),
    ])
      .then(([status, group, exportFinished]) => {
        const rss = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] || 0) / 1024;
        rssPeak = Math.max(rssPeak, rss);
        groupPeak = Math.max(groupPeak, group.totalMiB);
        anonPeak = Math.max(anonPeak, group.anonymousMiB);
        if (!exportFinished) {
          exportRssPeak = Math.max(exportRssPeak, rss);
          exportGroupPeak = Math.max(exportGroupPeak, group.totalMiB);
        }
        // File cache in memory.current is reclaimable. Bound process RSS and
        // anonymous memory rather than killing a healthy run for cached XLSX files.
        if (rss > 6144 || group.anonymousMiB > 6800) {
          aborted =
            'resource guard: RSS >6144 MiB or cgroup anonymous memory >6800 MiB';
          child.kill('SIGKILL');
        }
      })
      .catch(() => {});
  }, 250);
  try {
    const exit = await new Promise<{
      code: number | null;
      signal: string | null;
    }>((done, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => done({ code, signal }));
    });
    const resources = {
      sampledNodePeakRssMiB: round(rssPeak),
      sampledExportNodePeakRssMiB: round(exportRssPeak),
      sampledCgroupPeakMiB: round(groupPeak),
      sampledExportCgroupPeakMiB: round(exportGroupPeak),
      sampledCgroupAnonymousPeakMiB: round(anonPeak),
    };
    if (exit.code === 0)
      return {
        ...(JSON.parse(
          await readFile(join(batch.directory, 'result.json'), 'utf8'),
        ) as Record<string, unknown>),
        ...resources,
      };
    return {
      ...batch,
      success: false,
      ...exit,
      reason: aborted || errors.join('').slice(-2000),
      ...resources,
    };
  } finally {
    clearInterval(monitor);
    clearTimeout(timeout);
  }
}

async function main() {
  if (process.argv[2] === '--batch') {
    await runBatch(JSON.parse(process.argv[3]) as Batch);
    return;
  }
  const option = (name: string) =>
    process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
  const sizes = (option('sizes') || '5570,100000').split(',').map(Number);
  const levels = (option('levels') || '1,2,4').split(',').map(Number);
  assert.ok(
    sizes.every((n) => Number.isSafeInteger(n) && n >= 20 && n <= 100000),
  );
  assert.ok(levels.includes(1) && levels.every((n) => [1, 2, 4].includes(n)));
  const repeatOverride = option('repeats');
  if (repeatOverride) assert.ok([1, 2, 3].includes(Number(repeatOverride)));
  const directory = resolve(
    option('output-dir') || '../.cache/export-concurrency',
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
    password: 'synthetic-export-fixture',
    persistent: false,
    postgresFlags: [
      '-k',
      '',
      '-c',
      'listen_addresses=127.0.0.1',
      '-c',
      'shared_buffers=64MB',
    ],
    onLog: () => {},
    onError: (error) => log('postgres-error', { error: message(error) }),
  });
  const report: {
    [key: string]: unknown;
    batches: Record<string, unknown>[];
    datasets: unknown[];
  } = {
    timestamp: new Date().toISOString(),
    node: process.version,
    cpu: cpus()[0]?.model,
    cpuQuota: (await readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim(),
    memoryLimitBytes: Number(
      await readFile('/sys/fs/cgroup/memory.max', 'utf8'),
    ),
    databasePoolMaximum: 10,
    implementation: 'application service and workers (source)',
    queueProcessorInstances: 1,
    queuePollIntervalMs: 1000,
    excludes: [
      'HTTP/browser transfer',
      'frontend polling',
      'cell verification time',
    ],
    largeConcurrencyLimit: 2,
    datasets: [],
    batches: [],
  };
  let pool: Pool | undefined;
  let started = false;
  try {
    await db.initialise();
    await db.start();
    started = true;
    pool = poolFor(port);
    await createFixtureTables(pool);
    await new ExportJobRepository(pool).onModuleInit();
    for (const rows of sizes) {
      report.datasets.push(await seed(pool, rows));
      const selectedLevels = levels.filter((n) => rows < 100000 || n <= 2);
      const repeats = repeatOverride
        ? Number(repeatOverride)
        : rows < 10000
          ? 3
          : 1;
      for (const kind of ['parallel', 'queue'] as const)
        for (let repeat = 0; repeat < repeats; repeat++) {
          // Rotate level order across repeats to reduce systematic warm-cache bias.
          const order = [
            ...selectedLevels.slice(repeat % selectedLevels.length),
            ...selectedLevels.slice(0, repeat % selectedLevels.length),
          ];
          for (const concurrency of order) {
            const batch: Batch = {
              rows,
              concurrency,
              repeat,
              kind,
              port,
              directory: join(
                directory,
                `${rows}-${kind}-${concurrency}-r${repeat + 1}`,
              ),
            };
            log('batch-start', batch);
            const result = await guardedBatch(batch);
            report.batches.push(result);
            await writeFile(
              join(directory, 'report.json'),
              JSON.stringify(report, null, 2) + '\n',
            );
            log('batch-complete', {
              rows,
              kind,
              concurrency,
              repeat,
              success: result.success,
              wallMs: result.wallMs,
              reason: result.reason,
            });
          }
        }
    }
    const summaries: Record<string, unknown>[] = [];
    for (const rows of sizes)
      for (const kind of ['parallel', 'queue'] as const)
        for (const concurrency of levels.filter(
          (n) => rows < 100000 || n <= 2,
        )) {
          const batches = report.batches.filter(
            (b) =>
              b.rows === rows &&
              b.kind === kind &&
              b.concurrency === concurrency,
          );
          const passed = batches.filter((b) => b.success);
          const jobs = passed.flatMap((b) => b.jobs as Job[]);
          const summary = {
            rows,
            kind,
            concurrency,
            repeats: batches.length,
            passedBatches: passed.length,
            filesChecked: jobs.length,
            checkedCells: jobs.reduce(
              (sum, job) => sum + (job.verification?.checkedCells || 0),
              0,
            ),
            diffs: jobs.reduce(
              (sum, job) => sum + (job.verification?.diffs || 0),
              0,
            ),
            jobMedianMs: jobs.length
              ? round(median(jobs.map((job) => job.totalMs)))
              : null,
            jobMaxMs: jobs.length
              ? Math.max(...jobs.map((job) => job.totalMs))
              : null,
            queueWaitMedianMs: jobs.length
              ? round(median(jobs.map((job) => job.queueWaitMs)))
              : null,
            serviceMedianMs: jobs.length
              ? round(median(jobs.map((job) => job.serviceMs)))
              : null,
            batchMedianMs: passed.length
              ? round(median(passed.map((b) => Number(b.wallMs))))
              : null,
            exportsPerMinute: passed.length
              ? round(
                  (passed.length * concurrency * 60000) /
                    passed.reduce((sum, b) => sum + Number(b.wallMs), 0),
                )
              : null,
            exportPeakRssMiB: passed.length
              ? Math.max(
                  ...passed.map((b) => Number(b.sampledExportNodePeakRssMiB)),
                )
              : null,
            eventLoopDelayMaxMs: passed.length
              ? Math.max(...passed.map((b) => Number(b.eventLoopDelayMaxMs)))
              : null,
          };
          summaries.push(summary);
        }
    for (const s of summaries) {
      const baseline = summaries.find(
        (b) => b.rows === s.rows && b.kind === s.kind && b.concurrency === 1,
      );
      s.jobSlowdown =
        s.jobMedianMs && baseline?.jobMedianMs
          ? Math.round(
              (Number(s.jobMedianMs) / Number(baseline.jobMedianMs)) * 100,
            ) / 100
          : null;
    }
    report.summaries = summaries;
    report.allFilesCorrect = report.batches.every((b) => b.success);
    await writeFile(
      join(directory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    log('all-complete', {
      report: join(directory, 'report.json'),
      allFilesCorrect: report.allFilesCorrect,
    });
    if (!report.allFilesCorrect) process.exitCode = 2;
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
      console.error(message(error));
      process.exit(1);
    });

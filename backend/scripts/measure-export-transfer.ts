/** Measures Export Preview and Excel export over a slow database link.
 * Run: npm run test:export:transfer -- [--rows=5570] [--runs=3]
 *   [--latency-ms=25] [--mbps=24] [--output=report.json]
 * Seeds a throwaway embedded PostgreSQL with the synthetic export fixture and
 * puts a TCP proxy in front of it that delays each packet by --latency-ms in
 * each direction and caps throughput at --mbps, counting the bytes PostgreSQL
 * sends. It never loads .env or connects to the configured database.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, connect, type Server, type Socket } from 'node:net';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Pool } from 'pg';
import { FormSchemaService } from '../src/admin/form_schema.service';
import { ExcelExportService } from '../src/export/excel_export.service';
import { SearchIndexService } from '../src/requests/search-index.service';
import { createFixtureTables, poolFor, seed } from './verify-export-scale';

const flag = (name: string, fallback: string) =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
const rows = Number(flag('rows', '5570'));
const runs = Number(flag('runs', '3'));
const latencyMs = Number(flag('latency-ms', '25'));
const bytesPerMs = (Number(flag('mbps', '24')) * 1_000_000) / 8 / 1000;
const output = resolve(
  flag(
    'output',
    resolve(__dirname, '../../.cache/export-transfer/report.json'),
  ),
);
const round = (n: number) => Math.round(n * 10) / 10;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as { port: number };
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

// Each direction is one link: a chunk waits for the link to be free, takes
// its size over the bandwidth to send, then arrives latencyMs later.
function slowLink(target: number, counter: { toClient: number }) {
  const pipe = (from: Socket, to: Socket, count: (n: number) => void) => {
    let free = 0;
    let last = Promise.resolve();
    from.on('data', (chunk: Buffer) => {
      count(chunk.length);
      const now = performance.now();
      free = Math.max(now, free) + chunk.length / bytesPerMs;
      const arrival = free + latencyMs;
      last = last
        .then(
          () =>
            new Promise<void>((done) =>
              setTimeout(done, Math.max(0, arrival - performance.now())),
            ),
        )
        .then(() => void to.write(chunk));
    });
    from.on('end', () => void last.then(() => to.end()));
    from.on('error', () => to.destroy());
  };
  return createServer((client) => {
    const server = connect(target, '127.0.0.1');
    pipe(client, server, () => {});
    pipe(server, client, (n) => (counter.toClient += n));
  });
}

interface Phase {
  connectMs: number;
  pageMs: number;
  pageQueries: number;
  schemaMs: number;
  schemaQueries: number;
  otherMs: number;
  committedAt: number;
}

function instrumentedPool(pool: Pool, phase: () => Phase): Pool {
  return {
    query: pool.query.bind(pool),
    connect: async () => {
      const began = performance.now();
      const client = await pool.connect();
      phase().connectMs += performance.now() - began;
      return {
        release: () => client.release(),
        query: async (sql: string, values?: unknown[]) => {
          const start = performance.now();
          const result = await client.query(sql, values);
          const ms = performance.now() - start;
          const current = phase();
          if (sql.includes('export_page')) {
            current.pageMs += ms;
            current.pageQueries++;
          } else if (/snapshot_json/.test(sql)) {
            current.schemaMs += ms;
            current.schemaQueries++;
          } else current.otherMs += ms;
          if (sql === 'COMMIT') current.committedAt = performance.now();
          return result;
        },
      };
    },
  } as unknown as Pool;
}

async function main() {
  assert.ok(rows > 0 && runs > 0 && latencyMs >= 0 && bytesPerMs > 0);
  await mkdir(resolve(output, '..'), { recursive: true });
  const dir = await mkdtemp(join(resolve(output, '..'), 'postgres-'));
  const databasePort = await freePort();
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const db = new EmbeddedPostgres({
    databaseDir: dir,
    port: databasePort,
    password: 'synthetic-export-fixture',
    persistent: false,
    postgresFlags: ['-k', '', '-c', 'listen_addresses=127.0.0.1'],
    onLog: () => {},
  });
  await db.initialise();
  await db.start();
  const counter = { toClient: 0 };
  let proxy: Server | undefined;
  const pools: Pool[] = [];
  try {
    const direct = poolFor(databasePort);
    pools.push(direct);
    await createFixtureTables(direct);
    const dataset = await seed(direct, rows);
    const proxyPort = await freePort();
    proxy = slowLink(databasePort, counter);
    await new Promise<void>((done) =>
      proxy!.listen(proxyPort, '127.0.0.1', done),
    );
    // The application's pool: the export holds one connection of it.
    const remote = poolFor(proxyPort, 4);
    pools.push(remote);
    await remote.query('SELECT 1');
    let phase: Phase;
    const exporter = new ExcelExportService(
      new SearchIndexService(instrumentedPool(remote, () => phase)),
      new FormSchemaService(remote),
    );
    const measure = async (operation: () => Promise<unknown>) => {
      phase = {
        connectMs: 0,
        pageMs: 0,
        pageQueries: 0,
        schemaMs: 0,
        schemaQueries: 0,
        otherMs: 0,
        committedAt: 0,
      };
      // An ordinary query through the same pool while the export runs.
      let healthMaxMs = 0;
      let running = true;
      const healthLoop = (async () => {
        while (running) {
          const start = performance.now();
          await remote.query('SELECT 1');
          healthMaxMs = Math.max(healthMaxMs, performance.now() - start);
          await new Promise((done) => setTimeout(done, 100));
        }
      })();
      const bytesBefore = counter.toClient;
      const start = performance.now();
      await operation();
      const end = performance.now();
      running = false;
      await healthLoop;
      const p = phase;
      return {
        totalMs: round(end - start),
        poolWaitMs: round(p.connectMs),
        pageFetchMs: round(p.pageMs),
        pageQueries: p.pageQueries,
        schemaMs: round(p.schemaMs),
        schemaQueries: p.schemaQueries,
        otherQueryMs: round(p.otherMs),
        afterCommitMs: round(p.committedAt ? end - p.committedAt : 0),
        wireBytesToClient: counter.toClient - bytesBefore,
        healthMaxMs: round(healthMaxMs),
      };
    };
    const cases: Record<string, unknown>[] = [];
    for (let run = 1; run <= runs; run++) {
      const preview = await measure(() => exporter.previewRequests({}));
      console.log(JSON.stringify({ run, kind: 'preview', ...preview }));
      cases.push({ run, kind: 'preview', ...preview });
      let size = 0;
      const file = await measure(async () => {
        size = (
          await exporter.exportAllRequests({}, { id: 'measure', role: 'admin' })
        ).content.length;
      });
      console.log(
        JSON.stringify({ run, kind: 'export', xlsxBytes: size, ...file }),
      );
      cases.push({ run, kind: 'export', xlsxBytes: size, ...file });
    }
    await exporter.onModuleDestroy();
    await writeFile(
      output,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          node: process.version,
          link: {
            latencyMsEachWay: latencyMs,
            mbps: (bytesPerMs * 8 * 1000) / 1_000_000,
          },
          dataset,
          cases,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(JSON.stringify({ event: 'report', output }));
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    await new Promise<void>((done) =>
      proxy ? proxy.close(() => done()) : done(),
    );
    await db.stop();
    await rm(dir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

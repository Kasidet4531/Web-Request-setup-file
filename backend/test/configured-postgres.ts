import assert from 'node:assert/strict';
import { Client, type Pool } from 'pg';

// Runs a database test on the configured PostgreSQL server (DB_* variables)
// without writing to any of its tables. Three things keep it that way:
//   1. one session with search_path = pg_temp, so every unqualified table name
//      the application uses resolves to a session-temporary table, or fails;
//   2. application SQL naming the public schema other than through
//      to_regclass('public.…') is refused before it is sent;
//   3. once the temporary tables exist the session is read-only by default,
//      where PostgreSQL itself rejects any write to a non-temporary table.
// Temporary tables are private to the session and dropped when it ends.

const CLONED_TABLES = [
  'psf_request_audit_logs',
  'psf_requests',
  'psf_export_jobs',
  'email_outbox',
];

type Rows = { rows: Record<string, unknown>[] };

export interface ConfiguredPostgres {
  pool: Pool;
  query(sql: string, values?: unknown[]): Promise<Rows>;
  // Storage changes are the only statements that need a read-write transaction.
  ddl<T>(change: () => Promise<T>): Promise<T>;
  // Reads the configured tables; may copy rows into the temporary ones.
  readConfigured(sql: string, values?: unknown[]): Promise<Rows>;
  close(): Promise<void>;
}

function assertNoConfiguredTable(sql: string): void {
  const withoutLookups = sql.replace(/to_regclass\('public\.\w+'\)/g, '');
  assert.ok(
    !/\bpublic\s*\./i.test(withoutLookups),
    'Application SQL must not name a configured table directly.',
  );
}

export async function configuredPostgres(): Promise<ConfiguredPostgres> {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    application_name: 'request-snapshot-temporary-tables-test',
    statement_timeout: 60_000,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  const send = (sql: string, values?: unknown[]) =>
    client.query(sql, values) as unknown as Promise<Rows>;

  await send('SET search_path = pg_temp');
  // Prove where an unqualified CREATE TABLE lands before any application SQL.
  await send('CREATE TABLE request_snapshot_test_probe (id int)');
  const probe = await send(
    `SELECT n.nspname AS schema, c.relpersistence AS persistence
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'request_snapshot_test_probe'`,
  );
  assert.equal(probe.rows.length, 1);
  assert.match(String(probe.rows[0].schema), /^pg_temp_\d+$/);
  assert.equal(probe.rows[0].persistence, 't');

  // Start from the configured tables' real shape, so storage upgrades are
  // exercised on it. LIKE copies structure only, never rows.
  for (const table of CLONED_TABLES) {
    const exists = await send('SELECT to_regclass($1) IS NOT NULL AS exists', [
      `public.${table}`,
    ]);
    if (exists.rows[0].exists)
      await send(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  }

  const query = (sql: string, values?: unknown[]) => {
    assertNoConfiguredTable(sql);
    return send(sql, values);
  };
  const setReadOnly = (on: boolean) =>
    send(`SET default_transaction_read_only = ${on ? 'on' : 'off'}`);
  let protectedFromWrites = false;

  return {
    pool: {
      query,
      connect: () => Promise.resolve({ query, release() {} }),
    } as unknown as Pool,
    query,
    async ddl(change) {
      if (protectedFromWrites) await setReadOnly(false);
      try {
        return await change();
      } finally {
        // The first storage change is the initial setup; protect from then on.
        protectedFromWrites = true;
        await setReadOnly(true);
      }
    },
    async readConfigured(sql, values) {
      await send('BEGIN TRANSACTION READ ONLY');
      try {
        const result = await send(sql, values);
        await send('COMMIT');
        return result;
      } catch (error) {
        await send('ROLLBACK');
        throw error;
      }
    },
    close: () => client.end(),
  };
}

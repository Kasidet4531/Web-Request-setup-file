# Backend

> **Status clarification, 4 October 2026:** [Database Status names and interaction rules](../docs/status-catalog-and-manual-updates.md) supersede old short-label catalogs, directed transition matrices and action-driven automatic Status changes below. Use complete configured strings for every displayed request Status. This documentation update does not change application source.

NestJS API using the Express adapter, PostgreSQL via `pg.Pool`,
`express-session` and ExcelJS. See [current implementation](../docs/current-implementation.md)
for the supported API and authorization behavior.

In the `main` baseline (`745ae99`), destination statuses also configure To/CC and email
suppression. See [email notifications](../docs/email-notifications.md) for setup,
outbox behavior, offline tests and admin APIs. Delivery defaults to disabled.

## Setup

Run commands from this directory. The previous verification used Node 22.16.0;
choose a runtime compatible with the locked dependencies.

```sh
npm ci
cp .env.example .env
```

Fill database settings and a session secret in `.env`. This file is ignored by
Git. Use the supplied server `10.0.20.6`, port `5432`, database `psf_setup_db`,
and user `postgres`; enter the password provided separately in local configuration.
The remote server's PostgreSQL version has not been checked. Alternatively,
run the repository's PostgreSQL 15 Compose service from the repository root.

| Settings | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection |
| `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECT_TIMEOUT_MS` | Optional pool limits/timeouts; defaults in `database.module.ts` |
| `SESSION_SECRET`, `SESSION_COOKIE_NAME`, `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_MAX_AGE_MS` | Session/cookie settings |
| `FRONTEND_ORIGIN` | CORS origin; examples use `http://127.0.0.1:5173` |
| `LDAP_AUTH_URL`, `LDAP_AUTH_TIMEOUT_MS` | LDAP-backed HTTP authentication endpoint and timeout |
| `INITIAL_ADMIN_USERNAME` | Optional username upserted as local Admin at startup |
| `DEV_AUTH_ENABLED` | Exact `true` opts into mock login in development/test only |
| `PORT` | API listen port; default 3000 |
| `EXPORT_SYNC_THRESHOLD` | Largest export (in requests) served as a Direct Export; larger ones become an Export Job. Default 10000 |
| `EXPORT_SYNC_MAX_CONCURRENT` | Direct Exports allowed at once; another export within the threshold is queued. Default 2 |
| `EXPORT_WORKER_MAX_MEMORY_MB` | Export Memory Limit per workbook worker; an export over it fails alone and is not retried. Default 1024 |
| `EXPORT_JOB_POLL_INTERVAL_MS`, `EXPORT_JOB_STALE_AFTER_MS`, `EXPORT_JOB_MAXIMUM_ATTEMPTS` | Optional background-job processor settings |
| `ATTACHMENT_STORAGE_PATH` | Root of the request Attachment folders: mapped drive, UNC path or local directory. Unset disables Attachments (503) |
| `ATTACHMENT_MAX_BYTES` | Largest Attachment file in bytes; default 52428800 (50 MB). Served by `GET /api/attachment-policy`, so the pickers show it after a restart |

Source: [pool](src/database/database.module.ts), [bootstrap](src/main.ts),
[LDAP service](src/auth/auth.service.ts), [mock service](src/auth/development-auth.service.ts),
[export controller](src/export/export.controller.ts),
[job processor](src/export/export-job.processor.ts) and
[attachment storage](src/requests/attachment-storage.ts); see
[Request Attachments](../docs/request-attachments.md).

## Run

```sh
npm run start:dev
```

This sets `NODE_ENV=development`. For mock testing also set
`DEV_AUTH_ENABLED=true` and follow the [frontend/local auth guide](../docs/local-development-auth.md).
Ordinary `/api/login` still uses LDAP. `npm run start:debug` also uses development.
`npm start` does not set a runtime mode, so it does not enable mock auth by itself.

Production build/launch commands are:

```sh
npm run build
npm run start:prod
```

`start:prod` explicitly sets `NODE_ENV=production`, so mock login returns 404
even with its flag enabled. These commands are not evidence of a verified deployment.

## Startup behavior

The database service checks connectivity using `SELECT 1`. Other services create
or alter their storage and seed missing default schemas/status configuration at
startup; AuthService can provision the configured initial admin. Starting the
backend can therefore write to the configured database. Read-only connectivity
checks do not exercise those writes. There is no separate migration CLI in the
package scripts. See the [source map](../docs/current-implementation.md#persistence-and-startup).

`GET /api/health` returns database health, not LDAP readiness. Authentication and
other routes use the `/api` prefix. HTTP session state uses the default in-memory
store in `main.ts`, so restarting the process discards sessions.

## Initial Data Load

`npm run db:initialize -- <workbook.xlsx> [--yes] [--lenient]` clears request data and form
configuration and reloads them from the PSF form detail workbook. It is a dry run
without `--yes`. See [Initial Data Load](../docs/initial-data-load.md) before using it.
It clears Attachment metadata but never touches the NAS folders, which are
listed again when each request is opened.

`npm run attachments:check [-- --csv report.csv] [--root <folder>]` compares the
existing NAS folders with the `[Product_Description]_[ID]` names the app looks
for, without changing anything. See
[checking existing NAS folders](../docs/request-attachments.md#checking-existing-nas-folders).

## Checks

```sh
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
npm run lint -- --no-fix
```

The `test:e2e` suite uses mocked database/services; it is not live PostgreSQL or
LDAP acceptance. Some HTTP tests open temporary local ports. The bare lint script
includes `--fix`; append `--no-fix` for a read-only check. Existing verification
results are dated records under [docs/verification](../docs/README.md).

The Attachment database tests (`test/attachments.postgres.test.ts`) use an
in-memory PostgreSQL and a temporary directory as `ATTACHMENT_STORAGE_PATH`.

The Request Snapshot database tests run on an in-memory PostgreSQL by default and
can run on the configured server without writing to its tables:

```sh
node --require ts-node/register --test test/request-snapshot.postgres.test.ts
REQUEST_SNAPSHOT_CONFIGURED_POSTGRES=1 node --env-file=.env \
  --require ts-node/register --test test/request-snapshot.postgres.test.ts
```

The second form uses one session whose tables are all temporary, reads up to
`REQUEST_SNAPSHOT_SAMPLE` (default 500) real requests into them and prints counts
only. [`test/configured-postgres.ts`](test/configured-postgres.ts) explains what
keeps it from writing; the session needs the `TEMPORARY` privilege.

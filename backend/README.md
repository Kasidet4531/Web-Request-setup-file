# Backend

> **Status clarification, 4 October 2026:** [Database Status names and interaction rules](../docs/status-catalog-and-manual-updates.md) supersede old short-label catalogs, directed transition matrices and action-driven automatic Status changes below. Use complete configured strings for every displayed request Status. This documentation update does not change application source.

NestJS API using the Express adapter, PostgreSQL via `pg.Pool`,
`express-session` and ExcelJS. See [current implementation](../docs/current-implementation.md)
for the supported API and authorization behavior.

On `feat/email-notification`, destination statuses also configure To/CC and email
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
| `EXPORT_SYNC_THRESHOLD` | XLSX sync/background boundary; default 2000 |
| `EXPORT_JOB_POLL_INTERVAL_MS`, `EXPORT_JOB_STALE_AFTER_MS`, `EXPORT_JOB_MAXIMUM_ATTEMPTS` | Optional background-job processor settings |

Source: [pool](src/database/database.module.ts), [bootstrap](src/main.ts),
[LDAP service](src/auth/auth.service.ts), [mock service](src/auth/development-auth.service.ts),
[export controller](src/export/export.controller.ts) and
[job processor](src/export/export-job.processor.ts).

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

# PSF Setup File Request Management

This application tracks requests to create or update PSF Setup Files. It does
not generate the physical PSF Setup Files. Current development takes place in
`unified-local-auth`, based on `rapid-frontend-rewrite` with removable local
authentication. The original branches remain unchanged by this documentation update.

## Start here

- [Current implementation and source references](docs/current-implementation.md)
- [Backend setup and commands](backend/README.md)
- [Frontend setup and commands](frontend/README.md)
- [LDAP/local testing and mock removal](docs/local-development-auth.md)
- [Current diagrams](docs/diagrams.md)
- [Domain glossary](CONTEXT.md)
- [Documentation index and historical records](docs/README.md)

## Runtime

The frontend uses React, TypeScript, TanStack Router file routes and Vite.
The backend uses NestJS with Express, `express-session`, PostgreSQL through
`pg.Pool`, and ExcelJS. Vite proxies local `/api` calls to port 3000.

LDAP login verifies credentials through the configured company HTTP endpoint;
roles and setup-owner departments are stored in local `app_users` profiles.
Local development additionally offers four reserved test identities, gated by
explicit backend/frontend flags. Both paths use the same backend business logic,
server session and current-profile authorization.

## Development

Use this checkout's frontend and backend together. Install packages separately
with `npm ci` in `backend/` and `frontend/`, then follow the
[local development guide](docs/local-development-auth.md). PostgreSQL is required;
mock authentication does not replace the database. The supplied development
server is `10.0.20.6:5432/psf_setup_db`; credentials belong only in ignored local
configuration. Docker Compose is an alternative local PostgreSQL setup.

The application has request drafts and shared work, two versioned form families,
an administrator-managed status catalog, autofill rules, audit history, and
backend XLSX export. See the current implementation guide for authorization,
snapshot/release rules, endpoints and limitations.

## Verification scope

The [unified-auth verification record](docs/verification/2026-10-02-unified-local-auth.md)
records 594 backend tests, 18 mocked-database HTTP integration tests, 237 frontend
tests, and passing builds/lint for commit `01eab7b`. A later read-only `pg.Pool`
connection check reached the supplied database. Neither result establishes
company LDAP connectivity, full live database/browser acceptance, or deployment.

Historical specs, ADRs and plans remain available as dated design evidence.
Their status notices distinguish original targets from this branch's current
implementation; source code remains authoritative.

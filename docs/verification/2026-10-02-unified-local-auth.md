# Unified local authentication verification — 2026-10-02

Base: `rapid-frontend-rewrite` at `8c11bb4`. Delivery branch: `unified-local-auth`.
The user requested one branch with the current main frontend/backend and
removable mock authentication, preserving both existing branches.

## Changes

- Dedicated development auth service/controller; exact opt-in and explicit
  development/test runtime modes required before database access.
- Four reserved accounts, shared session/current-profile authorization,
  regenerated session on mock login. LDAP implementation unchanged.
- Local-only frontend account chooser, shared API/session notifications,
  pending/error recovery. Production JS excludes chooser and mock login request.
- Explicit development/production launch modes, environment examples and
  setup/removal guide. Ignored local configuration is not committed.

## Fresh checks

All commands below completed with exit 0:

| Package | Command | Result |
| --- | --- | --- |
| Backend | `npm test -- --runInBand` | 594 tests, 32 suites |
| Backend | `npm run test:e2e -- --runInBand` | 18 tests, 1 suite |
| Backend | `npm run build` | Nest/TypeScript build passed |
| Backend | `npm run lint -- --no-fix` | No errors or warnings |
| Frontend | `npm test` | 237 tests, 28 files |
| Frontend | `npm run build` | TypeScript/Vite production build passed |
| Frontend | `npm run lint` | No errors or warnings |

New coverage includes HTTP login/session/me/logout with all four roles,
fresh profile resolution, blocked modes/flags and invalid identity inputs;
frontend visibility, cookie-bearing identity payload, session notifications,
navigation and pending/error recovery.

Tests were written first: valid HTTP login failed with 404 before endpoint
implementation, and enabled frontend rendering failed before the chooser existed.
HTTP tests required temporary local port access outside the default sandbox.

Production assets were inspected: emitted JavaScript contains no local chooser
label, `/dev/login` request or reserved mock admin username even with the local
frontend flag enabled. `git diff --check` passed. Existing LDAP AuthService,
AuthController, request backend and main UI components match the base commit.
Both original checkouts remain clean on their original branches.

Independent read-only review found no blocking issues; the initial minor UI
interaction coverage comment was resolved and re-reviewed.

## Limits

This host has neither Docker nor psql, so a live PostgreSQL/browser acceptance
run was not performed. HTTP tests use a fake database pool with actual Nest
controllers and cookie sessions. PostgreSQL upsert conflict behavior and company
LDAP connectivity are not verified by these results. No mock PSF Requests or
database schema changes are part of this delivery.

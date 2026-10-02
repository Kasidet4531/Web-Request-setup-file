# One branch for LDAP and local development

`unified-local-auth` starts from `rapid-frontend-rewrite` at `8c11bb4`.
The application change adds temporary development authentication; subsequent
documentation updates describe the source without changing application behavior.
Frontend, backend business
logic, LDAP login, current-profile authorization and database schema come from
the main development branch. The old branches remain available.

## Run locally

Requires Node compatible with the package lockfiles and a PostgreSQL connection.
Node 22.16.0 was used for the recorded checks. Compose uses PostgreSQL 15;
the supplied remote database version has not been checked.
Install each package with `npm ci` in `backend/` and `frontend/`.

1. Use the supplied development PostgreSQL server `10.0.20.6:5432`, database
   `psf_setup_db`, user `postgres`, with the separately supplied password in
   ignored local configuration. Alternatively, from the repository root run
   `docker compose up -d postgres`; Compose uses local host/port and creates
   `psf_setup_db` with its configured local credentials. These are alternative
   connections; running Compose does not start the remote server.
2. Copy `backend/.env.example` to `backend/.env`, enter the database settings
   and a generated session secret, and set `DEV_AUTH_ENABLED=true`.
   Set `FRONTEND_ORIGIN=http://127.0.0.1:5173`.
3. Copy `frontend/.env.example` to `frontend/.env.local` and set
   `VITE_DEV_AUTH_ENABLED=true`.
4. In one terminal, run `cd backend` then `npm run start:dev`.
5. In another terminal, run `cd frontend` then
   `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`.
6. Open `http://127.0.0.1:5173/login` and choose a local test account.

The working checkout's ignored backend environment points to the supplied remote
database and both mock flags are enabled. These local files are not committed.
A fresh clone needs steps 2–3; do not overwrite a configured environment with the
example unless you intend to reset it.

The remote connection was checked using a read-only `SELECT` through `pg.Pool`.
Application startup can create/alter/seed storage and mock login writes the
selected reserved profile. This guide does not claim those live feature flows
have been exercised on the supplied database. See
[persistence/startup](current-implementation.md#persistence-and-startup).

Vite proxies `/api` to the backend at `127.0.0.1:3000`, keeping login and cookies
on the frontend origin. No separate frontend from `local-test-auth` is needed.
Ordinary username/password login still calls LDAP; local buttons call
`POST /api/dev/login` without LDAP. Both use the same session and `/api/me`.

## Local accounts and behavior

| Button | Reserved username | Role | Department |
| --- | --- | --- | --- |
| Requester | `dev.requester` | requester | none |
| Setup File Owner — GNTC | `dev.setup-gntc` | setup_owner | GNTC |
| Setup File Owner — MFG | `dev.setup-mfg` | setup_owner | MFG |
| Admin | `dev.admin` | admin | none |

Mock login creates or refreshes the selected local account in `app_users`.
Each login resets that reserved account's role/department to the table above.
Subsequent requests resolve its current stored profile, exactly like LDAP sessions.
No demo PSF Requests are created. Real PostgreSQL remains required.

The backend accepts mock login only when `NODE_ENV` is `development` or `test`
and `DEV_AUTH_ENABLED` is exactly `true`; otherwise it returns 404 before querying
the database. `start:dev`/`start:debug` set development and `start:prod` sets
production. Direct launches must explicitly set the intended `NODE_ENV`.
The frontend shows local buttons only in Vite development with its flag enabled;
production builds hide them even if the flag is set. Restart after changing flags.

To use LDAP during development, disable both flags and configure LDAP access.
Production uses `npm run build` and `npm run start:prod` in the backend,
with mock flags disabled. Local tests do not verify company LDAP connectivity.

## Remove mock after development

1. Remove `DevelopmentAuthController`/`DevelopmentAuthService` imports and
   registrations from `backend/src/auth/auth.module.ts`.
2. Delete `backend/src/auth/development-auth.controller.ts`,
   `development-auth.service.ts` and `development-auth.spec.ts`.
3. Remove the `DevelopmentLogin` import and conditional JSX from
   `frontend/src/routes/login/-LoginPage.tsx`, then delete
   `-DevelopmentLogin.tsx`, `-development-login.css`, `-DevelopmentLogin.test.tsx`
   and mock-related tests in `-LoginPage.test.tsx`.
4. Remove the two mock flags from environment files/examples and update the
   READMEs, current implementation guide, diagrams and glossary to remove mock
   setup/behavior. Keep dated verification records and explicit runtime modes
   in package scripts.
5. Run backend unit/HTTP tests, frontend tests and both builds.

Removing the endpoint does not invalidate existing sessions or delete local
accounts/requests. Stop the local backend to discard its in-memory sessions;
retain or clean up the separate development database deliberately.

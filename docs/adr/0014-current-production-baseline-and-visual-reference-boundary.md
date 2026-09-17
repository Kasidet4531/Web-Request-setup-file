# 14. Current Production Baseline and Visual-Reference Boundary

**Status:** Accepted as a documentation baseline by T01; product decisions and release approval remain unresolved.

## Scope and source

This record is the implementation-state amendment for ADRs 0002, 0004, 0005, 0006, 0007, 0010, 0011, and 0013. Those ADRs preserve historical intent; where they describe a feature as already implemented, this record and the named current source files take precedence.

- Production repository and only production runtime: `Web-Request-setup-file` at `1a2d48aa00728eab4ba5a3931ec29ba0d1b4fde2`.
- Visual reference only: `UI_Web_Setup_file` at `0a71ea6e756995deac84ee225d3d28514e6d96ed`. It has client state, mock records, client-side CSV export, and mock export profiles. No code, authentication, data model, or export behavior from it is a production dependency.
- Source code is authoritative over this record if they diverge.

## Current production contract

- The frontend is React + TanStack Router + Vite + TypeScript, using the existing API client at `frontend/src/services/api.ts`; it defaults to `/api` and sends credentials.
- The backend is NestJS on the Express adapter, `express-session`, PostgreSQL (`pg`), and ExcelJS. No Fastify adapter, Nginx deployment configuration, attachment runtime, export-profile CRUD, Monaco/CodeMirror integration, or second dynamic PSF schema engine is present in this repository.
- Authentication is LDAP-backed through `AuthService.validateCredentials`; successful LDAP identities are upserted into local `app_users`, whose local profile supplies role and setup-owner department. The session stores only `userId`, and `/api/me` resolves that current local profile and role. `password_hash` is nullable and no local password-verification path is implemented.
- The current roles are `requester`, `setup_owner`, and `admin`. Request controllers resolve the actor from the session and fresh local profile; submitted actor/role fields are not authoritative.
- The request form key is `psf-request`. Current status values include `Draft`, `Submitted`, `Setup In Progress`, `Need More Information`, `PSF Created`, `Completed`, `Rejected`, and `Cancelled`; status options come from `GET /api/requests/:requestId/status-options`.
- Current request routes are `POST/GET /api/requests`, `GET /api/requests/:requestId`, `GET /api/requests/:requestId/history`, `PUT /api/requests/:requestId/requester-data`, `POST /api/requests/:requestId/upgrade-schema`, `POST /api/requests/:requestId/submit`, `PUT /api/requests/:requestId/psf-created-data`, and `PUT /api/requests/:requestId/status`.
- List items use `requestId`; details use `id`. PSF writes send `psfCreatedData` and the unchanged detail `updatedAt` as `expectedUpdatedAt`.
- Authentication routes are `POST /api/login`, `POST /api/logout`, and `GET /api/me`; they are not under `/api/auth`.
- Export is backend-generated XLSX at `GET /api/requests/export.xlsx`. The current default queues only when the count is greater than `2000`; `2000` itself is synchronous. Job reads are `GET /api/requests/export-jobs/:jobId` and `/download`.

## Current UI state

The dashboard, request list, request creation, request detail, global history, user management, form configuration, workflow configuration, autofill configuration, and request export routes are connected to production API components. The `/admin/`, `/admin/master-data`, and `/requests/:requestId/history` routes remain placeholders. Existing mounted-session invalidation is incomplete: the API client throws 401 responses without broadcasting session invalidation; T03 remains required.

## Deployment and release limits

`backend/src/main.ts` currently uses the default in-memory `express-session` store and a development fallback session secret. The repository has a Docker Compose file and a backend environment example, but no tracked Nginx configuration. Actual TLS, proxy topology, persistent session store, secrets, LDAP endpoint/certificate behavior, and production database state are unverified and must not be inferred from local source.

## Consequences

- T02/T04 must preserve the current session-to-local-profile actor lookup and export eligibility (`admin` or `requester`); they must not expand eligibility.
- UI integration starts from the existing API-backed frontend and copies only approved visual structure/styles from the reference repository.
- Historical ADR claims about attachments, export-profile administration, field-level audit diffs, full dynamic status catalogs, or advanced editor tooling remain intent only until a task implements and verifies them.

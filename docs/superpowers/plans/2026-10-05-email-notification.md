# Email Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Independent file owners may work in parallel; the controller integrates and reviews their changes.

**Goal:** Configure email recipients per destination status and deliver notifications asynchronously without blocking successful request transitions.

**Architecture:** Extend the existing status JSON catalog with email policy. Request submission, individual transitions and bulk replacement enqueue snapshots using the caller's PostgreSQL connection and a notification savepoint. A NestJS worker claims outbox jobs and dispatches SOAP outside transactions.

**Tech Stack:** NestJS, pg/PostgreSQL, React, TanStack Router, Jest, Vitest, PGlite and a real local PostgreSQL concurrency check when a local server is available.

**Spec:** `docs/superpowers/specs/2026-10-05-email-notification-review.md` (includes all five accepted review answers; supersedes conflicting initial design requirements).

## Global Constraints

- From is always `noreply-psf@nxp.com`.
- A → B uses B's To/CC and enabled flag. Submission uses the selected destination. Bulk replacement queues one notification per affected request unless destination policy disables sending.
- Existing/new statuses default to disabled; Draft is always disabled.
- To/CC combine manually entered group addresses and addresses selected from existing system users. Store normalized email addresses: user selection is an address picker, not a dynamic role rule.
- No real company SOAP or company database calls. Use isolated databases and HTTP mocks/local fixtures. Development/test dispatch requires `MAIL_REDIRECT_TO`.
- Recoverable notification errors must not roll back business writes. SQL savepoints isolate enqueue failures; failure of the business database connection itself cannot be hidden.
- Never include PSF Created Information in email. Escape user input and XML/CDATAs. Do not accept caller-provided test HTML or arbitrary test recipients.
- Worker uses at-least-once delivery for successfully enqueued jobs; claim tokens guard stale completion writes, not external duplicate delivery.
- All delegated agents use `gpt-6.1-sol` with effort `high`, no nested agents and no concurrent commits.

## Review Focus

1. A rename/settings operation must preserve every status policy; public catalog must not disclose recipient addresses.
2. Disabled means no outbox at all, including bulk replacement; it must not fall back to admin.
3. SOAP namespaces, empty success bodies, invalid XML, escaped faultstrings and timeouts must produce the correct result.
4. Stale workers and shutdown must not overwrite re-claimed jobs or leave overlapping loops.
5. A failing INSERT inside a savepoint must preserve request writes and other bulk notification jobs.

## Shared Interfaces

`backend/src/notifications/notification.types.ts` (owned by Task 2):
- `StatusEmailPolicy = { enabled: boolean; to: string[]; cc: string[] }`.
- `RequestNotificationEvent = { eventType: 'REQUEST_SUBMITTED' | 'REQUEST_STATUS_CHANGED'; requestId: string; fromStatus: string; targetStatus: { id: string; name: string; kind: 'draft' | 'open' | 'completed' | 'cancelled'; emailPolicy?: StatusEmailPolicy }; actor: AuthenticatedUserProfile; bulkReplacement?: boolean }`.
- `NotificationService.enqueueRequest(client: Pick<PoolClient, 'query'>, event: RequestNotificationEvent): Promise<void>` handles its own savepoint, recipient snapshot and recovery/logging. The caller supplies already-locked destination policy.

Catalog `StatusCatalogEntry` adds `emailPolicy: StatusEmailPolicy` on admin/internal responses. Public entries omit `emailPolicy` and `requestCount`. The admin operation is `{ action: 'email-policy'; id: string; emailPolicy: StatusEmailPolicy; expectedUpdatedAt: string }`.

### Task 1: Backend status policies and bulk notification hooks

**Owner/files:** backend admin workflow service, its tests and `admin.module.ts`. Do not edit frontend, requests service or notification module files.

**Interfaces:** consume `StatusEmailPolicy` and `NotificationService.enqueueRequest` above; produce catalog field and operation above. Import NotificationsModule into AdminModule. Add optional last constructor dependency to preserve direct instantiation in legacy tests while Nest supplies the real provider.

- [x] Write failing tests for legacy defaults, valid mixed recipients, invalid/empty enabled To, Draft prohibition, rename/settings preservation, optimistic conflict, public projection and audit policy changes.
- [x] Run scoped Jest tests to observe failures, then implement normalization, operation and policy-preserving persistence.
- [x] Extend bulk replacement rows to contain request identity; enqueue per affected request using destination policy and actor after its audit, in the existing transaction. Notification service owns savepoints.
- [x] Test one notification per changed request, disabled suppression and enqueue recovery boundaries. Report commands/results; do not commit or change other owners' files.

### Task 2: Notification subsystem

**Owner/files:** new `backend/src/notifications/**`, backend package/lock for an XML parser if required. Do not edit existing admin/requests services or root modules.

**Interfaces:** implement shared types and `NotificationService.enqueueRequest`. `NotificationsModule` imports AuthModule, exports NotificationService, and registers storage, config, dispatcher, controller and lifecycle worker without importing Requests/Admin modules.

- [x] Write failing tests for mail config safety, email HTML escaping/privacy, SOAP request escaping, empty namespace-aware success, SOAP faults (including HTTP 200 fault), invalid XML/HTTP and timeout. Use raw fixtures/local mocks, not real endpoints.
- [x] Implement strict config: disabled by default, fixed From, positive bounded poll/timeout settings; when enabled require SOAP/SMTP/default/admin/base URL; non-production requires redirect, production base URL must not be loopback. Enqueue remains available while dispatch is disabled.
- [x] Implement outbox table/indexes, saved intended recipients and actual sent recipients, subject/body snapshots and statuses. Initialize before worker starts; no real database during tests.
- [x] Enqueue queries only safe requester metadata on caller connection, captures destination policy, uses savepoint and logs recoverable failure without aborting the caller. Disabled policy returns before any SQL. Original addresses remain immutable at dispatch.
- [x] Implement namespace-aware SOAP 1.1 builder/parser with timeout, XML and CDATA escaping; success requires correct response under SOAP body and no fault. Fault display is decoded first line capped at 500 chars. Dispatcher applies redirect to To and clears CC/BCC, with TEST banner and clean database subject.
- [x] Claim at most 10 jobs using SKIP LOCKED and claim tokens; retry at 1/5/15/60 minutes, max 5 attempts. Recover jobs older than 5 minutes, respecting attempt limits. Send outside SQL transactions, fence completion/failure by claim token and avoid overlapping polls or rescheduling after shutdown.
- [x] Aggregate exhausted-job alerts, excluding alerts themselves; admin test and worker share dispatcher. Admin list is paginated, excludes body, validates filters, and uses DB-backed profile/role checks. Failed-only atomic resend resets attempts; test rejects disabled mail, persists an outbox record before immediate dispatch, has fixed template and configured admin recipients.
- [x] Run scoped Jest tests and report results/interfaces; no commits, no real network calls except public npm dependency acquisition when necessary.

### Task 3: Status Management UI

**Owner/files:** frontend API types, AdminWorkflowTransitionPage and focused extracted components/styles/tests. Do not edit backend.

**Interfaces:** use `emailPolicy` and `email-policy` operation exactly above. Existing `api.fetchAdminUsers()` supplies users with nullable email. Select users by email to insert into the same To/CC address lists; arbitrary valid group emails remain supported.

- [x] Inspect latest visual truth and skill craft floor. Preserve current Stitch UI identity and status behavior.
- [x] Write failing interaction tests for email-policy editing, combining manual addresses/user choices, suppression, preserving values while disabled, empty/invalid To, Save/Cancel, busy/conflict and errors.
- [x] Add per-status email summary and editor with explicit “Do not send email on entry”, To/CC labels, group email inputs and system-user selection. Draft stays protected; no auto-save on checkbox/input edits. Disable recipient controls while off, preserve values, normalize/dedupe before save, backend remains authoritative.
- [x] Bulk delete confirmation shows affected request count and destination delivery settings. Existing/new missing policy displays disabled for compatibility.
- [x] Run scoped Vitest tests and build/lint; report results, no commits. Do not run dev server against company backend.

### Task 4: Integration, offline PostgreSQL tests and documentation

**Owner:** controller. Files: requests service/module and focused integration tests, root app wiring if needed, env examples/readmes/spec updates and isolated PostgreSQL test harness.

- [x] Write failing tests pinning enqueue after successful submit/real status change, destination selection, suppression/no-op and rollback behavior.
- [x] Add NotificationsModule import and NotificationService last constructor dependency; call enqueue after existing business/audit writes, before commit. User mutations pass only server-authoritative actor/destination.
- [x] Add isolated database tests for schema, constraints, claim/recovery, savepoint INSERT failure, rollback, immutable snapshots and stale-token guards. Run a two-connection SKIP LOCKED test if a local PostgreSQL runtime is available; do not substitute PGlite for proof of concurrency.
- [x] Run full backend/frontend tests, builds and non-mutating lint. Render UI using mocked APIs at desktop/mobile and perform a bounded inspection.
- [x] Review accepted requirements and security/concurrency through fresh scoped reviews plus controller review after subagent usage limits; fix concrete findings and rerun relevant checks.
- [x] Update accepted spec/config guide with address-picker snapshot semantics, restart/queued-backlog behavior, SOAP mock evidence and LAN-only live verification limits. Keep user review document. Report local work, test evidence and remaining live checks; do not push unless requested.

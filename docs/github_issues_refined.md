# Refined GitHub Issues List: PSF Setup File Request Management

This document is a refined replacement for `docs/github_issues.md` when preparing real GitHub implementation issues.

The original file is still useful as a **feature inventory / epic overview**.
This refined file is intended for **execution**:
- smaller issues
- clearer dependencies
- more vertical slices
- easier estimating and assignment

## How to use this file

- Treat each section below as a draft GitHub issue.
- Publish blockers first so later issues can reference real GitHub issue numbers.
- Keep the original `github_issues.md` as the high-level roadmap / epic map.
- Prefer thin, demoable slices over large horizontal implementation buckets.

---

## Phase 0: Walking Skeleton

## GI-01: Backend Baseline & Database Health Check

### What to build

Set up the NestJS backend so it can start successfully, connect to PostgreSQL, and expose a health check that confirms both the app and database are reachable. This establishes the backend foundation for all later vertical slices.

### Acceptance criteria

- [ ] Backend service boots successfully in local development.
- [ ] PostgreSQL connection is configured and verified at runtime.
- [ ] Health endpoint such as `GET /api/health` returns application status.
- [ ] Health endpoint includes database connectivity status or fails clearly when the database is unavailable.

### Blocked by

None - can start immediately

---

## GI-02: Frontend App Shell & API Connectivity Baseline

### What to build

Create the frontend application shell with global layout, route placeholders, and a real HTTP API client wired to the backend. The goal is not polished UI yet, but a working shell that proves the frontend can talk to the backend.

### Acceptance criteria

- [ ] Frontend app runs locally and renders a shared app shell.
- [ ] Route placeholders exist for Login, Dashboard, PSF Requests, History, and Admin.
- [ ] Frontend can call a backend endpoint and display success/failure state.
- [ ] Shared API client and error handling baseline are in place for later features.

### Blocked by

- GI-01

---

## GI-03: Local Authentication Vertical Slice

### What to build

Implement local username/password authentication end-to-end, including session cookie handling and a working login page. This slice should prove a user can log in, refresh the page, and remain authenticated through backend session validation.

### Acceptance criteria

- [ ] Backend login endpoint validates credentials against stored bcrypt password hashes.
- [ ] Backend logout endpoint clears the authenticated session.
- [ ] `GET /api/me` returns the authenticated user profile and role.
- [ ] Frontend `/login` route allows a user to sign in successfully.
- [ ] Refreshing the page restores authenticated state through the existing session cookie rather than `localStorage`.
- [ ] At least one seeded user exists for each core role needed for MVP testing.

### Blocked by

- GI-01
- GI-02

---

## Phase 1: Form & Request Core

## GI-04: Seeded Active Form Schema API

### What to build

Create the first active PSF request form schema and expose it through the backend so the frontend can render a real dynamic request form without waiting for the full admin editor.

### Acceptance criteria

- [ ] `form_definitions` storage exists and supports an active schema.
- [ ] A default active PSF request schema is seeded for local development.
- [ ] Backend exposes an API to fetch the active schema for requester-side rendering (`GET /api/forms/:formKey/schema`).
- [ ] Returned schema includes the fields required for requester data entry in MVP.

### Blocked by

- GI-01
- GI-03

---

## GI-05: Shared Dynamic Form Renderer

### What to build

Build a reusable frontend renderer that can display the active schema as a form for requester input. This renderer will later be reused by request creation and schema preview flows.

### Acceptance criteria

- [ ] Frontend renders schema-driven fields for common control types used in MVP.
- [ ] Required field validation is shown near the related field.
- [ ] Product Type is rendered prominently at the top of the form.
- [ ] Renderer can display read-only field states where required.

### Blocked by

- GI-04

---

## GI-06: Draft Request Create / Load / Update Flow

### What to build

Allow a requester to create a new PSF request draft, save it, reopen it, and continue editing it while the request remains in Draft status.

### Acceptance criteria

- [ ] Requester can create a new draft request from `/requests/new`.
- [ ] Draft data can be loaded again from a request detail or edit view.
- [ ] Draft requester fields can be updated while status is `Draft`.
- [ ] Non-draft requests reject normal requester edits to requester-owned fields unless explicitly allowed.

### Blocked by

- GI-03
- GI-04
- GI-05

### Deferred follow-up note

- Post-draft / post-completion requester edits with richer audit or revision history are intentionally out of scope for GI-06.
- Keep the current simpler rule for now: requester edits are allowed while the request is `Draft`, and non-draft edits stay locked.
- Revisit the richer edit-after-completion flow only after the 26 main issues are completed and the system is usable end-to-end.

---

## GI-07: Submit Request & Schema Snapshot Locking

### What to build

Implement request submission so a draft becomes `Submitted` and permanently records the schema snapshot used at submission time. This ensures later schema edits do not rewrite historical request meaning.

### Acceptance criteria

- [ ] Requester can submit a draft request successfully.
- [ ] Submission changes the request status to `Submitted`.
- [ ] Submission stores the active schema snapshot in the request record.
- [ ] After submission, requester-owned fields become read-only for the requester.

### Blocked by

- GI-06

---

## GI-08: Canonical Extraction Baseline

### What to build

Extract canonical values from submitted requests so later features like search, export, and autofill can rely on stable keys instead of raw schema field labels.

### Acceptance criteria

- [ ] Submitted requests produce canonical values for MVP search/export fields.
- [ ] Canonical extraction covers requester fields needed by downstream features.
- [ ] Extraction behavior for missing or unmapped canonical keys is defined and enforced consistently.
- [ ] Canonical values are testable independently of frontend rendering.

### Blocked by

- GI-07

---

## GI-09: Search Index Baseline

### What to build

Create and maintain the request search index so dashboard and list pages can query common fields efficiently without relying on raw JSON scanning.

### Acceptance criteria

- [ ] Search index storage exists for frequently queried request fields.
- [ ] Submitted requests populate or update the search index.
- [ ] Request query API supports keyword search across MVP searchable fields.
- [ ] Request query API supports core filter fields needed by the dashboard.

### Blocked by

- GI-08

---

## Phase 2: Main Workflow

## GI-10: Dashboard Queue MVP

### What to build

Build the dashboard page with summary cards and a request queue table so users can monitor request workload and open a request from the list.

### Acceptance criteria

- [ ] Dashboard shows summary cards for key request counts.
- [ ] Dashboard displays a request list table with core columns from the specification.
- [ ] Search and filter controls work through the request query API.
- [ ] Selecting a request from the table navigates to its detail page.

### Blocked by

- GI-09

---

## GI-11: Request Detail Page MVP

### What to build

Create the request detail page foundation with a clear header, requester information section, attachments area placeholder if needed, and role-aware read-only behavior for submitted requests.

### Acceptance criteria

- [ ] `/requests/{requestId}` renders a detail page with request header information.
- [ ] Requester Information is shown using the request's stored data and schema snapshot.
- [ ] Role-aware read-only behavior is enforced in the UI for submitted requests.
- [ ] Detail page clearly shows the current workflow status.

### Blocked by

- GI-07
- GI-10

---

## GI-12: Manual Workflow Transition MVP

### What to build

Allow authorized users to move a request through workflow statuses using a seeded transition configuration. This slice should prove workflow rules work end-to-end before adding admin-managed transition editing.

### Acceptance criteria

- [ ] Authorized users can change status using the request detail page.
- [ ] Unauthorized users see workflow status in read-only mode.
- [ ] Backend validates allowed transitions by role against the seeded configuration.
- [ ] When a Setup File Owner performs a status transition, the request records that owner and department.

### Blocked by

- GI-03
- GI-11

---

## GI-13: PSF Created Information Editing & Requester Visibility Masking

### What to build

Implement the PSF Created Information section so Setup File Owners can edit it, while Requesters see a friendly placeholder until the request reaches `PSF Created` or `Completed`.

### Acceptance criteria

- [ ] Setup File Owners can view and edit PSF Created Information.
- [ ] Requesters see a placeholder message instead of hidden raw fields before `PSF Created`.
- [ ] Requesters can view PSF Created Information in read-only mode when status is `PSF Created` or `Completed`.
- [ ] Backend enforces requester visibility rules and does not rely on frontend hiding alone.

### Blocked by

- GI-11
- GI-12

---

## GI-14: Audit Log Baseline

### What to build

Capture action-level audit events for the core request lifecycle so the system records who created, updated, submitted, or changed status on a request before implementing fine-grained diff history.

### Acceptance criteria

- [ ] Create, draft update, submit, and status change actions produce audit entries.
- [ ] Audit entries include actor, timestamp, request reference, and action type.
- [ ] Audit logging is integrated into the write path for current MVP actions.
- [ ] Audit failures are surfaced or handled consistently rather than silently ignored.

### Blocked by

- GI-06
- GI-07
- GI-12

---

## GI-15: History Timeline UI

### What to build

Expose request history on the detail experience so users can inspect prior actions without needing direct database access.

### Acceptance criteria

- [ ] Request history can be loaded for a specific request.
- [ ] History is rendered in chronological order as a timeline or structured table.
- [ ] Users can see actor, timestamp, and action summary for each event.
- [ ] History view is reachable from the request detail flow.

### Blocked by

- GI-11
- GI-14

---

## Phase 3: Admin & Configuration Power

## GI-16: Admin Form Schema Save / Publish API

### What to build

Extend schema management beyond a seed by allowing administrators to save and publish form definitions through backend APIs, without yet requiring a rich editor UI.

### Acceptance criteria

- [ ] Admin-authenticated API can retrieve current schema versions.
- [ ] Admin-authenticated API can save a draft schema.
- [ ] Admin-authenticated API can publish a schema as active.
- [ ] Published schema becomes the one used by new requests.

### Blocked by

- GI-04
- GI-03

---

## GI-17: Admin JSON Schema Editor & Live Preview

### What to build

Create the admin form configuration screen with a JSON editor and live preview so administrators can manage dynamic forms without manual database edits.

### Acceptance criteria

- [ ] `/admin/form-config` provides a schema editing experience for admins.
- [ ] The editor validates schema shape before publish.
- [ ] The preview renders the same field patterns used by the shared frontend form renderer.
- [ ] Admin can save and publish from the UI.

### Blocked by

- GI-05
- GI-16

---

## GI-18: Draft Version Upgrade Hybrid Flow

### What to build

When a user opens an older draft after the active schema has changed, prompt them to upgrade the draft to the latest schema or keep working with the old version.

### Acceptance criteria

- [ ] Older drafts are detected against the current active schema version.
- [ ] User sees a clear Upgrade or Remain choice before editing the draft.
- [ ] Upgrading preserves matching fields, initializes new ones, and handles obsolete ones consistently.
- [ ] Remaining on the old schema keeps the draft editable without corruption.

### Blocked by

- GI-06
- GI-16

---

## GI-19: Admin User & Role Management

### What to build

Provide an admin UI to manage users, roles, and Setup Owner department assignments instead of relying only on seeded records.

### Acceptance criteria

- [ ] Admin can view all users.
- [ ] Admin can update a user's role.
- [ ] Admin can assign or change a Setup Owner department.
- [ ] Changes are reflected in later authorization-sensitive flows.

### Blocked by

- GI-03

---

## GI-20: Admin Workflow Transition Editor

### What to build

Let administrators manage workflow transitions and role permissions through the admin UI so workflow rules no longer depend solely on seeded configuration.

### Acceptance criteria

- [ ] Admin can view configured statuses and transitions.
- [ ] Admin can modify which transitions are allowed.
- [ ] Admin can define which roles or departments may perform each transition.
- [ ] Runtime workflow validation uses the saved configuration.

### Blocked by

- GI-12
- GI-19

---

## GI-21: Admin Autofill Rules Management

### What to build

Allow administrators to define autofill rules using canonical keys so runtime autofill behavior can be configured without code changes.

### Acceptance criteria

- [ ] Admin can create and edit autofill rules.
- [ ] Rules map trigger fields to target fields using canonical keys.
- [ ] Invalid or incomplete rules are rejected clearly.
- [ ] Saved rules are available to runtime autofill logic.

### Blocked by

- GI-08
- GI-19

---

## GI-22: Runtime Autofill Suggestions

### What to build

Use the configured autofill rules and most-recent-completed matching strategy to suggest values in the request flow, including visible labels that explain auto-filled versus user-edited data.

### Acceptance criteria

- [ ] Entering a configured trigger value can load matching autofill suggestions from completed requests.
- [ ] Matching uses the most recent completed request when duplicates exist.
- [ ] UI shows `Auto-filled` state when suggestion is applied.
- [ ] UI shows `Edited by user` when the suggested value is later changed manually.

### Blocked by

- GI-13
- GI-21

---

## Phase 4: Output & Integration

## GI-23: Excel Export MVP

### What to build

Provide a working Excel export for request data so users can download a basic spreadsheet from current query results before advanced alignment and background processing features are added.

### Acceptance criteria

- [ ] Export API returns a valid `.xlsx` file.
- [ ] Export respects the active query/filter scope used by the caller.
- [ ] Export filename uses the required Bangkok timezone format.
- [ ] MVP export is usable for ordinary request volumes handled synchronously.

### Blocked by

- GI-09

---

## GI-24: Export Schema Alignment & Requester Masking

### What to build

Enhance export so historical records align to the latest schema through canonical keys and Requesters do not receive hidden PSF Created values before permitted workflow states.

### Acceptance criteria

- [ ] Historical records align to the latest export shape using canonical keys.
- [ ] Requester exports mask or blank restricted PSF Created fields before permitted statuses.
- [ ] Multi-value fields are serialized consistently in exported cells.
- [ ] Export behavior matches role-based visibility rules used elsewhere in the application.

### Blocked by

- GI-13
- GI-23

---

## GI-25: Async Large Export

### What to build

Support large exports through asynchronous processing so big result sets do not block request handling or time out during spreadsheet generation.

### Acceptance criteria

- [ ] Large export requests are processed asynchronously once the configured threshold is exceeded.
- [ ] User can receive a downloadable result once generation completes.
- [ ] Export job failures are reported clearly.
- [ ] Large export flow does not block ordinary API responsiveness.

### Blocked by

- GI-24

---

## GI-26: Notification Outbox & Email Dispatch

### What to build

Implement workflow-related email notifications using an asynchronous outbox-style flow so email failures never block request writes or status transitions.

### Acceptance criteria

- [ ] Submission and workflow status changes create notification work items.
- [ ] Notification delivery runs asynchronously from the main request write path.
- [ ] Email dispatch failure is logged without rolling back the business transaction.
- [ ] Recipients for submission and status-change notifications follow the business rules in the specification.

### Blocked by

- GI-12
- GI-14

---

## GI-27: Separate Active Schema Read Endpoint from Admin Namespace

### What to build

Move only the requester-facing active form schema read endpoint out of the admin namespace so the runtime API boundary matches its actual consumer. Keep admin-only schema management routes under `/api/admin/...`, but expose the active schema fetch used by requester form rendering through the requester-facing route `GET /api/forms/:formKey/schema`.

### Acceptance criteria

- [ ] The active schema read endpoint used by requester form rendering no longer lives under an `/api/admin/...` route namespace and is available at `GET /api/forms/:formKey/schema`.
- [ ] Admin schema management routes remain under `/api/admin/...` and are not conflated with the runtime active schema read endpoint.
- [ ] Frontend/runtime consumers of the active schema use the new read route successfully.
- [ ] Tests cover the new read route contract and guard against regression back to an admin-only namespace for requester schema reads.

### Blocked by

- GI-04

---

## Mapping from original high-level issues

Use the original `docs/github_issues.md` as the epic/reference layer:

- Original #1 → GI-01, GI-02, GI-03
- Original #2 → GI-04, GI-16, GI-17
- Original #3 → GI-05, GI-06
- Original #4 → GI-07
- Original #5 → GI-08, GI-18
- Original #6 → GI-09, GI-10
- Original #7 → GI-12, GI-20
- Original #8 → GI-13
- Original #9 → GI-26
- Original #10 → GI-21, GI-22
- Original #11 → GI-14, GI-15
- Original #12 → GI-23, GI-24, GI-25
- Original #13 → GI-19
- Original #14 → GI-20
- Original #2 / #3 follow-up → GI-27
- Original #15 → can be added later as a separate export profile enhancement after GI-24 or GI-25, depending on implementation direction

---

## Recommendation

If publishing to GitHub:
- keep `github_issues.md` as roadmap / epic context
- publish from `github_issues_refined.md` as the actual implementation issue queue
- create blockers first in dependency order

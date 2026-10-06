# Current implementation — main

Documentation baseline: `main` at commit `745ae99`, merged on 6 October 2026.
The dated updates below include subsequent changes to that baseline.
See [main documentation alignment and evidence availability](verification/2026-10-06-main-documentation-alignment.md)
for the scope of this review.

> **Admin rule dialogs update, 7 October 2026:** Auto-fill Rules now supports explicit Active/Inactive selection, modal Create/Edit and label-only wrapping targets. Edit Status keeps added recipients below both input groups. See [the approved spec](specs/2026-10-07-autofill-admin-dialogs-design.md) and [fresh verification](verification/2026-10-07-admin-autofill-dialogs.md).

> **Forms and assignment update, 6 October 2026:** The feature update, now merged into `main`, implements
> [the approved form management and request assignment design](superpowers/specs/2026-10-06-form-management-and-request-assignment-design.md).
> Form previews use temporary interactive values and assignment uses a setup
> owner's UUID. The sections below describe the resulting behavior; disposable
> local system verification is recorded separately from corporate deployment.

> **Email branch addition, 5 October 2026:** `feat/email-notification` adds status
> recipient policies, submission/transition/bulk outbox hooks, SOAP dispatch,
> background retry and admin notification APIs. Shared audit hides recipient
> policies from non-admins. See [email notifications](email-notifications.md) for
> current behavior and source links. The audit below remains the dated UI/auth
> baseline; this addition does not claim company delivery or deployment.

> **Status clarification, 4 October 2026:** [Database Status names and interaction rules](status-catalog-and-manual-updates.md) supersede old short-label catalogs, directed transition matrices and action-driven automatic Status changes below. Use complete configured strings for every displayed request Status.

> **Implementation update, 5 October 2026:** Authorized working-tree changes implement [authenticated all-role Audit History](audit-history-access.md), explicit manual Save Status and the approved Desktop shell and request tabs. Light/Dark and sidebar collapse preferences are remembered per browser. Local unit, HTTP, SQL and browser checks passed; see [implementation verification](superpowers/plans/2026-10-05-stitch-desktop-implementation.md). The configured PostgreSQL and LDAP services have not been exercised or mutated by this implementation work. This is not deployment evidence.

Original source audit date: 2026-10-02. That audit covered `unified-local-auth`
after application commit `01eab7b`, based on `rapid-frontend-rewrite` at `8c11bb4`.
The 5 and 6 October feature updates above are incorporated into the current
`main` baseline. This guide describes source behavior, not a production deployment.
Source code takes precedence over prose.
Historical specs, ADRs, plans and verification records are indexed in
[the documentation index](README.md).

## Runtime and authentication

The frontend is a React/TypeScript client with TanStack Router file routes,
Vite and Lucide. It does not use TanStack Start. The API client defaults to
`/api` and includes cookies. Vite's development server proxies that prefix
to `http://127.0.0.1:3000`.
Sources: [frontend package](../frontend/package.json),
[API client](../frontend/src/services/api.ts), [Vite config](../frontend/vite.config.ts).

The backend is NestJS with the Express adapter, `express-session`, PostgreSQL
through `pg.Pool`, and ExcelJS. `main.ts` sets `/api`, credentialed CORS and
default port 3000. No ORM runtime is configured in the database module.
Sources: [backend package](../backend/package.json), [bootstrap](../backend/src/main.ts),
[pool](../backend/src/database/database.module.ts), [modules](../backend/src/app.module.ts).

`POST /api/login` verifies credentials via the configured LDAP-backed HTTP
endpoint, validates the response identity and upserts an `app_users` profile.
LDAP refresh preserves an existing user's role/department; passwords are not
verified locally with bcrypt. Sessions store only `userId`. Authenticated
controllers resolve the current stored profile, rather than trusting client role
fields. Roles are `requester`, `setup_owner` and `admin`; Setup File Owners belong
to GNTC or MFG.
Sources: [LDAP/profile service](../backend/src/auth/auth.service.ts),
[session types](../backend/src/auth/session.types.ts),
[auth controller](../backend/src/auth/auth.controller.ts).

There are four temporary development identities, covering the three roles and
both owner departments. `POST /api/dev/login` requires `NODE_ENV=development`
or `test` and exact `DEV_AUTH_ENABLED=true`. Otherwise it returns 404 before
SQL. Valid mock login upserts the reserved profile, regenerates the session and
uses the existing profile lookup. The frontend chooser requires Vite development
and exact `VITE_DEV_AUTH_ENABLED=true`; ordinary password login remains LDAP.
Sources: [mock service](../backend/src/auth/development-auth.service.ts),
[mock controller](../backend/src/auth/development-auth.controller.ts),
[login page](../frontend/src/routes/login/-LoginPage.tsx),
[chooser](../frontend/src/routes/login/-DevelopmentLogin.tsx).
See [setup/removal](local-development-auth.md).

`LocalAuthGuard` and `RolesGuard` are permissive placeholder classes, not the
current enforcement mechanism. Controllers and services perform the actual
session/profile/role/access checks. Health and active-schema endpoints do not
require a session in their current controllers.
Sources: [guards](../backend/src/auth/local-auth.guard.ts),
[role guard](../backend/src/auth/roles.guard.ts),
[request controller](../backend/src/requests/requests.controller.ts),
[forms controller](../backend/src/forms/forms.controller.ts),
[health controller](../backend/src/app.controller.ts).

## Requests, forms and workflow

Every authenticated role can create a PSF Request as a creator-private Draft.
Foreign Drafts remain inaccessible even to Admin. Shared work is available
through all/related views; a Setup File Owner's default related view combines
actor-created requests and requests assigned to that exact user UUID, counting
overlap once. My draft is creator-only. All authenticated actors may edit
shared requester data; the original creator remains the requester. Setup File
Owners/Admin may edit PSF data on accessible work, including their own Drafts
and completed work. PSF saves do not claim or replace the setup owner.
Source: [request service](../backend/src/requests/requests.service.ts).

Assignment is optional: a request can be saved and submitted as Unassigned.
The creator can choose a setup owner while creating/editing a private Draft;
assignment never makes that Draft accessible to another user. After Submit,
every authenticated role able to access the request can assign, change or clear
its owner. Assignment changes no workflow status, PSF release or edit rights
and queues no notification job. Server-owned profile data supplies the owner
name/department snapshot, and assignment, revision, search index and history
commit in one transaction. Detail assignment uses `expectedUpdatedAt`; a stale
revision conflicts and the dialog preserves the chosen owner for review.
If the latest snapshot changes workflow status, Detail rebases the selected
status and refreshes allowed transitions without discarding pending form edits;
obsolete option responses cannot overwrite a newer request context.
Unrelated requester/PSF saves preserve the assignment. Pending form edits block
assignment saving. Selecting the existing UUID is a no-op, including after the
user's profile changes.

The authenticated assignee directory exposes only ID, display name and GNTC/MFG
department for eligible setup owners. When names and departments collide, the
picker prefixes a labeled Account ID derived from the existing UUID, extending
its prefix until it distinguishes the returned accounts. Labels stay stable
while searching, and the ID qualifier is searchable. Submit revalidates a saved nonempty
assignee; a user who lost eligibility must be replaced or explicitly cleared.
Profile name/department/role changes leave existing request snapshots intact.
Legacy name/department-only records retain their display values with a null
owner UUID; no name matching or PSF save backfills their identity. Department
work includes those records. A new explicit assignment replaces the snapshot;
Unassigned clears ID, name and department together.

Only Setup File Owners see the Dashboard Relationship dropdown: Related to me,
Created by me, Assigned to me and Department work. Personal assignment uses
UUIDs, including when owners have identical names/departments. Summary cards
and the request table apply the same committed filter. Requester/Admin dashboards
remain creator-scoped. Assigned Drafts are excluded from shared listings/indexes
and owner dashboard totals until Submit succeeds.
Sources: [assignment picker](../frontend/src/components/RequestAssigneePicker.tsx),
[assignment dialog](../frontend/src/components/RequestAssignmentDialog.tsx),
[dashboard/query scope](../backend/src/requests/search-index.service.ts).

Form Management supports separate versioned `psf-request` and
`psf-created-information` families, with draft/save/duplicate/discard/publish.
All versions expose View; only Draft exposes Edit. Active/old versions are
read-only and Duplicate as draft preserves the one-Draft-per-family rule.
The editor hides internal family/seed description text while retaining stored
descriptions and showing admin-authored descriptions. Both family previews
render real controls using unsaved config and configured section/field order,
including optional fields in their original positions. Trial values are local,
reset when changing version/family, do not dirty the config, and invoke neither
request writes nor runtime autofill/mail. Required-field checking is local;
requester identity uses clearly marked locked sample data. New Request and
Detail editors use the same configured order without automatic Additional
details grouping. Detail alone uses bold 14px field labels, thin read-mode
separators and 16px section headings; Owner / Dept remains visible.
New requests capture both active schemas. Requester Draft schema upgrades are
explicit and do not upgrade the captured PSF schema. Legacy PSF records resolve
through the fixed original descriptor. Required fields may be incomplete on
Draft saves; non-Draft saves validate the captured schema. Supported field types
are text, textarea, date, select and radio. Configurable section-role access is
absent from current schema types; restricted legacy section metadata is rejected
for reuse/publishing rather than silently exposed.
Sources: [schema constants](../backend/src/admin/form_schema.constants.ts),
[schema service](../backend/src/admin/form_schema.service.ts),
[request service](../backend/src/requests/requests.service.ts),
[form validation](../backend/src/requests/form-data-validation.ts).

Status Management uses immutable catalog identities, verbatim names and
`draft`/`open`/`completed`/`cancelled` kinds. The seed has 17 entries, including
Draft; actual configured entries are database state and may differ. The 4 October read-only inspection confirmed 17 configured entries, all stored request Status values in that catalog, and a maximum label length of 71 characters; see [the exact snapshot and current interaction constraints](status-catalog-and-manual-updates.md). Admin can
create, edit names/email/PSF access in one modal, delete with replacement and configure multiple PSF access triggers.
Percentages in labels are display text. There is no directed transition matrix:
the configured non-Draft statuses other than the current status are offered.
Form saves and autofill do not advance Status automatically. There are no preset named-stage action requirements. Draft submission selects a work status explicitly; normal status updates cannot
submit a Draft or return shared work to Draft. Catalog/request mutations use
opaque microsecond revisions, transactions, row/config locks, projections and audit.
Request Detail selects exact runtime catalog values and commits a pending choice only through **Save Status**, separately from form saves. Dirty form data blocks Status saving. Existing submission, access and revision checks remain in place.
Sources: [catalog](../backend/src/admin/workflow_transition.service.ts),
[request mutations](../backend/src/requests/requests.service.ts).

Requester visibility of PSF data depends on persistent `psf_released_at`, not
hardcoded `PSF Created`/`Completed` labels. Initially no statuses are triggers.
Successful entry into any configured trigger validates PSF requirements and sets
release once. Saving a checked trigger in Edit status also releases unreleased requests already at that status, after validating every candidate against its captured PSF schema. One invalid request rejects the whole combined save; catalog, request and search changes roll back together. Released requests are skipped and retain their timestamp. Backtracking, unchecking or deleting a trigger does not revoke release; a replacement status uses its own trigger flag. Legacy single-trigger configuration is preserved when read and converted to a trigger-ID list on writes.
Setup File Owners/Admin bypass this release check on requests they can access.
Unreleased requester PSF values are masked in detail/export and PSF update events
are omitted from their per-request history.
Sources: [visibility and release](../backend/src/requests/requests.service.ts),
[history filtering](../backend/src/audit/audit_log.service.ts),
[export masking](../backend/src/export/excel_export.service.ts).

## Autofill, audit and export

Autofill operates on `psf-request` rules. For an active valid rule, it chooses
one latest currently completed matching request using exact stored trigger value,
completion timestamp and an ID tie-break. It returns suggestions; it does not
combine fields from multiple historical requests. Global audit now resolves the authenticated stored actor for every role and filters creator-private Draft events before returning rows. Requesters' unreleased PSF update events are also omitted; requestless configuration events remain shared. Global audit is currently unpaged. Requester/PSF edit audit metadata includes per-field key,
label, before and after values; these are metadata within action rows, not a
separate audit row per field.

Admins can choose any supported requester form field as a trigger; each rule
has one trigger and one or more targets. Runtime trigger metadata comes from
active rules, including for older drafts using their original field keys.
Publishing a schema inactivates rules whose trigger is removed or whose targets
are all removed, retaining the rule and its reason for administrator review.
Partially removed targets are skipped. Saving a draft schema does not change
rules, and restoring a field does not reactivate a rule. Administrators select
Active or Inactive when creating/editing a rule. Inactive edits preserve that
choice until Active is explicitly selected; manual disabling is identified as
"Disabled by administrator." All saves still validate the trigger and selected
targets against the active schema. Existing clients omitting status create Active
rules and preserve stored status/reason when editing. Renaming labels does not
change canonical identity. Autofill preserves manual values and edits made during a lookup.
Unindexed historical values are read through their original schema snapshot;
requests with restricted legacy sections are excluded as autofill sources.

`cd backend && npm run test:postgres` exercises lookup and publication against
an isolated embedded PostgreSQL database without using configured credentials.
Auto-fill Rules uses the same modal for Create and Edit. Cancel/Escape/Close
discard the local draft; failed saves retain it, and pending saves block closing
or duplicate submission. Field selectors and the table display labels without
canonical keys. Fill target labels wrap horizontally in the space freed by
removing the Source table column; lookup still uses previous completed requests.
Sources: [admin rule editor](../frontend/src/components/AdminAutofillRulesPage.tsx),
[autofill](../backend/src/requests/autofill.service.ts),
[rules](../backend/src/admin/autofill_rule.service.ts),
[audit service](../backend/src/audit/audit_log.service.ts),
[audit controller](../backend/src/audit/audit_log.controller.ts),
[edit diffs](../backend/src/requests/requests.service.ts).

Export is backend-generated XLSX, available to Admin and Requester, excluding
Setup File Owners. Requester exports are creator-owned; Admin exports exclude
foreign Drafts. Filters include status/from/to. Counts strictly greater than
`EXPORT_SYNC_THRESHOLD` queue a job; the default is 2000, so exactly 2000 remains
synchronous. Jobs are owner-scoped and their content is stored as BYTEA.
Background jobs poll and renew claims; async export fetches pages but accumulates
records/rows and renders with ExcelJS in a worker. This is not streaming export.
Columns combine active and captured fields by canonical key, respect exportable
flags and mask unreleased requester PSF values. Six metadata columns precede form
fields; Product Type is the first default requester-form field, not the first
XLSX column.
Sources: [export routes/policy](../backend/src/export/export.controller.ts),
[query scope](../backend/src/requests/search-index.service.ts),
[workbook](../backend/src/export/excel_export.service.ts),
[job persistence](../backend/src/export/export-job.repository.ts),
[processor](../backend/src/export/export-job.processor.ts).

## API routes

All paths below include the prefix from `main.ts`. Request IDs and form keys
are path parameters; form-config GET additionally accepts its controller's
query parameters. This table lists routes, not full payload schemas.

| Area               | Methods and paths                                                                                                                                                | Source                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Health             | `GET /api/health`                                                                                                                                                | [AppController](../backend/src/app.controller.ts)                                      |
| Auth               | `POST /api/login`, `POST /api/logout`, `GET /api/me`                                                                                                             | [AuthController](../backend/src/auth/auth.controller.ts)                               |
| Development auth   | `POST /api/dev/login`                                                                                                                                            | [DevelopmentAuthController](../backend/src/auth/development-auth.controller.ts)        |
| Active schema      | `GET /api/forms/:formKey/schema`                                                                                                                                 | [FormsController](../backend/src/forms/forms.controller.ts)                            |
| Requests           | `POST/GET /api/requests`, `GET /api/requests/:requestId`                                                                                                         | [RequestsController](../backend/src/requests/requests.controller.ts)                   |
| Assignment         | `GET /api/requests/assignees`, `PUT /api/requests/:requestId/assignment`                                                                                         | [RequestsController](../backend/src/requests/requests.controller.ts)                   |
| Request reads      | `GET /api/requests/:requestId/history`, `GET /api/requests/:requestId/status-options`                                                                            | [RequestsController](../backend/src/requests/requests.controller.ts)                   |
| Request edits      | `PUT /api/requests/:requestId/requester-data`, `PUT /api/requests/:requestId/psf-created-data`, `PUT /api/requests/:requestId/status`                            | [RequestsController](../backend/src/requests/requests.controller.ts)                   |
| Submission/upgrade | `POST /api/requests/:requestId/submit`, `POST /api/requests/:requestId/upgrade-schema`                                                                           | [RequestsController](../backend/src/requests/requests.controller.ts)                   |
| Status reads       | `GET /api/workflow/statuses`                                                                                                                                     | [WorkflowStatusController](../backend/src/admin/workflow_transition.controller.ts)     |
| Admin catalog      | `GET/PUT /api/admin/workflow`                                                                                                                                    | [WorkflowTransitionController](../backend/src/admin/workflow_transition.controller.ts) |
| Admin users        | `GET /api/admin/users`, `PUT /api/admin/users/:userId`                                                                                                           | [UserManagementController](../backend/src/admin/user_management.controller.ts)         |
| Admin forms        | `GET/PUT /api/admin/form-config`, `POST /api/admin/form-config/publish`, `POST /api/admin/form-config/duplicate`, `DELETE /api/admin/form-config/draft/:version` | [FormSchemaController](../backend/src/admin/form_schema.controller.ts)                 |
| Admin autofill     | `GET/POST /api/admin/autofill`, `PUT /api/admin/autofill/:ruleId`                                                                                                | [AutofillRuleController](../backend/src/admin/autofill_rule.controller.ts)             |
| Autofill lookup    | `GET /api/autofill`                                                                                                                                              | [AutofillController](../backend/src/requests/autofill.controller.ts)                   |
| Global audit       | `GET /api/audit-logs`                                                                                                                                            | [AuditLogController](../backend/src/audit/audit_log.controller.ts)                     |
| XLSX/jobs          | `GET /api/requests/export.xlsx`, `GET /api/requests/export-jobs/:jobId`, `GET /api/requests/export-jobs/:jobId/download`                                         | [ExportController](../backend/src/export/export.controller.ts)                         |

## Persistence and startup

Runtime initializers check connectivity and create/alter storage or seed missing
defaults. Starting the app can write to the configured database. There is no
standalone migration command in the backend package scripts.

| Tables                                                    | Initializer/source                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `app_users`                                               | [AuthService](../backend/src/auth/auth.service.ts)                               |
| `psf_requests`                                            | [RequestsService](../backend/src/requests/requests.service.ts)                   |
| `form_definitions`                                        | [FormSchemaService](../backend/src/admin/form_schema.service.ts)                 |
| `workflow_transition_config`                              | [WorkflowTransitionService](../backend/src/admin/workflow_transition.service.ts) |
| `autofill_rules`                                          | [AutofillRuleService](../backend/src/admin/autofill_rule.service.ts)             |
| `canonical_submission_values`, `psf_request_search_index` | [SearchIndexService](../backend/src/requests/search-index.service.ts)            |
| `psf_request_audit_logs`                                  | [AuditLogService](../backend/src/audit/audit_log.service.ts)                     |
| `psf_export_jobs`                                         | [ExportJobRepository](../backend/src/export/export-job.repository.ts)            |

Requests hold requester/PSF data and independent schema snapshots in JSONB,
creator and owner association, release and other timestamps. The deployed
contents/schema/version are not established by the source audit. The supplied
development endpoint `10.0.20.6:5432/psf_setup_db` passed a read-only connection
check through `pg.Pool`; this did not run application initializers or feature writes.
Credentials belong in ignored local configuration.

## Frontend routes and session state

| Paths                                                                                       | Current component                               |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `/login`                                                                                    | LoginPage; local chooser is development-only    |
| `/dashboard`, `/requests`, `/my-drafts`, `/requests/new`, `/requests/$requestId`            | RequestsWorkspace components                    |
| `/history`                                                                                  | GlobalHistoryPage                               |
| `/admin/users`                                                                              | AdminUserManagementPage                         |
| `/admin/form-config`, `/admin/form-config/$version`, `/admin/form-config/$formKey/$version` | Form list/version components for both families  |
| `/admin/workflow`                                                                           | AdminWorkflowTransitionPage (status catalog UI) |
| `/admin/autofill`                                                                           | AdminAutofillRulesPage                          |
| `/admin/export-profile`                                                                     | RequestExportPage; no export-profile CRUD       |
| `/admin/`                                                                                   | Administration directory                        |
| `/requests/$requestId/history`                                                              | RequestHistoryPage                              |
| `/admin/master-data`                                                                        | Placeholder page                                |

Source: [file routes](../frontend/src/routes),
[navigation permissions](../frontend/src/components/navigationState.ts).
Request Detail includes Requester Information, PSF Created Information and History tabs for submitted work; its explicit form Edit/Save/Cancel controls remain separate from Save Status. The standalone request History route uses the request's real UUID and visibility rules. Drafts retain their dedicated editing/submission flow.
Form editing uses application components, including a textarea-based advanced
JSON editor, rather than Monaco/CodeMirror.
Sources: [visual form editor](../frontend/src/components/AdminFormConfigEditor.tsx),
[advanced JSON textarea](../frontend/src/components/AdminFormConfigPage.tsx).

AppShell loads `/api/me` and subscribes to login/logout/profile-refresh events.
Other API errors throw `ApiError`; non-`/api/me` 401 responses notify the shared anonymous-session state. UI navigation visibility does not replace backend checks.
Sources: [AppShell](../frontend/src/components/AppShell.tsx),
[session events](../frontend/src/services/auth-session.ts),
[API client](../frontend/src/services/api.ts).

The approved Desktop shell defaults to Light on first visit and remembers explicit Light/Dark and sidebar collapse choices per browser. Collapsed Desktop navigation keeps accessible links usable; Audit History is shared across roles, while Admin tools retain Admin visibility and Export retains its existing role restrictions. Parent Back links sit beside semantic linked breadcrumbs, including Draft → My Drafts and Admin tool → Administration parents. The existing mobile drawer remains available without a mobile redesign.
Sources: [theme and preferences](../frontend/src/components/theme.ts),
[sidebar](../frontend/src/components/NavSidebar.tsx),
[breadcrumb resolution](../frontend/src/components/requestBreadcrumb.ts).

## Known limits and evidence boundaries

The following 6 October application test and screenshot results are retained
from the feature implementation notes. The original Task 4 report and its local
artifacts are absent from this clone; this documentation review did not reproduce
those results. See [evidence availability](verification/2026-10-06-main-documentation-alignment.md#earlier-task-4-results)
for the retained claims and tracked verification procedure.

Local verification on 6 October 2026 passed the new `test:forms:system` (9 tests),
existing `test:email:system` (9 tests), and `test:ui:system` (1 test). These used
real compiled frontend/backend, disposable PostgreSQL, real authentication and
independent Chrome sessions with local LDAP/SOAP boundaries. No application API
responses were mocked. The new tests verify UUID ownership/index persistence,
Draft privacy, personal Dashboard numbers/totals, history, assignment conflicts,
no assignment email jobs, both Preview controls and local required validation.
The removed-option Preview validation defect was reproduced and fixed before
the final passing run. A subsequent 9-test run also passed mobile validation
action focus/keyboard activation, scrolling and modal focus return.

Desktop/mobile × light/dark screenshots were inspected for requester/PSF
Preview, New Request, Detail labels, assignment dialog and Dashboard. Detail
labels/separators and Owner / Dept remained visible; dialogs fit the viewport
and mobile validation actions were reachable by keyboard. Background admin
breadcrumbs overlap at mobile width in Preview frames; this shell limitation
remains visible outside the modal. The tracked [Task 4 verification plan](superpowers/plans/2026-10-06-form-management-and-request-assignment.md#task-4-real-system-flows-visual-checks-and-final-review)
and the [form-management](../backend/test/form-management-system.e2e.mjs) /
[request-assignment](../backend/test/request-assignment-system.e2e.mjs) test sources
are available for reproduction; they do not replace the missing original run report.

- No attachment runtime, export-profile CRUD, tracked Nginx deployment configuration,
  or advanced third-party schema editor is implemented in this checkout.
- Sessions use the default in-memory store; `main.ts` has a development fallback
  secret. Mock auth being blocked in production is not a production readiness audit.
- LDAP login does not currently regenerate the session; mock login does. This
  document reports the difference without changing the implementation.
- Background XLSX rendering retains records/rows in memory; global audit is unpaged.
- The [earlier Status verification](verification/2026-10-02-status-management.md)
  reports a deferred read-snapshot/count inconsistency (Q3). This documentation
  audit did not reproduce it or establish that it is fixed.
- Runtime TLS, proxy/session persistence, company LDAP reachability and full live
  database/browser behavior remain unverified here.

See [auth verification](verification/2026-10-02-unified-local-auth.md) for dated
tests/build/lint and the separate read-only database connectivity addendum.
For setup use the package READMEs and [local auth guide](local-development-auth.md);
for diagrams use [current diagrams](diagrams.md). Historical documents describe
their original intent/results and do not override this guide or source.

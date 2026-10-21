# Current implementation — main

Documentation baseline: `main` at commit `745ae99`, merged on 6 October 2026.
The dated updates below include subsequent changes to that baseline.
See [main documentation alignment and evidence availability](verification/2026-10-06-main-documentation-alignment.md)
for the scope of this review.

> **Centred request column, 21 October 2026:** New Request, Request Detail (Drafts and submitted requests) and Admin Draft detail sit in one column at most 1335px wide (`--request-page-max-width`), centred in the content area, and their form rows fill the card instead of stopping at 840px; the label column stays 260px. New Request was previously capped at 1120px and the detail pages were not capped. A Draft's Attachments card, also in Draft Management, now sits 16px below Requester Information, as on New Request. See the [verification record](verification/2026-10-21-single-column-form.md#centred-request-column). Checks ran in Chromium against a throwaway local database.

> **Pinned action bar, 21 October 2026:** on every editable form (New Request, Draft and submitted request editing, PSF Created Information editing and the Admin Form Management preview) the action buttons sit in a bar pinned to the bottom of the viewport, or of the preview's scroll region, while the form scrolls; at the end of the form it sits below the last row. It spans the form card with Save as the right-most button at the card's right edge. Saving, saved and save errors of the Requester form and of PSF Created Information appear in the bar, left of the buttons (saving and saved as a status, errors as an alert), instead of at the top of the card or page; the preview's "All required fields are complete." appears there too. Status changes, load errors, Draft schema upgrades and other page-level notices stay at the top. See the [verification record](verification/2026-10-21-single-column-form.md#pinned-action-bar) (issue #90). Checks ran in Chromium against a throwaway local database.

> **Single-column form rows, 21 October 2026:** every rendering of a Form Schema (New Request, Draft and submitted request editing, PSF Created Information viewing and editing, the Admin Form Management preview, read-only Request Detail, Admin Draft detail and Request Snapshots) shows one row per field: the label in a 260px column on the left, the control or stored value on the right, rows separated by a divider and capped at 840px wide. Below 600px wide the label sits above its control. The two-column grid and its full-width text areas, radios, Title and Product Type are gone; field order, sections, labels, required flags and visibility are unchanged. See the [verification record](verification/2026-10-21-single-column-form.md) (issue #88). Checks ran in Chromium against a throwaway local database.

> **Attachment Policy, 21 October 2026:** `GET /api/attachment-policy` gives any signed-in role `{ maxBytes, blockedExtensions }` from the storage configuration uploads are checked against; both Attachment pickers show the per-file limit and blocked file types from it, and New Request refuses an oversized file at selection as it does a blocked type, reading the type as the server does. A file chosen there while the policy is still loading is staged and checked when the policy arrives. The frontend no longer keeps its own blocked-extension list; without the policy the pickers work with no hint or client-side check. See [Request Attachments](request-attachments.md#access-and-api) (issue #89). Checks ran in Chromium against a throwaway local database and a temporary attachment directory, alongside controller, application-module and frontend tests; the check of files chosen before the policy loads and the server-style type reading are covered by frontend tests only.

> **Input border contrast, 21 October 2026:** in the light theme the `--input-border` token is `#858b88` (previously `#a7adaa`), so text input, select and text area borders measure 3.47:1 against the card and 3.19:1 against the page background (WCAG 2.1 SC 1.4.11). Secondary buttons, radio options, dialog borders and the other elements that share the token darken with it; the dark theme is unchanged (4.38:1 against the card). See the [verification record](verification/2026-10-21-input-border-contrast.md) (issue #87). Checks ran in Chromium against a throwaway local database.

> **Attachments and request IDs, 20 October 2026:** every request has a sequential integer ID continuing the Imported Requests' numbering; a submitted Draft is renumbered `PSF-` and its six-digit ID; New Request starts Product_Description as `Product_Description`. Attachments live in a `[Product_Description]_[ID]` folder under `ATTACHMENT_STORAGE_PATH` (the NAS), with metadata in `psf_request_attachments` reconciled on every read, an Attachments tab on submitted Request Detail and a section below Requester Information on Drafts and New Request. Audit History shows Product_Description instead of Draft numbers and records `ATTACHMENT_UPLOADED`/`ATTACHMENT_DELETED`. See [Request Attachments and request IDs](request-attachments.md) (issue #78). Checks ran on disposable databases and a temporary directory, not the configured database or a NAS share.

> **Request Snapshot, 11 October 2026:** an Audit History entry tied to a request now stores a Request Snapshot, opened read-only through "View Request Snapshot" in the request's History tab or on the Audit History page ([ADR 0016](adr/0016-full-request-snapshot-per-audit-history-entry.md), issue #74). Bulk Status replacement entries and entries recorded before this change have none. This is a source change; the dated checks, including a run on the configured PostgreSQL server inside session-temporary tables, are in the [verification record](verification/2026-10-11-request-snapshot.md). The configured tables were not written and no deployment was exercised.

> **Initial Data Load, number fields and export scope, 8 October 2026:** the [Initial Data Load script](initial-data-load.md) reloads forms, the Status catalog and requests from the PSF form detail workbook. Form fields may be `number` (validated as plain decimals, exported as numeric cells), Dashboard Team Group also reads the Request To options, and every authenticated role exports all submitted (non-Draft) requests, never any Draft, not even their own. The load script was run against the configured database on 8 October 2026 with `--lenient` (read-back counts only); see [Initial Data Load](initial-data-load.md).

> **Draft lifecycle update, 7 October 2026:** Admin/My Draft deletion, seven-day reminders and Product Type team filtering replace request assignment. See [the implementation guide](draft-management-and-reminders.md) and [verification](verification/2026-10-07-draft-lifecycle-and-team-filtering.md).

> **Admin rule dialogs update, 7 October 2026:** Auto-fill Rules now supports explicit Active/Inactive selection, modal Create/Edit and label-only wrapping targets. Edit Status keeps added recipients below both input groups. See [the approved spec](specs/2026-10-07-autofill-admin-dialogs-design.md) and [fresh verification](verification/2026-10-07-admin-autofill-dialogs.md).

> **Historical forms and assignment update, 6 October 2026 (assignment superseded by 7 October Draft lifecycle changes):** The feature update, now merged into `main`, implements
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

Every authenticated role can create and edit their own Draft. Other ordinary
actors cannot access it. Admin Draft Management provides a separate read-only
list/detail capability for Admins; it does not permit editing or submitting a
foreign Draft. Creator/Admin may permanently delete a current Draft using its
opaque revision. Submitted work is never deletable through these operations.
All authenticated actors may edit shared requester information. Setup File
Owners/Admin may edit accessible shared PSF information across departments,
including completed work. Requester-only actors retain their PSF restrictions.
Sources: [request lifecycle](../backend/src/requests/requests.service.ts),
[Admin management](../backend/src/requests/admin-drafts.controller.ts).

Request assignment has been removed from inputs, endpoints, responses, screens,
Excel metadata and stored assignment history. Account roles/departments remain.
Startup performs an idempotent, scoped cleanup of legacy assignment values and
metadata and invalidates cached exports that could retain them. Ordinary request
content/history is preserved. PSF saves do not capture an individual owner.

Setup File Owner Dashboard defaults to a Product Type-derived Team filter:
New Product is GNTC; Transfer Product/Existing Product is MFG. All teams and
unclassified work remain selectable. Missing/custom Product Type values display
“รอระบุ Product Type”. Team filtering does not restrict cross-team PSF editing.
Rows, totals and summaries use the same query; changes follow the latest saved
Product Type without modifying existing PSF information. Requester/Admin
Dashboard remains creator-scoped. Drafts stay outside shared work totals.
Source: [query scope](../backend/src/requests/search-index.service.ts),
[Dashboard](../frontend/src/components/RequestsWorkspace.tsx).

Permanent deletion removes Draft form/schema content, prior audit metadata,
projections and request-linked mail. Only minimal actor/Draft-number/time deletion
logs remain, visible to Admins. Existing creator-owned export jobs are conservatively
invalidated: their content and claim tokens are cleared so a running worker cannot
publish stale Draft contents afterward. New exports read remaining current records.
See [Draft management and reminders](draft-management-and-reminders.md).

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
details grouping. Every rendering uses the same single-column rows: one row per
visible field, a 260px label column and a flexible control column, a divider under
each row, and the label above its control below 600px wide. On New Request,
Request Detail and Admin Draft detail the rows fill the form card in a centred
column at most 1335px wide; elsewhere they are at most 840px wide.
Labels are bold 14px in both editable and read-only mode, and read-only values sit
on the controls' line, so switching a request between viewing and editing keeps
ordinary rows at the same height; radio groups and text areas may grow while
editing. A radio group is a `role="radiogroup"` element named by its row's label
cell and keeps its required, invalid and described-by state. The required marker,
field error, Auto-fill status and "Previous" value stay in the field's row; a
Request Snapshot tints changed rows. Detail keeps 16px section headings. Request
Owner / Dept metadata has been removed.
An editable form ends in an action bar that is `position: sticky` at the bottom of
the window (in the Admin preview, of its "Preview fields" scroll region), so it stays
on screen while the form scrolls and the last row still scrolls clear of it. In a form
card it spans the card edge to edge; buttons are right-aligned with Save last (Delete
Draft or Cancel before it), and below 600px wide they share their own line, stacking
when they do not fit. The bar's status area, left of the buttons, reports the form's
action: the Requester form shows "Saving requester information…", then "Draft
DRAFT-… saved." or "Requester information saved.", or the save error; PSF Created
Information shows "Saving PSF Created Information…", then "PSF Created Information
for PSF-… saved." or the error (including the 409 conflict messages); the preview
shows "All required fields are complete.". Saving and saved are a polite
`role="status"` region that stays mounted, errors a `role="alert"`. While a save runs
the form is read-only and the buttons stay in the bar, disabled. A save error keeps
the form editable. After a successful explicit-edit save (submitted Requester
Information, PSF Created Information) the form returns to read-only and the bar
keeps only the saved message, until "Edit information", a field change or Cancel
clears it; a Draft stays editable with the message beside its buttons until the next
edit. A Draft schema upgrade is started at the top of the card and still reports
there. Keyboard focus scrolled into view stops above the bar (`scroll-padding-bottom`).
New requests capture both active schemas. Requester Draft schema upgrades are
explicit and do not upgrade the captured PSF schema. Legacy PSF records resolve
through the fixed original descriptor. Required fields may be incomplete on
Draft saves; non-Draft saves validate the captured schema. Supported field types
are text, textarea, number, date, select and radio. Configurable section-role access is
absent from current schema types; restricted legacy section metadata is rejected
for reuse/publishing rather than silently exposed.
Sources: [schema constants](../backend/src/admin/form_schema.constants.ts),
[schema service](../backend/src/admin/form_schema.service.ts),
[request service](../backend/src/requests/requests.service.ts),
[form validation](../backend/src/requests/form-data-validation.ts),
[form renderer](../frontend/src/components/DynamicFormRenderer.tsx),
[row styles](../frontend/src/index.css).

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

Each entry tied to a request also stores a Request Snapshot: both forms' values,
the Work Status and the Form Version numbers, captured in the same transaction as
the change. Creation records the initial content, and submit and a Draft Form
Version upgrade record their field changes. A save that changes nothing writes
nothing: no entry and no new revision. Bulk Status replacement keeps its per-request entries but stores no
Request Snapshot. Reading one applies the request's access check, hides PSF
Created Information and PSF update entries from a Requester before release, and
renders with the Form Version of that time. History entries now carry an `id`
and `hasRequestSnapshot`; both are additions, and no earlier field changed. The
request's History tab reloads after a save or Status change that produced a new
revision.
Sources: [capture and read](../backend/src/audit/audit_log.service.ts),
[visibility and Form Version lookup](../backend/src/requests/requests.service.ts),
[bulk replacement exception](../backend/src/admin/workflow_transition.service.ts),
[Request Snapshot page](../frontend/src/components/RequestSnapshotPage.tsx).

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

Export is backend-generated XLSX, available to every authenticated role and
covering all requests except other creators' Drafts. Requester actors still get
blank PSF cells for requests without a PSF Visibility Release. The Export page
preview list keeps the Dashboard's creator scope for Requesters. Filters include status/from/to. Counts strictly greater than
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
| Request reads      | `GET /api/requests/:requestId/history`, `GET /api/requests/:requestId/history/:entryId` (Request Snapshot), `GET /api/requests/:requestId/status-options`     | [RequestsController](../backend/src/requests/requests.controller.ts)                   |
| Draft management | `GET /api/admin/drafts`, `GET /api/admin/drafts/:id`, `GET /api/admin/draft-deletions`, `DELETE /api/requests/:id` | [Admin controller](../backend/src/requests/admin-drafts.controller.ts), [request controller](../backend/src/requests/requests.controller.ts) |
| Draft reminders | `GET /api/admin/draft-reminders` | [reminder inspection](../backend/src/notifications/draft-reminders.controller.ts) |
| Attachments        | `GET/POST /api/requests/:requestId/attachments`, `GET /api/requests/:requestId/attachments/:attachmentId/download`, `DELETE /api/requests/:requestId/attachments/:attachmentId` | [RequestAttachmentsController](../backend/src/requests/request-attachments.controller.ts) |
| Attachment Policy  | `GET /api/attachment-policy` returns `{maxBytes,blockedExtensions}` to any authenticated role (no request ID)                                                     | [AttachmentPolicyController](../backend/src/requests/attachment-policy.controller.ts)  |
| Request edits      | `PUT /api/requests/:requestId/requester-data`, `PUT /api/requests/:requestId/psf-created-data`, `PUT /api/requests/:requestId/status`                            | [RequestsController](../backend/src/requests/requests.controller.ts)                   |
| Submission/upgrade | `POST /api/requests/:requestId/submit`, `POST /api/requests/:requestId/upgrade-schema`                                                                           | [RequestsController](../backend/src/requests/requests.controller.ts)                   |
| Status reads       | `GET /api/workflow/statuses`                                                                                                                                     | [WorkflowStatusController](../backend/src/admin/workflow_transition.controller.ts)     |
| Admin catalog      | `GET/PUT /api/admin/workflow`                                                                                                                                    | [WorkflowTransitionController](../backend/src/admin/workflow_transition.controller.ts) |
| Admin users        | `GET /api/admin/users`, `PUT /api/admin/users/:userId`                                                                                                           | [UserManagementController](../backend/src/admin/user_management.controller.ts)         |
| Admin forms        | `GET/PUT /api/admin/form-config`, `POST /api/admin/form-config/publish`, `POST /api/admin/form-config/duplicate`, `DELETE /api/admin/form-config/draft/:version` | [FormSchemaController](../backend/src/admin/form_schema.controller.ts)                 |
| Admin autofill     | `GET/POST /api/admin/autofill`, `PUT /api/admin/autofill/:ruleId`                                                                                                | [AutofillRuleController](../backend/src/admin/autofill_rule.controller.ts)             |
| Autofill lookup    | `GET /api/autofill`                                                                                                                                              | [AutofillController](../backend/src/requests/autofill.controller.ts)                   |
| Global audit       | `GET /api/audit-logs?limit&offset` (default 25, max 100) returns `{items,total,limit,offset}`                                                                     | [AuditLogController](../backend/src/audit/audit_log.controller.ts)                     |
| XLSX/jobs          | `GET /api/requests/export.xlsx`, `GET /api/requests/export-jobs/:jobId`, `GET /api/requests/export-jobs/:jobId/download`                                         | [ExportController](../backend/src/export/export.controller.ts)                         |

## Persistence and startup

Runtime initializers check connectivity and create/alter storage or seed missing
defaults. Starting the app can write to the configured database. There is no
standalone migration command in the backend package scripts.

| Tables                                                    | Initializer/source                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `app_users`                                               | [AuthService](../backend/src/auth/auth.service.ts)                               |
| `psf_requests` (with `numeric_id` and `psf_request_numeric_id_seq`) | [RequestsService](../backend/src/requests/requests.service.ts)                   |
| `psf_request_attachments`                                 | [RequestAttachmentsService](../backend/src/requests/request-attachments.service.ts) |
| `form_definitions`                                        | [FormSchemaService](../backend/src/admin/form_schema.service.ts)                 |
| `workflow_transition_config`                              | [WorkflowTransitionService](../backend/src/admin/workflow_transition.service.ts) |
| `autofill_rules`                                          | [AutofillRuleService](../backend/src/admin/autofill_rule.service.ts)             |
| `canonical_submission_values`, `psf_request_search_index` | [SearchIndexService](../backend/src/requests/search-index.service.ts)            |
| `psf_request_audit_logs`                                  | [AuditLogService](../backend/src/audit/audit_log.service.ts)                     |
| `psf_export_jobs`                                         | [ExportJobRepository](../backend/src/export/export-job.repository.ts)            |

Requests hold requester/PSF data and independent schema snapshots in JSONB,
creator, release and other timestamps. Request assignment columns are cleared for legacy storage compatibility and are not part of current request contracts. The deployed
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
| `/requests/$requestId/history/$entryId`                                                     | RequestSnapshotPage (read-only)                 |
| `/admin/master-data`                                                                        | Placeholder page                                |

Source: [file routes](../frontend/src/routes),
[navigation permissions](../frontend/src/components/navigationState.ts).
Request Detail includes Requester Information, PSF Created Information, Attachments and History tabs for submitted work (Drafts show Attachments below Requester Information; see [Request Attachments](request-attachments.md)). Each Attachment picker, there and on New Request, states the server's per-file limit and blocked file types from `/api/attachment-policy`, and New Request refuses an oversized or blocked file when it is chosen (or, for a file chosen before the policy loaded, when the policy arrives). Request Detail's explicit form Edit/Save/Cancel controls remain separate from Save Status: a form save reports in that form's pinned action bar, while Status changes, workflow-option refresh errors and load errors report at the top of the page. The standalone request History route uses the request's real UUID and visibility rules. Drafts retain their dedicated editing/submission flow.
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
[historical request-assignment](https://github.com/Kasidet4531/Web-Request-setup-file/blob/43f6d6abe3245662300e17b25742f71e68fe739c/backend/test/request-assignment-system.e2e.mjs) test sources (the assignment source is pinned to its pre-removal commit)
are available for historical reproduction; they do not replace the missing original run report.

- No export-profile CRUD, tracked Nginx deployment configuration,
  or advanced third-party schema editor is implemented in this checkout.
- Sessions use the default in-memory store; `main.ts` has a development fallback
  secret. Mock auth being blocked in production is not a production readiness audit.
- LDAP login does not currently regenerate the session; mock login does. This
  document reports the difference without changing the implementation.
- Background XLSX rendering retains records/rows in memory.
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

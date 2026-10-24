# Current implementation — main

Documentation baseline: `main` at commit `745ae99`, merged on 6 October 2026.
The dated updates below include subsequent changes to that baseline.
See [main documentation alignment and evidence availability](verification/2026-10-06-main-documentation-alignment.md)
for the scope of this review.

> **Request To and Target 12NC Desc, 24 October 2026:** screens and request emails use the [glossary](../GLOSSARY.md) names (issue #112). The Requests, Dashboard and My Drafts tables are headed Target 12NC Desc and Request To (and so are their narrow-screen cell labels), Draft Management's column is Request To and its Keyword hint reads "Draft number or Target 12NC Desc…", and Audit History's column is Target 12NC Desc; the Search help on Requests, Dashboard and Audit History says Target 12NC Desc instead of product description. A missing or unrecognised Request To shows "รอระบุ Request To" instead of "รอระบุ Product Type". The Dashboard Team options read `GNTC — Create new PSF`, `MFG — Revise from old PSF / Product Transfer` and `รอระบุ Request To`; their values (`GNTC`, `MFG`, `unclassified`) and the grouping are unchanged. Request emails (New Request, Status change, Completed, Cancelled) head the rows Target 12NC Desc and Request To, still filled green and in the same order; emails already in the outbox keep their queued body. New Request starts every field blank: Target 12NC Desc is no longer prefilled with `Product_Description`, a Draft saved without it keeps its `_[ID]` Attachment folder until it is typed (ADR 0018), and the captured form's required flag decides whether submission needs it. Stored keys (`product_type`, `title`), the Form Schema field labels (shown in the forms, Request Snapshots, the Excel export and the Export Preview) and the built-in seed form are unchanged; administrators set those labels in Form Management ([Thai admin guide: ชื่อที่แสดงบนหน้าจอ](admin-guide-th/display-names.md)). Checked with component tests, the email template unit tests and the in-memory notification database suite; no mail was sent and no browser run was made for this change.

> **Attachment Categories, 24 October 2026:** each item of `GET /api/requests/:requestId/attachments` carries a `category` worked out from its file name, ignoring case: `map_layout` (Map Layout File) for a name ending in `.xml`, `.dpl`, `.lay`, `.tpl` or `.mdf`, `fpc_layout` (FPC Layout File) for a name starting with `PCSF` and ending in `.xls`, `.xlsx` or `.xlsm`, and `other` for every other file ([ADR 0022](adr/0022-attachment-categories-and-revise-file-copy.md), issue #122). The lists live only in [attachment-category.ts](../backend/src/requests/attachment-category.ts). The Attachments panel on Request Detail, Drafts and Admin Draft inspection lists the files under Map Layout File, FPC Layout File and Other, in that order, each with its count and a line saying when it is empty; before, it was one list. Nothing is stored and nothing moves on the NAS, so Imported Requests and files placed in the folder directly are grouped at once. See [Request Attachments](request-attachments.md#attachment-categories) and the Thai admin guide page [หมวดไฟล์แนบ](admin-guide-th/attachment-categories.md). Checks ran on in-memory PostgreSQL with a temporary directory and in frontend component tests; not in a browser or against the NAS share.

> **Request email summary, 22 October 2026 (row names superseded by the Request To and Target 12NC Desc entry above):** request emails (New Request, Status change, Completed, Cancelled) follow the current form and request tables. The Priority row and the cancellation-only Reason / Remarks row are removed for every form (the Initial Data Load forms have neither field; the built-in seed form's Priority is no longer emailed either), Title is headed Product Description, Product Type is shortened as in the tables (`Create new PSF` rather than `Create new PSF (Require PCSF , E142 or .DPL)`; unrecognised values are shown as stored), and Updated By shows only the actor's display name instead of `Name (role)`. Everything outside the table's data is centred, row labels are left-aligned, the status update line ("Status Updated to …") is highlighted yellow and Product Description and Product Type are filled green, using inline styles for Outlook. Values were already current when queued; emails already in the outbox keep their queued body. The Draft reminder email is unchanged. See [email notifications](email-notifications.md#trigger-rules). Checked with unit tests and the in-memory notification database suite; no mail was sent.

> **Workflow catalog updates left out of Audit History, 22 October 2026:** the Audit History page no longer lists entries with the action "Workflow catalog updated", and its Action filter no longer offers that action (issue #106). `GET /api/audit-logs` leaves them out of both the rows and the total for every role, even when the action filter asks for them. Before, each such entry had a "View changes" toggle that listed the raw catalog operation, the whole Status catalog before and after, and "Requester PSF access released for N request(s)"; it was hard to read and widened the Detail column when opened. Status Management changes are still recorded in `psf_request_audit_logs` with the same metadata, so they can be read from the database or shown again later. A PSF Visibility Release made by enabling a trigger in Edit status for requests already at that status is recorded only in such an entry, so no page shows that release now. Bulk Status replacement entries belong to each request and stay listed with "View changes". See the [verification record](verification/2026-10-22-catalog-entries-hidden.md). Checks ran in Chromium against a throwaway local database.

> **Autofill and choice fields, 22 October 2026:** Autofill fills a select or radio target only when the previous request's value is one of that field's options in the form being filled. A value the options no longer have (an option renamed or removed since that request) leaves the field blank and unmarked, for the Requester to choose. Before, the old value was filled in and shown as an extra choice, and the server refused it with "must be one of the configured options", so the request could be neither saved nor submitted. Text, text area, number and date targets are unchanged. Source: [form state](../frontend/src/components/activeSchemaFormState.ts).

> **Request Snapshot reading layout, 22 October 2026 (catalog entries' "View changes" superseded by the Workflow catalog entry above):** a Request Snapshot (`/requests/$requestId/history/$entryId`) now reads like Request Detail (issue #103, layout A of the archived [prototype](https://github.com/Kasidet4531/Web-Request-setup-file/tree/prototype/request-snapshot-a-2026-10-21)): a centred column at most 1335px wide with a "Request History" link, the recorded date and time in ICT (UTC+7), the action, the actor and role, the Form Version numbers of that time and "Read only"; then a summary of the update's edits with a link to each; the Work Status of that time; and Requester Information and PSF Created Information in separate panels, every field of the stored Form Schema in order (identity fields such as Requester Name and Modified By included), label in a 260px column beside the full value, line breaks kept, a blank value shown as "Not provided". Only the fields the update changed are marked: orange background, one-pixel outline, an icon and "Changed in this update", with the earlier value under "Before this update". A Status change shows the complete stored names before and after the update; a Status-only update says no form-field edits were recorded. Fields a Form Version upgrade removed are listed in their own panel. There is no comparison with the current request. Before, the page showed a short summary list (Work Status with "Previous:", changed field names) above the two forms in the 840px read-only renderer, which hid the identity fields, and marked changes only with "Previous:". On the Audit History page an entry with a Request Snapshot now offers only "View Request Snapshot" (an attachment entry still shows its file name), so opening a change list no longer widens the Detail column; entries without one (catalog updates, bulk Status replacements, entries recorded before 11 October) keep "View changes". On a request's History tab "View changes" sits below "View Request Snapshot", so opening it leaves the link in place. Wherever "View changes" appears, a Status change is a "Work Status" row of its Field, Before and After table instead of a separate "Status: X → Y" line. Reads, access checks and unavailable entries are unchanged. See the [verification record](verification/2026-10-22-request-snapshot-layout.md).

> **Audit History columns, 22 October 2026 (requestless configuration events superseded by the Workflow catalog entry above; the Product Description column is now headed Target 12NC Desc):** the compound Request column is split into Product Description and Request No. Both can open the request; Drafts keep their descriptive link and show "—" in Request No. without exposing their internal Draft number. Existing untitled-request labels are retained; if the API supplies no label, the description cell shows "—" instead of repeating the number. Requestless configuration events retain their configuration label without a number. Search/filter behavior and Request Snapshot links are unchanged. See [requirements](specs/2026-10-22-search-filter-requirements-notes.md#audit-history-columns--follow-up-22-october-2026) and [local verification](verification/2026-10-22-search-filters.md).

> **Search and filters, 22 October 2026:** Audit History has one Search field for Request No., Product Description and the actor's display name/username, with a 300 ms pause before searching. Action and date filters update automatically; Apply is removed. More filters contains the date inputs, selected dates stay visible when collapsed, and both date boundaries use Asia/Bangkok calendar days. History has no Status filter. Requests/Dashboard/My Drafts explain their existing Search fields. `GET /api/workflow/statuses` adds `filterStatuses`: catalog values plus distinct non-Draft Status names still stored on requests. Only list filters use these additional names; allowed Status changes and summary classifications still use the catalog. Selecting an explicit Dashboard Status switches its work-state selection to all work and retains Team/keyword. See [requirements](specs/2026-10-22-search-filter-requirements-notes.md) and [local verification](verification/2026-10-22-search-filters.md). No deployment or configured company database was exercised.

> **Requester as a status email recipient, 21 October 2026:** the Edit status modal in Status Management adds *Send to the Requester*: *Do not send* (the default for existing and new statuses), *To* or *CC*, stored as an optional `requester: 'to' | 'cc'` in the status's `emailPolicy`. When a request enters that status (submission, Status change or bulk replacement, whoever acts), the address of the account that created it (`requester_user_id` → `app_users.email`) at that moment joins the typed To or CC. An enabled status needs a typed To unless the Requester is in To. Imported Requests have no account, so their Requester is not emailed. If the Requester has no usable address the typed recipients still get the email, CC moves to To when To is empty, and with nobody left no job is queued; each case logs a warning and the Status change commits. The catalog shows "Requester in To/CC" and the Replace and delete preview names "each request's Requester". Before, a status could only hold typed or picked addresses. See [email notifications](email-notifications.md#the-requests-requester-as-a-recipient) and the [verification record](verification/2026-10-21-requester-status-email.md). Checks ran on a throwaway local database; no mail was sent.

> **Excel export speed and limits, 21 October 2026:** every export reads one consistent database snapshot, pages the requests before gathering their canonical values, and builds the workbook in a worker with ExcelJS's streaming writer: dark blue headers, alternating white and pale blue rows, and multi-line text that keeps its CRLF. A Direct Export (at most `EXPORT_SYNC_THRESHOLD` requests, now 10,000 by default instead of 2,000) runs only while fewer than `EXPORT_SYNC_MAX_CONCURRENT` (default 2) are in progress in the backend process; otherwise the export becomes an Export Job, which the Export page already follows. Each worker has an Export Memory Limit on its JavaScript heap, `EXPORT_WORKER_MAX_MEMORY_MB` (default 1024): an export that needs more fails on its own with a message saying so (HTTP 413, or a failed Export Job that is not retried). On 5,570 synthetic requests an export took about 2 s instead of 6.2 s and added about 250 MB instead of 730 MB; see [export limits verification](verification/2026-10-21-export-limits.md), [application integration](verification/2026-10-21-export-app-integration.md) and [formatting](verification/2026-10-21-export-formatting.md) (PR #95).

> **Every column in the Excel export, 21 October 2026:** the export lists every field of every form version, including fields an administrator adds without the `exportable` flag, and always shows Modified By once, right after Updated At, wherever a form version places it. A cell without a value shows `NA`; `NA` is never stored. Cells are read from each request's current data through its own captured form version instead of `canonical_submission_values`, which Status changes and PSF saves never refreshed, so Modified By is no longer stale. Every role gets the same cells: PSF Created Information is no longer blanked for a Requester before PSF Visibility Release ([ADR 0019](adr/0019-excel-export-shows-every-field-to-every-role.md)); the request page, request list and search still hide it. The Export to Excel page's Export Preview shows the file's first 10 rows (100 a page since; see Export Preview pages) with its own columns and the number of requests it holds, from `GET /api/requests/export-preview`, with Request No pinned; it no longer uses the Dashboard query or its creator scope. See the [verification record](verification/2026-10-21-export-all-columns.md); checks ran against a throwaway local database.

> **Export Preview pages, 21 October 2026:** the Export Preview table could not be scrolled sideways, so every column past the window was cut off: a rule from when the preview had five columns hid the table's overflow. The table now scrolls both ways inside the window, with the header row and Request No pinned. The preview shows the file 100 rows a page, as the request list does, with "1–100 of N requests" and Previous / Next; a page stays in place, back at its top, while the next one loads, and changing a filter returns to the first page. `GET /api/requests/export-preview` takes `offset` and `limit` (whole numbers; `limit` at most 100) and returns them with the page. See the [verification record](verification/2026-10-21-export-preview-pages.md); checks ran in Chromium against a throwaway local database.

> **Export dates in Bangkok time, 21 October 2026:** the Excel file and the Export Preview showed Request Date and Updated At as UTC ISO timestamps (`2025-09-01T03:42:29.000Z`). Both now read `2025-09-01 10:42:29`: the same moment in Asia/Bangkok, as the request list's Updated column and Audit History show it, year first so the columns still sort as text. They stay text cells: [ADR 0013](adr/0013-excel-export-schema-alignment.md) asked for Excel Date cells without the time, which was never built. See the [verification record](verification/2026-10-21-export-bangkok-time.md).

> **Export transfer, 21 October 2026:** export rows no longer carry their captured form snapshots. Each row carries a content key per snapshot, the MD5 of its JSONB text, which `psf_requests` stores as the generated columns `schema_snapshot_key` and `psf_created_schema_snapshot_key` (startup adds them to an existing database), and each distinct snapshot is read once per export from one request that captured it, inside the export's snapshot. The Export Preview finds its columns by grouping those keys and reads no snapshot again for its rows. On a simulated 25 ms, 24 Mbit/s link a 5,570-request export fell from 33.4–34.1 s and 92.2 MB to 8.7–8.8 s and 18.3 MB, and a 10-row preview from about 1 s to 0.4–0.5 s (issue #102; a 100-row page takes 0.53–0.61 s). See the [verification record](verification/2026-10-21-export-transfer.md); Fook's Tailscale path was not measured.

> **NAS folder names and export files, 21 October 2026:** a request's Attachment folder is named as the SharePoint export named the Imported Requests' folders: Product_Description is cut to its first 100 characters and stripped of trailing dots and spaces before `_[ID]` ([ADR 0018](adr/0018-nas-folder-names-follow-the-sharepoint-export.md)). The export's `ItemInfo.txt` and `_export_complete.txt` are system files: never listed as Attachments and refused on upload. No folder or file on the NAS is renamed. See [Request Attachments](request-attachments.md) (issue #97). Checks ran on in-memory PostgreSQL and a temporary directory; the folder check has not been re-run against the NAS share.

> **Request list columns and Modified By, 21 October 2026 (column names superseded by the Request To and Target 12NC Desc entry above):** the Requests and Dashboard tables hold one value per column: Product Description (the `title` field), Request No., Product Type, Status, PSF Setup File Name, Job File Name, Due Date and Requester. My Drafts has Product Description, Request No., Product Type, Updated and Delete. Before, the first column stacked the title, request number and Product Type (on the Dashboard the probe card name followed the number), and PSF file names were not shown. A missing value shows "—"; Product Description no longer falls back to "<Product Type> PSF request". Request No. is the row's link; the whole row still opens the request. The list API adds `jobFileName` beside `psfSetupFileName`, both from PSF Created Information whether or not the field is searchable, and returns both as `null` to a Requester until PSF Visibility Release (`psfSetupFileName` used to reach a Requester before release). Keyword search matches a PSF Setup File Name for a Requester only after release. The search index gains `job_file_name`, and a one-time startup step (`index-psf-file-names-v1`) indexes both names for existing submitted requests. Modified By is now recorded on every individual save (Draft creation, Draft and requester edits, Draft schema upgrade, submission, PSF Created Information saves and Status changes) whether or not the request's form has a Modified By field; before, only forms with that field recorded it, so the seeded form and forms loaded before 19 October left it blank. A Modified By sent with form data is ignored. A one-time startup step (`modified-by-from-audit-history-v1`) fills a blank Modified By from the actor of the request's latest such Audit History entry and keeps any recorded value; bulk Status replacement still records none (ADR 0016), and a request with no such entry stays blank until its next save. See the [verification record](verification/2026-10-21-request-list-columns.md). Checks ran in Chromium against a throwaway local database.

> **Centred request column, 21 October 2026:** New Request, Request Detail (Drafts and submitted requests) and Admin Draft detail sit in one column at most 1335px wide (`--request-page-max-width`, one and a half times a card around the 840px `--form-rows-max-width`), centred in the content area, and their form rows, including PSF Created Information, fill the card instead of stopping at 840px; the label column stays 260px. The Admin Form Management preview and Request Snapshots keep the 840px cap. New Request was previously capped at 1120px and the detail pages were not capped. A Draft's Attachments card, also in Draft Management, now sits 16px below Requester Information, as on New Request. See the [verification record](verification/2026-10-21-single-column-form.md#centred-request-column). Checks ran in Chromium against a throwaway local database.

> **Pinned action bar, 21 October 2026:** on every editable form (New Request, Draft and submitted request editing, PSF Created Information editing and the Admin Form Management preview) the action buttons sit in a bar pinned to the bottom of the viewport, or of the preview's scroll region, while the form scrolls; at the end of the form it sits below the last row. It spans the form card with Save as the right-most button at the card's right edge. Saving, saved and save errors of the Requester form and of PSF Created Information appear in the bar, left of the buttons (saving and saved as a status, errors as an alert), instead of at the top of the card or page; the preview's "All required fields are complete." appears there too. Status changes, load errors, Draft schema upgrades and other page-level notices stay at the top. See the [verification record](verification/2026-10-21-single-column-form.md#pinned-action-bar) (issue #90). Checks ran in Chromium against a throwaway local database.

> **Single-column form rows, 21 October 2026:** every rendering of a Form Schema (New Request, Draft and submitted request editing, PSF Created Information viewing and editing, the Admin Form Management preview, read-only Request Detail, Admin Draft detail and Request Snapshots) shows one row per field: the label in a 260px column on the left, the control or stored value on the right, rows separated by a divider and capped at 840px wide. Below 600px wide the label sits above its control. The two-column grid and its full-width text areas, radios, Title and Product Type are gone; field order, sections, labels, required flags and visibility are unchanged. See the [verification record](verification/2026-10-21-single-column-form.md) (issue #88). Checks ran in Chromium against a throwaway local database.

> **Attachment Policy, 21 October 2026:** `GET /api/attachment-policy` gives any signed-in role `{ maxBytes, blockedExtensions }` from the storage configuration uploads are checked against; both Attachment pickers show the per-file limit and blocked file types from it, and New Request refuses an oversized file at selection as it does a blocked type, reading the type as the server does. A file chosen there while the policy is still loading is staged and checked when the policy arrives. The frontend no longer keeps its own blocked-extension list; without the policy the pickers work with no hint or client-side check. See [Request Attachments](request-attachments.md#access-and-api) (issue #89). Checks ran in Chromium against a throwaway local database and a temporary attachment directory, alongside controller, application-module and frontend tests; the check of files chosen before the policy loads and the server-style type reading are covered by frontend tests only.

> **Input border contrast, 21 October 2026:** in the light theme the `--input-border` token is `#858b88` (previously `#a7adaa`), so text input, select and text area borders measure 3.47:1 against the card and 3.19:1 against the page background (WCAG 2.1 SC 1.4.11). Secondary buttons, radio options, dialog borders and the other elements that share the token darken with it; the dark theme is unchanged (4.38:1 against the card). See the [verification record](verification/2026-10-21-input-border-contrast.md) (issue #87). Checks ran in Chromium against a throwaway local database.

> **Attachments and request IDs, 20 October 2026 (the `Product_Description` default superseded by the Request To and Target 12NC Desc entry above):** every request has a sequential integer ID continuing the Imported Requests' numbering; a submitted Draft is renumbered `PSF-` and its six-digit ID; New Request starts Product_Description as `Product_Description`. Attachments live in a `[Product_Description]_[ID]` folder under `ATTACHMENT_STORAGE_PATH` (the NAS), with metadata in `psf_request_attachments` reconciled on every read, an Attachments tab on submitted Request Detail and a section below Requester Information on Drafts and New Request. Audit History shows Product_Description instead of Draft numbers and records `ATTACHMENT_UPLOADED`/`ATTACHMENT_DELETED`. See [Request Attachments and request IDs](request-attachments.md) (issue #78). Checks ran on disposable databases and a temporary directory, not the configured database or a NAS share.

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

Setup File Owner Dashboard defaults to a Request To-derived Team filter (Request To
is stored as `product_type`): `Create new PSF*` (and the seed form's New Product) is
GNTC; `Revise from old PSF*`, `Revise Old PSF*` and `Product Transfer*` (and the seed
form's Transfer Product/Existing Product) are MFG. The options read
`GNTC — Create new PSF`, `MFG — Revise from old PSF / Product Transfer` and
`รอระบุ Request To`; All shared work and unclassified work remain selectable.
Missing/custom Request To values display “รอระบุ Request To” (“รอระบุ Product Type”
before 24 October 2026). Team filtering does not restrict cross-team PSF editing.
Rows, totals and summaries use the same query; changes follow the latest saved
Request To without modifying existing PSF information. Requester/Admin
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
column at most 1335px wide; elsewhere they are at most 840px wide. A Request
Snapshot lays out its own read-only rows the same way in that 1335px column (see
[Autofill, audit and export](#autofill-audit-and-export)).
Labels are bold 14px in both editable and read-only mode, and read-only values sit
on the controls' line, so switching a request between viewing and editing keeps
ordinary rows at the same height; radio groups and text areas may grow while
editing. A radio group is a `role="radiogroup"` element named by its row's label
cell and keeps its required, invalid and described-by state. The required marker,
field error and Auto-fill status stay in the field's row.
Detail keeps 16px section headings. Request
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
Unreleased requester PSF values are masked in detail and PSF update events
are omitted from their per-request history; Excel exports show them to every
role ([ADR 0019](adr/0019-excel-export-shows-every-field-to-every-role.md)).
Sources: [visibility and release](../backend/src/requests/requests.service.ts),
[history filtering](../backend/src/audit/audit_log.service.ts),
[export table](../backend/src/export/export-table.ts).

## Autofill, audit and export

Autofill operates on `psf-request` rules. For an active valid rule, it chooses
one latest currently completed matching request using exact stored trigger value,
completion timestamp and an ID tie-break. It returns suggestions; it does not
combine fields from multiple historical requests. Global audit now resolves the authenticated stored actor for every role and filters creator-private Draft events before returning rows. Requesters' unreleased PSF update events are also omitted; requestless Workflow catalog updates are left out for every role (22 October 2026, issue #106). Global audit is paged with matching totals, live Search and Action/Bangkok-day filters. Requester/PSF edit audit metadata includes per-field key,
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
The Request Snapshot page reads only that entry (`GET
/api/requests/:requestId/history/:entryId`), never the current request. It shows
the recorded time in ICT (UTC+7), the action, actor and role, the Form Version
numbers and "Read only"; a summary of the entry's edits with a link to each,
which scrolls to and focuses the field; the Work Status of that time; and both
forms in separate panels with every field of the stored Form Schema, identity
fields included, label beside full value, blanks as "Not provided". The entry's
`fieldChanges` belong to the form its action edited (PSF Created Information for
a PSF update, Requester Information otherwise), so a PSF edit never marks a
requester field with the same key. A changed field is marked with an orange
background and outline, an icon and "Changed in this update", and shows its
earlier value under "Before this update"; the colours are tokens in
[the page's stylesheet](../frontend/src/components/RequestSnapshotPage.css) for
light and dark themes. When the entry records a `fromStatus` that differs from the
stored Status, the Work Status block is marked the same way and shows both
complete names; no earlier Status is shown otherwise. Changes to fields the
Form Schema of that time no longer has (a Form Version upgrade) are listed in
a separate "Fields removed in this update" panel and counted as removed, not
edited. A section that is a form's only one and has the form's name gets no
heading of its own. Fields the server fills in without recording them in
`fieldChanges` (Modified By on a Status change or a PSF Created Information
save) show their value of that time unmarked. When PSF Created Information
is not visible to the reader, its panel shows the usual notice and neither its
values, its Form Version nor its edits appear.
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
A select or radio target is filled only with a value among the options of the form being filled; any other value leaves it blank.
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
covering every submitted request, never a Draft. Every role gets the same cells,
including PSF Created Information without a PSF Visibility Release (ADR 0019).
The Export page's Export Preview (`GET /api/requests/export-preview`) shows the
file's columns, its rows 100 a page (`offset`/`limit`, Previous/Next as on the
request list) and its request count for the same filters, read from one
snapshot. Filters include status/from/to. Counts strictly greater than
`EXPORT_SYNC_THRESHOLD` queue an Export Job; the default is 10000, so exactly 10000 remains
a Direct Export. A Direct Export also needs one of `EXPORT_SYNC_MAX_CONCURRENT`
slots (default 2, per backend process); when all are busy the export is queued instead. Jobs are
owner-scoped and their content is stored as BYTEA. Background jobs poll every
`EXPORT_JOB_POLL_INTERVAL_MS` (default 1 s), run one at a time and renew claims; the
Export page polls a job every 2 s. Both paths read one `REPEATABLE READ READ ONLY`
snapshot in pages of 500 and hand each page to a worker that builds the workbook
with ExcelJS's streaming writer once the snapshot is committed. The worker's
heap is capped by `EXPORT_WORKER_MAX_MEMORY_MB` (default 1024; the V8 hard limit
is never below 128 MB, and the builder checks its own heap between pages and rows
because a process-wide `--max-old-space-size` replaces worker limits; that check
counts uncollected garbage, so it is approximate). An export
over the cap fails alone with HTTP 413 or a failed job carrying that message;
failed jobs are not retried.
Columns combine every field of the active and captured form versions by
canonical key (the `exportable` flag no longer selects them): five system
columns (Request No, Status, Request Date, Updated At, Modified By; both times
as `YYYY-MM-DD HH:mm:ss` text in Asia/Bangkok), requester
fields in active-form order, fields only older versions have, then PSF Created
Information. Modified By is read from the key every save records, so a form
version's own Modified By field never adds a second column. Cells come from each request's
current data through its own captured form version; a cell without a value
shows `NA`, which is never stored. The workbook and the preview share one
[export table](../backend/src/export/export-table.ts). Request pages carry a
content key per captured form snapshot (the MD5 of its JSONB text, stored
beside it in `psf_requests`), not the snapshot; each distinct snapshot is
read once per export inside its snapshot, and the preview finds its columns
by grouping the stored keys of every matching request.
Sources: [export routes/policy](../backend/src/export/export.controller.ts),
[query scope](../backend/src/requests/search-index.service.ts),
[export service and worker](../backend/src/export/excel_export.service.ts),
[workbook](../backend/src/export/export-workbook.ts),
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
| XLSX/jobs          | `GET /api/requests/export.xlsx`, `GET /api/requests/export-preview`, `GET /api/requests/export-jobs/:jobId`, `GET /api/requests/export-jobs/:jobId/download` | [ExportController](../backend/src/export/export.controller.ts)                         |

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

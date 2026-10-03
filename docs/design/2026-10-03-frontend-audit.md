# Frontend redesign audit

Audit date: 2026-10-03. Source baseline: `e079324`, with an initially clean working tree. This records the existing frontend and the contracts a visual redesign must preserve. It is not evidence of a production deployment or live business-flow verification. Source code takes precedence over older documentation and historical ADRs.

## Audit method and evidence

CodeGraph was used first to inspect the current route tree, session handling, API client, request services, schema lifecycle, status catalog, autofill, audit and export. The [current implementation guide](../current-implementation.md) supplied context; current source resolved differences, including ordinary API 401 session invalidation.

The browser audit used the requested Playwright CLI because the Browser plugin skill was unavailable. It ran in the isolated `psf-audit` session at `http://127.0.0.1:5173`, with synthetic `/api` read fixtures and every non-GET request blocked. Twelve screens were captured at desktop 1440 × 900 and mobile 390 × 844: dashboard, all requests, own drafts, request creation, a request detail, users, form list, a form version, status management, autofill, Excel export and global history. Login was inspected separately. The fixture detail URL was `/requests/audit-request-0`; its data was synthetic.

The 24 paired captures are `/private/tmp/psf-before-{screen}-{desktop|mobile}.png`. There was no body overflow at the inspected sizes. Status and autofill each had one mobile table clipped by a parent with hidden overflow. Authentication errors before fixture installation came from the absent backend; no console errors were observed after fixtures were installed. This was a source and fixture audit, not a live database or business E2E test. Save, publish, submission, role changes, login and export mutations were not exercised against the configured database.

## Route inventory

Navigation is role-sensitive, while backend checks remain authoritative. Every authenticated role can create requests and access its own drafts. Admin tools and global history are admin-only; Excel export is available to requesters and admins.

| Route | Current function and boundary |
| --- | --- |
| `/` | Redirects to `/dashboard`. |
| `/login` | Standalone LDAP password login; optional development identity chooser. |
| `/dashboard` | Related-work overview, counts, filters and request rows. |
| `/requests` | Shared submitted-request list with filters and pagination. |
| `/my-drafts` | Creator-owned drafts. |
| `/requests/new` | Active-schema form; saving creates a Draft. |
| `/requests/$requestId` | Requester/PSF forms, status actions and embedded request history. |
| `/history` | Admin global audit filters and action rows. |
| `/admin/users` | Admin user roles and setup-owner departments. |
| `/admin/form-config` | Version lists for both managed form families. |
| `/admin/form-config/$version` | Requester-form version editor. |
| `/admin/form-config/$formKey/$version` | Explicit form-family version editor, including PSF Created Information. |
| `/admin/workflow` | Status catalog, replacements and PSF release-trigger settings. |
| `/admin/autofill` | Canonical trigger/target rule administration. |
| `/admin/export-profile` | Backend XLSX export; no export-profile CRUD. |
| `/admin` | Placeholder. |
| `/admin/master-data` | Placeholder; no master-data administration runtime. |
| `/requests/$requestId/history` | Placeholder, distinct from the working history inside request detail. |

Sources: [route tree](../../frontend/src/routeTree.gen.ts) (lines 130–169), [navigation permissions](../../frontend/src/components/navigationState.ts) (line 31), and the [route files](../../frontend/src/routes).

## Visual findings and redesign priorities

- Give tables a deliberate mobile treatment. The status and autofill tables currently clip within their containers; preventing body overflow alone does not establish usable table access.
- Use consistent styled controls for dashboard filters. The current native controls look disconnected from the surrounding interface.
- Reduce oversized summary cards, currently about 140 px tall, to make more work visible without scrolling.
- Flatten nested cards on request detail and strengthen the separation between requester information, PSF information, actions and history.
- Keep important request actions discoverable when the detail layout changes around 1100 px; the current action region moves below the forms.
- Mobile navigation overlays the header's toggle without its own visible close control or backdrop; pressing Escape leaves it open. Design it as an operable drawer with Escape, close, focus management and a reachable opener.
- Reduce repeated REQUIRED labels and radio-pill decoration while retaining explicit labels, required semantics and accessible control groups.
- Replace the global document title `frontend` with an appropriate product title and preserve useful page context in navigation.

These findings support changes to composition, spacing, typography, controls and responsive presentation. Existing business handlers and API behavior remain the redesign boundary.

Interaction proof: entering `S32K3` into the dashboard keyword filter reduced the synthetic eight-row table to one matching request, and enabled Reset. Opening mobile navigation exposed the role-appropriate links. These checks establish rendered frontend behavior with fixtures, not backend search/authentication acceptance.

## Contracts the redesign must preserve

### Sessions, roles and access

Keep the existing API client, base URL configuration and `credentials: 'include'`. Authentication paths are `/api/login`, `/api/logout` and `/api/me`. Sessions contain `userId`; controllers resolve a fresh local profile. AppShell owns `/me` checks and ignores results predating a newer session event. Ordinary API 401 responses, except `/me`, broadcast anonymous session state. Login/logout/profile refresh events update the mounted shell. The development chooser remains gated by development mode and its explicit environment flags.

Roles are exactly `requester`, `setup_owner` and `admin`. Setup owners require `GNTC` or `MFG`; other roles require a null department. Hiding navigation links must not change backend permissions. Honor returned `canEditRequesterData`, `canSubmitDraft`, `canEditPsfCreatedData` and `psfCreatedDataVisible` flags rather than inventing narrower role rules. All roles can create Drafts. Foreign Drafts are private even to admins; shared requester information is editable by all authenticated actors, with the original requester identity retained by the server.

Evidence: [API client](../../frontend/src/services/api.ts) (315), [AppShell](../../frontend/src/components/AppShell.tsx) (168), [role validation](../../backend/src/admin/user_management.controller.ts) (81), [request access and response capabilities](../../backend/src/requests/requests.service.ts) (1069, 1430).

### Request revisions, forms and schema changes

Treat `updatedAt` as an opaque microsecond revision token. Send it unchanged as `expectedUpdatedAt`; parsing and reserializing it through `Date` loses precision. Requester saves additionally send the captured `formVersion`; submit sends `formVersion`, an explicit status and the revision. Preserve dirty-form protection, pending-action locks, conflict recovery and unsaved values on 409 responses. A successful mutation supplies the next authoritative request/revision.

New requests capture separate active requester and PSF schemas. Existing records render their captured snapshots. Draft saves may omit required fields; non-Draft saves validate the captured schema. Supported field types are text, textarea, date, select and radio. Preserve configured options, required validation, field keys and canonical keys; product type/requester identity handling must continue to use existing logic.

Older Drafts require an explicit requester-schema upgrade before submission. The upgrade sends the active `formVersion`, keeps values by field key and can drop fields absent from the new schema. It does not upgrade the captured PSF schema. Keep the existing remain/upgrade choice and submit eligibility checks. Form Management retains two families, version selection, duplicate, save Draft, discard and publish. Restricted legacy section metadata must not be silently exposed or reintroduced.

Evidence: [request mutations](../../backend/src/requests/requests.service.ts) (43, 394, 516, 883), [schema lifecycle](../../backend/src/admin/form_schema.service.ts) (236), [ActiveSchemaForm](../../frontend/src/components/ActiveSchemaForm.tsx) (155).

### Status catalog, release and work views

Statuses are configurable verbatim names with immutable IDs and `draft`, `open`, `completed` or `cancelled` kinds. Percentages in names are display text. There is no directed transition matrix: accessible shared work offers every other non-Draft catalog status. Drafts submit through the dedicated action, selecting a non-Draft status; an ordinary status change cannot submit a Draft or return shared work to Draft.

PSF information is editable by setup owners/admins on accessible work. Requesters see it only after the persistent `psfReleasedAt` is set. Entry into the configured trigger validates PSF required fields and releases once; later status changes or trigger changes do not revoke release. The first setup-owner PSF edit associates an unassigned owner/department; later editors do not replace it. Preserve server visibility masking and omission of unreleased PSF edit events from requester history.

Workflow admin uses revision-checked create/rename/delete/settings operations. Draft is protected. Deleting a used status requires a replacement; deleting the release trigger requires an explicit surviving trigger or null. Preserve reload/conflict feedback. All/related/my-drafts scopes and created/department relations retain their existing constraints. Open/completed summaries use catalog kinds; overdue uses the Bangkok calendar date. My-drafts cannot combine relationship or work-state filters.

Evidence: [catalog operations](../../backend/src/admin/workflow_transition.service.ts) (244, 254), [PSF edit/release](../../backend/src/requests/requests.service.ts) (54, 656, 761), [scope validation](../../backend/src/requests/requests.service.ts) (262), [summary queries](../../backend/src/requests/search-index.service.ts) (391).

### Autofill, audit and export

Autofill remains suggestions from one latest currently completed exact-match source, using canonical keys and completion timestamp/ID ordering. Preserve manual values, edits made while lookups are pending, stale-result guards and field status feedback. Rules target `psf-request`; publishing can inactivate invalid rules or skip removed targets. Show inactive reasons and retain explicit valid rule editing to reactivate them.

Keep per-request action history and field changes within metadata; global audit remains admin-only and unpaged. Do not expose masked PSF history through a redesigned timeline.

Excel export is backend-generated XLSX for admins/requesters only. Requesters export creator-owned records; admins exclude foreign Drafts. Preserve status/from/to filtering, immediate XLSX download and 202 queued-job polling with queued/running/completed/failed states. Counts strictly greater than the configured threshold queue; the default is 2000. Jobs are owner-scoped. Export fields use canonical identities/exportable flags across active and captured schemas, with unreleased PSF values masked. The current export page preview uses the general request-list endpoint, whose scope differs from export; it is not proof of exact export contents.

Evidence: [autofill lookup](../../backend/src/requests/autofill.service.ts) (57), [rule validation](../../backend/src/admin/autofill_rule.service.ts) (385), [history filtering](../../backend/src/audit/audit_log.service.ts) (118), [export eligibility/queueing](../../backend/src/export/export.controller.ts) (60, 225), [export scope](../../backend/src/requests/search-index.service.ts) (924), [download service](../../frontend/src/services/request-export.ts) (95).

## API families

All paths below are prefixed with `/api`. Keep current payloads, response fields and error handling; list items use `requestId`, while details use `id`.

| Family | Existing endpoints |
| --- | --- |
| Session and health | `GET /me`, `POST /login`, `POST /logout`, gated `POST /dev/login`, `GET /health` |
| Schema/catalog reads | `GET /forms/:formKey/schema`, `GET /workflow/statuses` |
| Request reads/create | `GET/POST /requests`, `GET /requests/:id`, `GET /requests/:id/history`, `GET /requests/:id/status-options` |
| Request changes | `PUT /requests/:id/requester-data`, `PUT /requests/:id/psf-created-data`, `PUT /requests/:id/status`, `POST /requests/:id/submit`, `POST /requests/:id/upgrade-schema` |
| User administration | `GET /admin/users`, `PUT /admin/users/:id` |
| Form administration | `GET/PUT /admin/form-config`, `POST /admin/form-config/duplicate`, `POST /admin/form-config/publish`, `DELETE /admin/form-config/draft/:version`; PSF family selected by `formKey` |
| Workflow/rules | `GET/PUT /admin/workflow`, `GET/POST /admin/autofill`, `PUT /admin/autofill/:id`, `GET /autofill` |
| Global audit | `GET /audit-logs` |
| XLSX/jobs | `GET /requests/export.xlsx`, `GET /requests/export-jobs/:id`, `GET /requests/export-jobs/:id/download` |

## Backend startup and verification limits

Starting the configured backend is not read-only, even when tables already exist. Its initializers create/alter storage and seed missing schemas/catalog settings. A configured initial admin is upserted/promoted and its timestamp updated. Request initialization backfills existing requester ownership from user display names; search initialization backfills the corresponding projection. The export processor starts immediately and can claim, complete or fail existing jobs. LDAP/development login also upserts local profiles. `GET /requests/export.xlsx` can enqueue a job, so GET alone is not a sufficient read-only guarantee.

The visual audit therefore left the configured backend stopped and supplied isolated browser fixtures. No configured database values, permissions, schemas, catalog entries or requests were changed. Source evidence: [initial admin](../../backend/src/auth/auth.service.ts) (55, 306), [schema seed](../../backend/src/admin/form_schema.service.ts) (114, 502), [catalog seed](../../backend/src/admin/workflow_transition.service.ts) (191), [request backfill](../../backend/src/requests/requests.service.ts) (1200), [search backfill](../../backend/src/requests/search-index.service.ts) (715), [export processor](../../backend/src/export/export-job.processor.ts) (31).

Remaining limits are explicit: admin landing/master-data/per-request-history routes are placeholders; attachment reference is a form field with no attachment-upload API; export-profile CRUD is absent. Synthetic screenshots do not verify LDAP reachability, real permissions/data, database migrations, backend writes, XLSX generation or business transitions. Those require separate authorized verification against isolated or approved runtime state.

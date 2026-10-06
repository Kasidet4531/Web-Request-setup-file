# PSF Request Portal frontend redesign

> **Status clarification, 4 October 2026:** [Database Status names and interaction rules](../status-catalog-and-manual-updates.md) supersede old short-label catalogs, directed transition matrices and action-driven automatic Status changes below. Use complete configured strings for every displayed request Status. This documentation update does not change application source.

Status: approved by the user on 3 October 2026 for implementation with the accompanying concepts, implementation plan, and verified worker routing policy. Written requirements and existing business/API contracts take precedence over generated concepts.

## Purpose and scope

Redesign the existing Setup File / Request Workflow application for engineers, setup owners, requesters, and administrators who use it daily. Optimize request creation, processing, review, status recognition, ownership, and history for clarity and speed. Preserve every working business function, role rule, schema lifecycle, and backend/API contract.

The application tracks requests to create or update physical PSF Setup Files; it does not generate those files. This redesign does not add upload services, assignment services, approval gates, notifications, dashboards, master-data CRUD, or a directed workflow engine.

The source audit and browser evidence are recorded in [frontend audit](2026-10-03-frontend-audit.md). Execution ownership and acceptance checks are recorded in [implementation plan](2026-10-03-frontend-implementation-plan.md).

## Primary direction

Choose **Direction C: Modern Industrial / Engineering Operations UI**.

The central work combines technical manufacturing fields, independently editable requester and PSF information, process state, owner departments, retained schema versions, and audit history. A precise engineering application fits this domain better than a general workspace aesthetic.

Direction A would serve rapid table processing well, but would understate the technical forms and schema/release context. Direction B would serve metadata review well, but its greater spacing would reduce operational density. Direction C supplies one visual language for both structured engineering forms and queues. Borrow actual links, contextual actions, and keyboard navigation as interaction conventions without mixing visual systems.

Use light neutral surfaces, compact typography, open sections, crisp separators, and restrained cyan interaction emphasis. Avoid marketing imagery, gradients, giant cards, large brand panels, rainbow status pills, decorative metrics, and fixed process steppers.

## Information architecture and application shell

Keep all route URLs and search parameter contracts. Labels may improve without renaming URLs.

- **Work:** Dashboard; All PSF Requests; My drafts; Create Request; Export to Excel when authorized; Audit History for every authenticated role (Requester, Setup Owner and Admin), as [confirmed on 4 October 2026](../audit-history-access.md).
- **Administration:** Users & Roles; Form Management; Status Management; Auto-fill Rules. Visible only for administrators.
- **Account:** current name, role, setup-owner department when applicable, theme toggle, and Log out.

The sidebar uses a pale neutral surface, an understated product wordmark, 16px outline icons, and a pale cyan active row with a 2px cyan indicator. Preserve the official existing `frontend/src/assets/NXP.png` asset if retained; never redraw or approximate it. Concepts use a text product wordmark and a tiny accent line, not a substitute NXP logo.

Desktop sidebar width is 216px; top header height is 52px. The header contains navigation toggle, breadcrumbs, contextual New Request action, theme toggle, and account menu. Avoid duplicate New Request actions on creation. Page title and useful description sit in the content area. The shell fills available width; do not center the application in a marketing-sized container.

At widths below 900px, navigation becomes an overlay drawer rather than shrinking the content. Give the drawer an accessible name, explicit close control, Escape/backdrop dismissal, appropriate focus handling, and focus return to its opener. Route selection closes the mobile drawer. Desktop collapse remains supported. Add a visible-on-focus skip link and `aria-current="page"` on active navigation.

Use meaningful document titles such as `Dashboard · PSF Request Portal` and request-number titles on detail. Breadcrumbs derive identity from resolved data where available and never invent a form version's active state from its URL.

## Design tokens

Values below are the implementation contract. Generated concepts illustrate the composition; these values resolve raster estimation and generated control artifacts.

| Token | Light value | Use |
|---|---|---|
| Surface | `#FFFFFF` | Main content, inputs, header, dialogs |
| Canvas | `#F7F9FB` | Outer background where a separate region needs definition |
| Navigation | `#F4F6F8` | Sidebar |
| Text | `#172B3A` | Body, headings, values |
| Secondary text | `#536676` | Labels, metadata, help |
| Border | `#D9E1E7` | Separators and tables |
| Input border | `#7A8D99` | Editable control boundaries; 3.44:1 against white |
| Primary | `#007E9E` | Primary action, links, focus, active controls |
| Primary hover | `#00677F` | Hover/pressed primary |
| Selection | `#E8F5F8` | Selected navigation/rows |
| Selected text | `#00677F` | Active text on the selection background; 5.81:1 |
| Lime accent | `#A8C83A` | Tiny optional brand landmark, never semantic success |
| Success text | `#18724B` | Completion and successful saves |
| Warning text | `#916008` | Warnings and urgency |
| Error text | `#B42332` | Errors/destructive intent |

Preserve the existing theme feature. Dark tokens: canvas `#101820`, surface `#17232D`, navigation `#131E27`, text `#EAF1F5`, secondary text `#AABBC7`, border `#344550`, input border `#607584`, primary/link `#58C5DC`, primary text `#101820`, selection `#203B47`, success `#80CBA6`, warning `#EDC278`, error `#F2A3AE`. Verify contrast and disabled/read-only distinction in both themes.

Use Inter when available with system sans-serif fallbacks. Keep font loading independent of business/API availability. Use the existing monospace family/fallback only for request numbers, canonical keys, and technical codes. Do not require a new UI framework or font dependency.

| Role | Size / line height / weight |
|---|---|
| Page title | 24px / 32px / 600 |
| Section heading | 16px / 24px / 600 |
| Body, values, controls | 14px / 20px / 400; actions 500 |
| Labels and secondary metadata | 12px / 18px / 500 |
| Technical code | 12px / 18px / 400 |

Spacing scale: 4, 8, 12, 16, 24, 32px. Desktop gutters: 24px; mobile gutters: 16px. Standard control height: 36px desktop, at least 44px for touch use. Form row gap: 16px; label gap: 6px. Control radius: 4px; dialogs: 6px. Flat surfaces use no shadow; dialogs and temporary menus may use one subtle shadow. Tables target 48–56px rows when identity uses multiple lines. Avoid all-caps labels except narrowly useful technical headings.

Focus uses a visible 2px dark cyan outline with 2px offset. Primary white button text is 4.69:1; selected text uses the darker selected-text token rather than primary cyan (which is only 4.21:1 on the selection fill). No interaction depends on color alone. Validate normal text at WCAG AA contrast and control/focus boundaries at 3:1 where applicable. Support keyboard operation, 200% zoom, reduced motion, and long/custom labels. Limit motion to short state clarification, never decorative looping.

## Reusable component language

Keep React, TypeScript, TanStack Router, Vite, Lucide, native inputs, and native dialogs. Reuse existing business components and state helpers. No broad component library migration is needed.

- `PageHeader({ title, description?, actions? })`: consistent page heading and wrapping action placement.
- `AsyncNotice({ kind, title, children?, action? })`: loading, empty, error, success, and information with named icon/text, proper live semantics, and optional real retry/action.
- `StatusLabel({ status, kind?, compact? })`: verbatim status text plus icon. Use catalog `kind` for semantic treatment. Unknown/missing kinds use a neutral icon and text; never parse percentages or status names into process rules.
- Native dialog presentation and shared confirmation behavior: meaningful title, primary/cancel ordering, focus trap/restoration, Escape handling, mutation lock, explicit consequences. Keep existing Apply/Cancel boundaries.
- One CSS button vocabulary: primary, secondary, ghost, destructive, and icon buttons. Retain underlying button/link semantics and existing callbacks.
- Shared labeled field, help/error, choice group, read-only property, table container, filter toolbar, result footer, and dirty action-bar styles. Keep schema-driven renderer as the field behavior seam.

Use outline Lucide icons at 16px, stroke width 1.75–2. Status kinds use FileText for draft, CircleDot for open, CircleCheck for completed, and CircleX for cancelled. API value `cancelled` remains unchanged; administrator-facing type label remains `Cancel`. Business status names are always shown exactly. Pending/loading uses text and a distinct indicator; disabled controls include the actual blocking reason when useful. Normal priority stays plain text; urgency may add an icon and restrained warm emphasis. Product type and department use secondary text, not pills.

## Primary screens

### Dashboard and request browser

Dashboard answers which related requests are open, overdue, or completed. Replace oversized metric cards with one compact selectable count strip using the server summary. Keep related-work selection for setup owners, existing work-state semantics, keyword/status filters, reset behavior, server pagination, and exact query parameters.

All PSF Requests and My drafts share the same table/filter vocabulary while retaining scope differences. Draft status is not introduced into the submitted-status filter. Keep product type filtering. Combine request number, title, and product type into a legible identity cell without losing any information. Retain the full current list fields, including requester, owner/department, priority, dates, and update time where the current screen provides them. Compact dashboard keeps its smaller column set.

Provide an actual request detail link, useful hover/selected/focus states, header scopes, and a result range when paginated. Keep row click as an optional convenience without making the row the only navigation mechanism. Do not add unsupported sort, bulk action, saved-view, or assignment affordances.

On mobile, the table remains a real table in a locally scrollable region. Keep identity easy to locate, show an explicit horizontal-scroll cue, and make every column/action reachable. Never use `overflow: hidden` to conceal table actions. Preserve meaningful empty states for no requests and no filter matches.

### Request detail

The first viewport shows request title/number, current status, requester, owner/department, priority, due date, and product type. Do not imply the current user owns a request solely because it is editable.

Below identity, use open Requester Information and PSF Created Information sections with their own editability, saved/unsaved feedback, and save actions. Render the captured schemas and retain every configured section, field, type, order, value, help message, and validation rule. Read-only fields should be readable properties rather than faded, inaccessible controls when possible.

Desktop has a main form column and a compact action/history rail. On mobile, place Action center immediately after metadata and before lengthy forms. Preserve server allowed statuses, explicit submission status, busy locks, dirty blocking reasons, and schema upgrade gates. No fixed stage/percentage stepper is allowed because the backend supports a configurable catalog rather than directed transitions.

History shows who acted, what happened, when, and available relevant metadata. PSF history visibility still follows the server's release policy. The separate existing history route may use the same authorized history API and shared presentation; it must not expose masked events.

### Create PSF Request

State clearly: `Save a draft first. Review and submit from request detail.` Preserve draft-first creation and navigation after saving. The first save is not submission. Required fields may remain incomplete while saving a draft.

Keep schema sections and order. Use a named native radio fieldset, compact two-column desktop grid, full-width multiline fields, and one-column mobile layout. Use required asterisks with one explanation rather than repeated blue REQUIRED markers. Do not add field defaults that the current application does not supply. Product and Wafer FAB remain text inputs in the default schema; no fabricated master-data selectors. Requester identity remains server-controlled; explain that fact without silently changing schema semantics.

A restrained help rail explains private drafts, later submission, and autofill's preservation of manual values. On mobile this help becomes an optional details section after essential form content. Save action displays unsaved/saving/saved state without hiding validation or retry. Existing schema-upgrade and autofill-race safeguards remain intact.

### Form Management and version editor

Maintain the two families and their independent lifecycle. Family selection, active/draft/inactive version identity, view/edit/duplicate/discard actions, and saved-version descriptions remain clear. Only drafts are editable. Do not introduce a generic Create draft endpoint; duplication remains the existing creation operation. Preserve the one-draft-per-family rule and family mismatch rejection.

The version editor uses a compact section/field structure, stable identity metadata, preview, and existing advanced JSON fallback. Separate editable label/type/flags from read-only stable field/canonical keys. Keep local Apply/Cancel, saved-draft publication requirements, conflict feedback, dirty navigation guards, and exact snapshot behavior. Publish/discard confirmations adopt the shared dialog language, preserving consequences and cancel behavior.

### Remaining working screens

- **Users & Roles:** dense identity table, readable roles/departments, current access editor, identities/email read-only, consistent mobile rows and dialog. Preserve current-user session refresh and partial-success errors.
- **Status Management:** compact catalog table, styled create/rename controls, protected Draft, request counts, kind labels, and explicit used-status/visibility-trigger replacement choices. No transition matrix or reordered process promises.
- **Auto-fill Rules:** clear trigger, target fields, active/inactive state/reason, source, and edit actions. Preserve canonical keys, removed-target selection, valid-save reactivation, and absence of delete-rule API.
- **Audit History:** aligned Apply/Clear filters, explicit UTC filter labels, local display timezone label, readable action/detail rows, and request links. Do not fabricate server pagination. Display existing metadata carefully without adding hidden PSF values.
- **Export to Excel:** existing filters, preview/total, synchronous download and queued/running/completed/failed job states. Keep polling, ownership, authenticated download, cancellation, and URL cleanup. The current list-preview scope can be broader than download scope; label it as a request preview, never promise that its count is the exact number of exported records. No export-profile CRUD or API change.
- **Login:** compact professional authentication surface, clear company sign-in, password toggle, autocomplete, error feedback, and safe return URL. Local test identities remain development-only. Retain existing login/logout behavior.

### Existing unfinished routes

`/admin` becomes a simple directory linking to working authorized tools. `/admin/master-data` shows a clear unavailable/not-configured state and a route back to existing tools; no false working editor. `/requests/$requestId/history` can reuse the existing history API/presentation. These are frontend treatments of existing routes, not new backend capabilities.

## State and contract requirements

1. Capability flags (`canEditRequesterData`, `canSubmitDraft`, `canEditPsfCreatedData`, `psfCreatedDataVisible`) remain authoritative. Draft privacy and shared request access are unchanged.
2. Opaque `expectedUpdatedAt` microsecond tokens and `formVersion` pass through unchanged. Never round-trip revisions through `Date` formatting. Conflicts preserve local edits and provide existing recovery choices.
3. Captured requester and PSF schemas remain independent. Only explicit supported upgrades change draft requester schema. Existing submitted requests do not adopt latest form definitions.
4. Sticky `psfReleasedAt` controls requester PSF visibility, not a hardcoded status name or current status. Owner association is not an editable assignment feature.
5. Autofill continues to suggest from one matching completed request, preserve nonempty/manual/during-lookup edits, and show provenance already available. No new lookup sources.
6. Cookie credentials, authentication session events, stale session-response protection, non-`/me` 401 behavior, and safe internal redirects remain unchanged.
7. No backend, API payload, domain helper, export service, generated route tree, database configuration, or business schema changes solely for styling convenience.

Loading preserves orientation and announces status. Empty states explain the scope/filter and offer only valid actions. Errors provide real retry/recovery where supported. Success and unsaved state appear near the affected form; do not force unrelated actions or global toasts for every change. Never discard edits on visual tab/navigation changes without existing dirty safeguards.

## Concepts and precedence

Concept files are indexed in [concept set](concepts/README.md): queue, detail, create, form management, and mobile detail. Samples are invented audit data, not actual NXP records or counts. The images are visual references, never runtime UI assets.

Generated image artifacts must not override source contracts. Specifically: Product, Wafer FAB, and Probe & Coordinate Quadrant are text controls in the default schemas; Reference PSF Name, Request Note, and all default PSF fields are optional; new forms have no new preselected defaults; editable status and field visibility derive from API flags. Stable field/canonical identity and family boundaries are exact. Any remaining generated chevron/asterisk, unsupported Duplicate state, icon variance, brand/header placement, or shallow button shading is corrected to this written specification during implementation.

For shared shell geometry, use the queue concept plus the exact token dimensions. Keep New Request in the real header where allowed even when a raster omits it. Use one shell across all screens. Preserve all real working actions that a compact concept cannot enumerate; document these as contract-preserving extensions in the fidelity ledger.

## Implementation and validation gates

1. Approve the combined concepts, this specification, and the ownership plan before application code changes.
2. Implement shared tokens, navigation/shell, and primitives first. One owner controls shared styling and UI contracts.
3. Implement screens incrementally. After each major screen, inspect real desktop and mobile renders alongside its concept using `view_image`; correct layout, density, text, typography, color, form geometry, and responsive differences.
4. Re-run existing frontend tests, lint, and production build. Add meaningful coverage for new accessibility interactions/guards; do not write tests that merely repeat color values.
5. Browser QA covers 1440×900, concept native sizes (currently desktop 1536×1024 where applicable), 390×844, and an intermediate tablet/200% zoom case. Verify dark theme, keyboard/focus, long/custom fields/statuses, empty/error/loading states, role/release differences, draft upgrade, conflicts, autofill races, and exports.
6. Maintain a fidelity ledger with at least five concrete comparison points, copy differences, intentional contract-preserving deviations, and screenshot paths per major screen. Passing a build does not establish visual fidelity.
7. Do not start the configured backend merely for visual review: its initializers backfill business rows, seed/configure data, promote an initial admin, and process export jobs. Use isolated browser fixtures for visual QA; use a genuinely isolated backend/database for mutation acceptance. Do not claim live LDAP/database end-to-end proof from fixture-based checks.

Completion requires all existing functional surfaces to use the same system, all working actions to remain reachable, no clipped mobile data/actions, no inert invented controls, passing available checks, and documented limits of environment verification.

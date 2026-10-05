# PSF Request Portal — NXP-inspired redesign

## 1. Visual theme and atmosphere

Original approved brief, 4 October 2026: design in Stitch only. On 5 October 2026 the product owner approved the complete Desktop suite and authorized application implementation, including all Admin pages, replacing the earlier one-page-at-a-time preference and design-only boundary. Serve Requesters and Setup Owners, English interface, Desktop only, Light and Dark modes together. The product owner removed Mobile design from scope on 4 October 2026; do not generate, refine or verify Mobile designs in this iteration or following pages unless explicitly requested. Reduce information displayed simultaneously and add purposeful color. The user requested restarting Dashboard on 4 October 2026 with neutral surfaces, reduced blue coverage, orange/green accents and single-line Status ellipsis. Dashboard v5 is approved by the user. Requests v2 is approved by the user. Current scope is the full Desktop suite, with the preferred tabbed Detail v1 layout, breadcrumb, explicit Back and collapsible navigation. All Admin pages are included by the product owner. The intervening original-layout/color-only Detail exploration is historical. Both modes share the same structure and role permissions.

Use a welcoming, precise engineering workspace: neutral surfaces, clear hierarchy, restrained orange/green accents and very limited blue, generous spacing around primary actions, and readable operational data. No decorative charts, large welcome banner, unrelated activity feed, or additional KPI tiles. Display work first.

Source baseline: React/TanStack Router, custom CSS, Inter and JetBrains Mono; current primary #245BBD, sidebar #14263E, background #EEF2F7. The imported Dashboard image is the recorded top-panel layout in output/playwright/top-panels/after/dashboard-desktop.png. Its DEMO requests and Development identities are documented test data, not production business records. This document specifies the proposed redesign, not an extraction claiming these proposed tokens already exist in the application.

## 2. Color palette and roles

These are NXP-inspired interface colors, not a claim of strict official CI compliance.

| Token | Color | Role |
| --- | --- | --- |
| Paper | #FFFFFF | Queue, tiles and inputs |
| Neutral canvas | #F6F5F2 | Warm neutral page background |
| Neutral navigation | #FAFAF8 | Desktop sidebar |
| Quiet outline | #E2E3DE | Neutral dividers |
| Ink | #24282C | Neutral main text |
| Secondary ink | #62686C | Supporting text |
| NXP-inspired blue | #00A9E0 | Tiny brand accent only |
| Accessible action blue | #006F95 | Main New Request action and small navigation indicator |
| Neutral selection | #EEEFEA | Active navigation background, not a blue wash |
| NXP-inspired orange | #FCA600 | Overdue summary icon/edge, restrained warm brand accent |
| Orange ink | #8A4700 | Readable warning text |
| Orange wash | #FFF2DF | Small warning icon or chip only |
| NXP-inspired green | #69CA00 | Completed summary icon/edge and completion accent |
| Green ink | #28651D | Readable success text |
| Green wash | #EFF5E9 | Small completed chip only |
| Open status surface | #F0F1ED | Neutral status badge, never cyan/blue |
| Error ink | #B42332 | Actual errors and overdue dates |
| Error wash | #FFF0F1 | Small error surfaces |

Use darker ink on bright accents; do not put small white text on bright orange, lime green, or cyan. Every status has a text label and icon. Selection uses an outline/check treatment as well as color. Distinguish Overdue from merely Urgent priority.

## 3. Typography rules

Inter for English UI. Use JetBrains Mono sparingly for request numbers, with tabular numerals for counts/dates.

| Style | Size / line height | Weight |
| --- | --- | --- |
| Page title | 28 / 36 px | 600 |
| Section heading | 18 / 26 px | 600 |
| Summary count | 28 / 36 px | 600 |
| Body and controls | 14 / 22 px | 400–500 |
| Request title | 14 / 22 px | 600 |
| Supporting label | 12 / 18 px | 400–500 |

Use ordinary title/sentence case. Limit competing headings. Preserve complete database Status strings in values and accessible names. In queue rows, show exactly one line with a genuine overflow ellipsis (…) when necessary. Desktop hover AND keyboard focus reveal the full value; click opens the same full-value popover. No friendly alias or shortened stored value. Escape, close and outside click dismiss the popover. Status display is not a Status-edit control. Avoid tiny uppercase labels repeated in every row.

## 4. Component stylings

Buttons: 40–44 px desktop height, 44 px minimum touch area; solid accessible blue for the primary New Request action, simple outlined secondary controls, 8 px radius and visible focus state.

Navigation: 220 px expanded or a usable 72 px collapsed icon rail, light background, compact PSF Request Portal identity, icon plus visible English label; active Dashboard uses a neutral background and a small blue leading indicator. Requester links: Dashboard, Requests, My Drafts, Audit History, Export. Setup Owner omits Export and adds the existing department scope control inside Dashboard. Audit History is available to every authenticated role (Requester, Setup Owner and Admin), confirmed by the product owner on 4 October 2026. Show the Audit History link for both primary roles in desktop navigation, in Light and Dark modes; route remains /history. Request-specific history stays in request detail. Admin tools remain restricted. See [Audit History access](../docs/audit-history-access.md) for the 5 October authenticated all-role source implementation and separate Draft/PSF data-visibility rules; local integrated QA has passed ([verification](../docs/superpowers/plans/2026-10-05-stitch-desktop-implementation.md)). Do not invent a role-switching control.

Summary controls: exactly Open work, Overdue, Completed, side by side above the work queue, on neutral surfaces, with small restrained open/orange/green icons or edges. Never show Filter, Filtered or Filtering inside a summary card. Indicate the active group with a visible checkmark and category-colored outline, plus aria-pressed=true. Only one group is selected at a time. Move the check and outline when the group changes; Clear filters restores Open work. The Work queue group label follows the current selection. Do not fill the tiles with blue washes. These are real queue filter controls in the proposed interaction, not decorative statistics. An empty completed count is valid.

Queue: one dominant full-width surface with a short heading, keyword search, Status selector and Clear filters. Search and Status require explicit accessible labels. No secondary rail consuming table width. A row contains only request title/number, current status, due date and owner/department; urgent/high priority can be a small readable indicator near the date. Product type and extra metadata move into request detail. Show around five representative rows in the design, with the existing 25-item pagination contract retained and scroll available. Long titles need bounded wrapping. Status labels use the approved single-line ellipsis with full-value hover/focus/click disclosure; never substitute old short stage labels.

Use a restrained 8–12 px panel radius, fine borders, little or no shadow, 16–24 px panel padding. Do not place every value in a separate card.

## 5. Layout principles

Desktop design canvas 1280 px wide, with 24–32 px main padding and 24 px major-section gaps on an 8 px rhythm. Keep the three summaries above the table, preserving the current top-panel structure. Keep greeting/description to one short line; make the table the dominant area.

Mobile designs are outside the approved scope from Dashboard v5 onward. Older Mobile assets remain historical references and must not be regenerated or used as required deliverables.

## 6. Stitch generation notes and constraints

Current scope, authorized 5 October 2026: implement the approved complete primary and Admin Desktop suite, plus shared navigation updates to approved Dashboard/Requests and the preferred Detail v1 design. Use the existing neutral theme and single-line Status disclosure. Desktop Light/Dark only; Requester, Setup Owner, Admin and public sign-in as permitted. The original design-only brief is historical; application source implementation is now authorized and complete in this checkout. Local unit, HTTP, SQL and browser checks passed; see [implementation verification](../docs/superpowers/plans/2026-10-05-stitch-desktop-implementation.md). The configured PostgreSQL and LDAP services have not been exercised or mutated by this implementation work, and no deployment is established here.

Requester and Setup Owner share the same layout. Owner-specific scope values must remain exactly Related work, Created by me and PSF department work; do not replace this with Assigned to me because assignment is not the current query contract. Requester sees related work under their existing permissions. Treat owner scope as a documented responsive state of this Dashboard, not another route.

Use the exact configured database Status strings listed in [the current Status contract](../docs/status-catalog-and-manual-updates.md). There is no workflow transition matrix, automatic action-driven Status change or mandatory linear sequence. Do not add Next, Approve, Reject or Mark Complete stage buttons; opening requests, saving either form, applying autofill and filtering must leave Status unchanged. Status catalog management is distinct from a transition editor. No percent-complete chart, stepper, invented approvals, assignee write action, file generation, notifications count, or unsupported bulk action. No per-row export action for Owner. New Request opens the existing private-draft creation flow; do not imply it submits immediately. Use actual catalog status names and database-informed aggregate examples. Use fictional people, request identifiers and PSF record values in newly designed views. Percent prefixes belong to status labels and are not progress calculations.

Prompt direction: "Rework the imported Dashboard into a light NXP-inspired work queue with three compact, colored summary filter tiles above a calm full-width request list. Show the existing work controls clearly and place secondary information in the detail view. Keep all text in English and preserve Requester/Setup Owner permissions."

## 7. Database-informed Dashboard update — 4 October 2026

PostgreSQL was inspected through pg.Pool using a read-only transaction and read-only session defaults. Do not put connection details or credentials in prompts, browser code or shared design files. CodeGraph traced DatabaseModule, RequestsService and SearchIndexService; RTK condensed shell output.

The active Requester form has 11 fields (including a configurable New field), and PSF Created Information has 10. The catalog has 17 entries including Draft and Cancelled. Actual statuses include `20% -- PSF File Creating`, `30% -- Compare Old and New layout`, and the 71-character `93% -- Provide test template map to EWFM\Update auto FI script (ST Fab)`. Use neutral Status badges with a maximum one line and ellipsis; full names remain accessible through hover/focus/click disclosure. Do not reinterpret status percent prefixes as calculated progress or a mandatory sequence.

Queue primary identity: PSF-specific title, followed by request number and a compact fictional Probecard reference. Keep the four columns Request / Status / Due date / Owner / Dept. Product, Wafer FAB, reference PSF, setup-file metadata, and long notes belong to request detail. Search currently covers request number, title, reference PSF, PSF setup filename and probecard; do not promise Product search.

Anonymous example Requester scope: Open 25, Overdue 15, Completed 0. Example Setup Owner MFG department scope: Open 44, Overdue 24, Completed 6. These are read-only aggregate snapshots on 4 October 2026, not live counts in Stitch. People and row identities are fictional, not matched to an actual user. Owner scope is explicitly PSF department work for these totals. Open-filter queue count is 25 for Requester and 44 for Owner; retain a 25-item API page size. A design shows five illustrative rows, not a claim to render the complete API page.

Dark palette: neutral charcoal canvas #181A1C; navigation #1E2022; raised surfaces #242629; subtle wells #303335; outline #3B3E40; primary text #F4F3EE; secondary text #B7BAB8. Remove navy/blue canvas and table surfaces. Open badges use neutral gray with readable text. Orange and green appear in small purposeful accents; primary actions may use pale cyan #73D5EE with dark readable text. Neutral active navigation plus a small cyan indicator. No pure-black slabs, glow, gradients or broad saturated fills. Theme switching never changes record data or disclosure behavior.

## 8. Exact Status reference and action constraints

The complete 17-entry catalog and exact spelling are recorded in [the Status contract](../docs/status-catalog-and-manual-updates.md), verified directly against PostgreSQL on 4 October 2026. Older imported screenshots and historical plans may contain short labels; they are not Status references. Every row badge and Status filter uses the full configured name. `Completed` is permitted as a summary group label; the current completed request Status is `100% -- Completed`. `PSF Created Information` is a form heading, not a Status. The percentages do not define stages or automation. Do not generate a workflow-transition editor or action shortcuts that select and save a target Status for the user. This applies to both roles, both devices and both themes.

Use this verified snapshot when constructing static Stitch examples; runtime code fetches the current catalog. Keep every character and use `kind` for visual classification.

| Exact database Status | Catalog kind |
| --- | --- |
| `Draft` | `draft` |
| `5% -- Reject (Information not complete)` | `open` |
| `10% -- Test Engineer Data Entry` | `open` |
| `20% -- PSF File Creating` | `open` |
| `30% -- Compare Old and New layout` | `open` |
| `40% -- Feedback Requester(Layout mismatch)` | `open` |
| `80% -- Wait for create DCC` | `open` |
| `81% -- Edit Template Map (Bin62)` | `open` |
| `82% -- Wait for sent Template Map` | `open` |
| `83% -- Complete Excel probe pattern` | `open` |
| `85 % -- Reject check list` | `open` |
| `90% -- Wait for buyoff check list` | `open` |
| `93% -- Provide test template map to EWFM\Update auto FI script (ST Fab)` | `open` |
| `95% -- Reject (Wrong site location and wafer map)` | `open` |
| `99% -- Wait requestor Buyoff site location and wafer map` | `open` |
| `100% -- Completed` | `completed` |
| `0% -- Rejected (Cancel Request)` | `cancelled` |

## 9. Requests page — active Desktop revision

Requests is the shared submitted-work list for both Requester and Setup Owner. It does not default to creator-only or MFG-only scope. Keep private Drafts in My Drafts. Do not copy Dashboard summaries or its related/created/department scope controls. Keep the shared Audit History link for both roles; only Requester has Export.

Use one dominant list and three existing filters: keyword (request number/title/PSF/probecard), full catalog Status, and a separate Product type text filter. Full non-Draft catalog names are available; filters never mutate Status. Desktop groups records into Request (title/number/type), Status, Schedule (priority/due), and Responsibility (requester/owner/department). Requests redesign is Desktop only; retain these groups and their fields in the desktop list. All current list fields remain reachable. The Requests frontend uses a 100-item page limit, unlike Dashboard 25; the static design uses five fictional sample rows and truthful 1–5 of 5 pagination.

For later Requests revisions, carry forward Dashboard v5 neutral tokens and the single-line Status disclosure. Preserve shared Light/Dark structure, working local theme control, desktop keyboard focus and full-value Status disclosure. No transition actions, checkboxes, bulk edits, role switching, unsupported sort or live API integration. Manual Status editing is confirmed as catalog selection plus a separate Save Status; list filtering remains read-only.

## 10. Dashboard restart — approved neutral direction

Keep exactly three work summaries and one full-width work queue. Reduce simultaneous metadata rather than creating a welcome hero, charts or additional panels. Desktop shows Request (title/ID/compact Probecard), Status, Due date and Owner / Dept. No Mobile design is required. Keep the owner scopes exactly Related work / Created by me / PSF department work. Default Owner preview is MFG department work with MFG rows. Do not add a role switch.

Status is a display/disclosure button only: single-line truncation with actual ellipsis, full decoded database string in accessible name and in the full-value popover, hover/focus/click support on Desktop. Clicking or dismissing it never saves or changes Status. Show the long 93% value in at least one record and show genuine truncation when its content exceeds the single-line width. Use a neutral CircleDot icon for open-kind entries, not a play/action triangle. Completed and cancelled use their proper catalog kinds.

Both Desktop role screens need the shared Audit History navigation link in both themes; only Requester has Export. Account identity and all row data are fictional. Database-informed totals remain the dated anonymous snapshots documented above. Clear filters, selected summary indication, theme and Status disclosure must work locally in preview HTML. Do not claim an API integration or invent live filter totals.


## 11. Requests v2 — approved next page

Dashboard v5 is accepted. Requests uses the same Desktop shell, neutral Light/Dark palette, single-line Status ellipsis and full-value hover/focus/click disclosure. No Dashboard summaries or Owner department scopes on this shared submitted-work page. Keep Keyword, exact Status and Product type filters, Request / Status / Schedule / Responsibility field groups, all-role Audit History and Requester-only Export. Completed/cancelled examples use catalog kinds; Status never changes automatically. Five fictional sample rows, truthful counts, existing 100-record page contract. Mobile design remains outside scope. Production coding was excluded from this original design iteration; the 5 October authorization in section 13 supersedes that boundary.


## 12. Request Detail v1.1 — v1 design with breadcrumb

Latest product-owner direction on 4 October 2026: the original Stitch Detail v1 design is preferred. Restore its tabbed layout and add a breadcrumb showing actual route ancestry. The intervening Detail v2 original-layout/color-only exploration is historical and must not be implemented. This section supersedes that brief.

Reuse the approved Dashboard/Requests shell. Replace the Back to Requests link with `Requests › PSF-2026-0039` above the masthead. Requests links to /requests; the current request number uses aria-current=page and is not a link. Use a semantic nav labelled Breadcrumb, an ordered list, a decorative separator hidden from assistive technology, and a visible keyboard focus outline. Do not add Dashboard as a false parent of Requests. The information tabs remain in-page panels and do not add breadcrumb depth; the breadcrumb does not change when switching tabs. Keep the complete request title in the masthead rather than duplicating a potentially long title in the breadcrumb. Light/Dark share the structure and neutral v1 tokens.

Keep the compact masthead, metadata and single-line Status ellipsis/full-value disclosure. Keep the independent exact-catalog selector and Save Status; selecting alone and form saves do not change Status. Dirty forms gate Status saving. Do not add transition shortcuts or percent steppers.

Keep the v1 accessible Requester Information / PSF Created Information / History tabs. Requester defaults to Requester Information; Setup Owner defaults to PSF Created Information. Preserve Edit information and explicit Save/Cancel, the three optional Requester fields in Additional details, and all 11 Requester/10 PSF fields. Submitted-request Requester Information editing follows backend permissions for both roles; requester identity remains read-only.

Only Owner/Admin edit PSF data. Requester before release sees a notice with no unreleased PSF values in DOM; after release it is read-only. History is available to every authenticated role with existing PSF redaction. Audit History remains available in both role sidebars; only Requester has Export. Keep private Draft ownership, separate initial submission, revision checks and unsaved-data safeguards. Desktop Light/Dark only. The original Stitch previews use fictional fixtures without DB writes or API integration; application implementation was subsequently authorized on 5 October.


## 13. Complete Desktop suite — current direction, 5 October 2026

The product owner explicitly requested all remaining pages in one batch, confirmed inclusion of all Admin pages and approved all 31 Desktop role/state captures in Light/Dark for implementation on 5 October 2026. This replaces the earlier per-page review gate, Admin deferral and design-only scope. Current inventory is suite-inventory.json; route aliases reuse the same page design. Keep the accepted Dashboard/Requests body and tabbed Detail v1 body, updating their shared navigation only. Working-tree source integration is complete; local integrated QA has passed.

Every authenticated page has a visible navigation toggle in the main top row. It collapses the 220 px sidebar into a 72 px icon rail and expands it again, retaining accessible link names/tooltips, active destination, account access and theme control. The toggle remains outside the collapsed rail and labels its state Collapse navigation / Expand navigation with aria-expanded and aria-controls. Collapse does not change page data or theme. Wider content uses the released space.

Nested pages have an explicit Back button beside the breadcrumb. Back links to the stable parent: Detail/New Request → Requests; private Draft Detail → My Drafts; per-request History → request; Admin tools → Administration; form versions → the matching family catalog. Breadcrumb ancestors remain independently clickable, with an unlinked current page. Root Dashboard/Requests/My Drafts/Audit/Export do not add an invented browser-history destination. Unsaved edits require Stay on page or Discard and leave. Account popover exposes Sign out, with no invented profile settings or role switch.

New Request saves a private draft first; no Status selector or implicit submission. Draft Detail separates Save draft changes from explicit Submit request, uses an exact initial catalog choice and checks required data/schema before submission. Saving incomplete drafts is permitted; submission requires required fields. Existing schema-upgrade decisions remain explicit and are integration states. My Drafts contains only the current account's private drafts.

Per-request History and all-role Audit History preserve role data visibility, exact old/new Status values and readable change disclosure. Audit filters apply explicitly and use Request ID, User, Action and UTC date bounds; displayed timestamps identify Asia/Bangkok. Export is Requester/Admin only, filters exact Status/request dates and explains that preview count is not the permitted export count. Queued/running/completed/failed export states require the existing download/job API at implementation time; the local preview does not produce a workbook. Sign-in uses company LDAP username/password and show/hide password; no registration or unsupported reset-password flow.

Admin uses a tools directory and navigation for Users & Roles, Form Management, Status Management and Auto-fill Rules. Users can edit role and Setup Owner GNTC/MFG department only; identity is not editable. Form catalogs and draft/active editors exist for both Requester and PSF families; active versions are read-only, one draft per family, explicit draft save, preview, publish/discard confirmations and schema-snapshot impact text. Stable field/canonical keys remain read-only. Draft field controls preserve required Requester identity/product type and unique choices. Status management is a catalog with protected Draft, exact names/kinds, rename, explicit delete/replacement and a persistent PSF visibility trigger; no transition graph or kind editing. Auto-fill source is previous completed PSF, one trigger and unique targets excluding it. Master Data retains its genuine Not configured state and is not added to tool navigation. See admin-page-evidence.md for source facts and aliases.

All screen data and accounts are fictional. Screens use dated verified non-identity form/status metadata, not live record claims. All actions are local design previews; production permissions, validation, revision conflicts, real authentication/downloads, auditing and persistent release policy remain implementation requirements. Do not introduce API/DB writes while reviewing this suite. Mobile remains outside scope.

# Direction C frontend fidelity and verification ledger

> **Status clarification, 4 October 2026:** [Database Status names and interaction rules](../status-catalog-and-manual-updates.md) supersede old short-label catalogs, directed transition matrices and action-driven automatic Status changes below. The retained body is historical evidence, not a Status catalog or current UX instruction. Do not reuse old named-stage buttons or transition-editor requirements.

Completed on 3 October 2026, Asia/Bangkok. This ledger records the implemented application, visual comparisons and verification limits. The [approved specification](2026-10-03-frontend-design-spec.md), existing API contracts and administrator-configured schemas override raster artifacts. The [implementation plan](2026-10-03-frontend-implementation-plan.md) is complete.

## Result and scope

Direction C is applied across all working frontend surfaces and existing unfinished-route treatments. One authoritative stylesheet supplies typography, spacing, light/dark tokens, navigation, fields, tables, dialogs, status and feedback. Business services, backend, state helpers, schemas, generated routes and dependencies are unchanged. No commits or deployment were performed.

Root integration remained `gpt-6.1-sol / ultra`. Form, Schema and Admin workers used independently verified `gpt-6.1-sol / high`, rechecked after resumes. Exclusive source ownership prevented shared-file edits by workers. Read-only cross-reviews and root Ultra integration review found and corrected the history retry race, section confirmation copy and breadcrumb null handling; final review added request-history route isolation. [Routing evidence](2026-10-03-agent-routing-verification.md) records effective session contexts.

## Fresh verification evidence

[Command results and final source fingerprints](verification/command-results.json) record the accepted source tree.

| Check | Result and practical limit |
| --- | --- |
| Frontend `npm test` | 30 files, **300 tests passed**, exit 0; final run 07:12:01 local. Baseline was 276 tests. |
| Frontend `npm run lint` | No issues found, exit 0 on the final tree. |
| Frontend `npm run build` | TypeScript and Vite passed, exit 0; 1,875 modules. |
| Diff and protected boundaries | `git diff --check` clean. Backend, API/services, business state/schema, generated route tree and package files unchanged; all 19 route modules remain. |
| Broad visual matrix | **43 renders**: 15 screens at 1440×900 and 390×844, four at 1536×1024, four at 768×1024, five in dark mode. Visible h1, body width, local table overflow, mobile input/select heights and console/page errors checked. [Results](verification/matrix-results.json): no errors. |
| Extra captures | Exact 1487×1058 create concept size, full mobile create/detail and desktop/mobile/dark login. [Results](verification/extra-results.json). |
| State/role checks | **16 assertions** for loading, empty, real retry, catalog failure/recovery, setup-owner export restriction/relationship filter, hidden/released PSF, foreign draft denial, custom status/long identifier, table scrolling, keyboard detail link, session redirect and reduced motion. [Results](verification/state-results.json). |
| Keyboard and reflow | **12 assertions** for skip link/main focus, drawer initial focus/Tab containment/Escape return, four 720×450 reflow layouts, mobile detail order and exact light/dark input boundaries. [Results](verification/reflow-results.json). |
| History route isolation | Regression observed failing before the fix, then passed. Browser client-side route change to a denied request excludes the previous identity/events; final history desktop/mobile recaptured. [Results](verification/history-results.json). |
| Form acceptance | Incomplete create/save/reopen; independent requester/PSF saves; both route-exit cancel/confirm cases; unresolved/Remain/Upgrade/Reload/409 gates; post-upgrade save/submit; delayed autofill manual edits all pass against browser fixtures. Exact microsecond tokens and family payload boundaries verified. |
| Schema acceptance | **25 assertions** and seven fulfilled synthetic mutations verify family URLs, one-draft rule, Apply/Cancel, schema identity/order/options, save/publication conflicts, saved-valid-clean publish, read-only active state and exact family-specific consequences/payloads. |
| Admin acceptance | User/department updates and partial session-refresh error; seven exact status revision checks including replacement/conflict; audit Apply/Clear; export download failure then queued retry/completion. Actual synthetic XLSX browser download verified (2 starts, 4 polls, 2 attempts, 1 object URL created/revoked). Password toggle and fixture login errors verified. |

The final broad matrix includes the request-history isolation and exact mobile geometry refinements. The request-history route was also checked through client-side navigation to denied access, and all source changes are included in the fresh 300-test/lint/build run. Expected synthetic 401/403/409/503 responses in failure scenarios are distinguished from framework exceptions. Early failing harness selectors, temporary integration regressions and misleading dark-login filenames are superseded; they are not used as final proof.

## Shared visual and accessibility checks

- Desktop and mobile headers are 52 px. Desktop gutters are 24 px; mobile gutters are 16 px. Mobile inputs/selects and action targets retain at least 44 px.
- Canonical light input border is **#7A8D99**, computed as `rgb(122, 141, 153)` on a text input; the stale plan token was removed. Dark input border is #607584.
- Measured light contrast ratios: body text/white 14.55:1; secondary text/white 5.95:1; primary button white text 4.69:1; selected text/fill 5.81:1; input boundary/white 3.44:1; success/warning/error text 5.92:1 / 5.41:1 / 6.51:1. Dark body/surface 13.99:1, secondary/surface 8.09:1, input boundary/surface 3.33:1, primary text/cyan 8.89:1. These are token calculations, not a claim of a complete automated WCAG audit.
- Native fieldsets/labels, unique form IDs/names, read-only outputs, header scopes, real links, focus outlines and named table regions provide semantic access. Native dialogs preserve cancel, focus return, Escape and pending locks.
- Long labels/keys/options wrap; tables scroll locally without hiding columns/actions. Reduced motion removes sidebar animation. Both themes retain semantic text/icons instead of color-only status.
- Reflow uses a 720×450 CSS viewport, equivalent to the available layout space of 1440×900 at 200% zoom. Native browser menu zoom and scaled raster rendering were not asserted. The retained reflow screenshots are actually 720×450; earlier screenshots affected by a CDP/Playwright viewport mismatch were replaced.

## Screen comparisons

Each screen below has at least five concrete checks against its named concept or the approved written system. Desktop and mobile screenshots are retained under [verification/screenshots](verification/screenshots); dimensions and filenames are indexed in the [manifest](verification/screenshot-manifest.json). All major renders were inspected with `view_image`; owners also inspected staged dialogs/conflicts before root integration review. Synthetic people, requests, counts and dates are illustrative.

### Dashboard

Reference: queue.png. [Desktop](verification/screenshots/psf-final-dashboard-desktop.png) · [Mobile](verification/screenshots/psf-final-dashboard-mobile.png).

1. The 216 px sidebar, 52 px header and 24 px content gutter match the shared queue composition.
2. Open work, Overdue and Completed form one selectable count strip; the values remain server summaries.
3. Keyword, catalog Status and Reset use the same compact native controls as request browsing.
4. Request number, title and product type remain together; status icons accompany exact catalog labels.
5. Mobile uses the navigation drawer, stacked filters and a named horizontal table region rather than cards.

Copy and contract-preserving differences: The description reads “Related requests and current work.” The compact table, relationship selector for setup owners and server pagination retain the existing contracts. No decorative metrics or unsupported sorting were added.

### All PSF Requests

Reference: queue.png. [Desktop](verification/screenshots/psf-final-requests-desktop.png) · [Mobile](verification/screenshots/psf-final-requests-mobile.png).

1. Page title and Export action share one header; New Request stays in the actual application header.
2. Keyword, Status and Product Type controls align on desktop and fill the available mobile width.
3. Identity uses a real detail link with request number, full title and secondary product type.
4. Status uses catalog kinds; Normal priority remains plain, and owner/department information remains readable.
5. Columns remain accessible through local scrolling, a mobile scroll cue, keyboard focus and the result footer.

Copy and contract-preserving differences: The heading is “All PSF Requests.” Export is shown only to requester/admin roles, matching its existing authorization. Three identity lines can produce taller rows than the 48–56 px target; full business labels take precedence over clipping.

### My drafts

Reference: queue.png. [Desktop](verification/screenshots/psf-final-drafts-desktop.png) · [Mobile](verification/screenshots/psf-final-drafts-mobile.png).

1. The queue shell and identity/table typography are reused without a separate visual style.
2. Private-draft scope is stated immediately below the plural page title.
3. The existing keyword and Product Type filters remain; no submitted-status selector is invented.
4. The real request link, priority, due date, requester and owner columns remain present.
5. Mobile retains 44 px controls, the scroll cue and a visible result count.

Copy and contract-preserving differences: “My draft” becomes “My drafts.” Missing catalog kinds use the approved neutral status fallback; the private-draft browser does not add a catalog fetch or infer semantics from a label.

### Create PSF Request

Reference: create.png. [Desktop](verification/screenshots/psf-final-create-desktop.png) · [Mobile](verification/screenshots/psf-final-create-mobile.png).

1. The main form and restrained help rail match the create composition, including an exact 1487×1058 comparison capture.
2. The draft-first explanation sits directly beneath the title; no duplicate New Request action appears.
3. Product Type is a native named radio group; all configured fields remain in administrator order.
4. Desktop uses two columns and a full-width Request Note; canonical input borders, small radii and native date/select controls remain consistent.
5. Mobile uses one column, 44 px controls, a full-width save action and optional guidance after the form.

Copy and contract-preserving differences: Exact required copy: “Save a draft first. Review and submit from request detail.” Default Product and Wafer FAB remain text inputs. No new defaults or required flags follow generated image artifacts. The help explains incomplete draft saves, privacy, later submission, autofill and server-controlled requester identity.

### Request detail

Reference: detail.png and mobile.png. [Desktop](verification/screenshots/psf-final-detail-desktop.png) · [Mobile](verification/screenshots/psf-final-detail-mobile.png).

1. Request title/number, current status and six ownership/process properties lead the page before the forms.
2. Desktop places forms beside a compact action/history rail; separators replace repeated cards.
3. Requester and PSF information retain independent captured schemas, dirty/saved feedback and right-aligned save actions.
4. Action center presents actual server-allowed statuses and the existing reason an action is disabled.
5. Mobile reading order is identity, Action center, both complete forms, then History; the full-page capture confirms every field is reachable.

Copy and contract-preserving differences: Captured schema title/version and dirty feedback remain visible even where the raster is more compressed. Configured field order and all native controls are authoritative. The per-request response has no status kind, so detail uses the approved neutral fallback. No fixed stepper, percentage, reassignment control or upload affordance was added.

### Form Management

Reference: admin.png. [Desktop](verification/screenshots/psf-final-forms-desktop.png) · [Mobile](verification/screenshots/psf-final-forms-mobile.png).

1. The shared administration shell and understated active navigation match the approved admin concept.
2. Requester Information and PSF Created Information are real family links with exact existing search parameters.
3. Active/draft/inactive labels use explicit lifecycle mapping, icons and text rather than colored pills.
4. Versions, title/description, timestamps and existing duplicate/publish/discard actions remain in one table.
5. Mobile keeps the family links and every table action reachable through named local scrolling.

Copy and contract-preserving differences: API lifecycle “published” displays as “Inactive.” Active versions remain read-only; duplication is the existing draft creation operation. The one-draft-per-family rule and publication requirements remain intact.

### Form version and draft editor

Reference: written specification and admin.png vocabulary. [Desktop](verification/screenshots/psf-final-form-version-desktop.png) · [Mobile](verification/screenshots/psf-final-form-version-mobile.png).

1. The family/version breadcrumb reflects the loaded lifecycle; the header shows actual title, family and creator metadata.
2. Read-only versions display complete section/field descriptions and stable keys rather than disabled editors.
3. Draft sections use an open hierarchy with contextual Edit, move, add and remove controls.
4. Field properties separate editable label/type/required choices from stable field/canonical keys; local Apply/Cancel remains distinct from Save.
5. Native preview, field and publication dialogs fit mobile, preserve focus behavior and use restrained surface/border geometry.

Copy and contract-preserving differences: Family-specific publication consequences remain verbatim. Save conflicts preserve staged data; only saved, valid, clean drafts can publish. The advanced JSON fallback and dirty navigation guard remain. Schema publication, field editing and preview captures supplement the read-only version matrix.

### Users & Roles

Reference: written specification. [Desktop](verification/screenshots/psf-final-users-desktop.png) · [Mobile](verification/screenshots/psf-final-users-mobile.png).

1. Identity, role and department retain a dense table with consistent headings and separators.
2. The Edit access action remains contextual to the person being edited.
3. Username/email are read-only properties; role and supported department remain native labeled selectors.
4. The mobile dialog fits the viewport and begins on Cancel, with Escape/cancel and trigger focus restoration verified.
5. Saving locks actions, and partial session-refresh failure stays visible without implying the committed update was undone.

Copy and contract-preserving differences: The working role/department editor is retained. No user revision-token contract or additional identity editor was introduced. Partial-success copy explicitly distinguishes a successful user update from failed current-session refresh.

### Status Management

Reference: written specification. [Desktop](verification/screenshots/psf-final-statuses-desktop.png) · [Mobile](verification/screenshots/psf-final-statuses-mobile.png).

1. The actual status catalog uses exact names, supplied kinds and request counts in one technical table.
2. Protected Draft is visibly distinct from editable business states.
3. Create and visibility-trigger controls have named properties and shared compact styling.
4. Delete confirmation separates request replacement from nullable visibility-trigger replacement and destructive confirmation.
5. Mobile stacks the forms and retains every catalog column/action through local scrolling.

Copy and contract-preserving differences: The administrator-facing kind remains “Cancel”; the API value stays cancelled. This is a configurable catalog, so no directed transition matrix or fixed process progression is added. Seven browser mutation revision checks retained exact microsecond strings.

### Auto-fill Rules

Reference: written specification. [Desktop](verification/screenshots/psf-final-autofill-desktop.png) · [Mobile](verification/screenshots/psf-final-autofill-mobile.png).

1. Trigger, targets, source and rule state are structured properties rather than decorative cards.
2. Human labels accompany monospaced canonical keys without replacing the stored identities.
3. The source is stated as a previous completed PSF request; manual values are explicitly preserved.
4. Editor choices retain existing field validation, ordering and local Cancel/Save boundaries.
5. Mobile target choices have readable wrapped labels and reachable controls; inactive/reactivation information remains visible.

Copy and contract-preserving differences: Valid Save reactivates a rule under the existing contract. No delete-rule API or new lookup source was invented. Browser form acceptance confirms manual values entered before and during delayed lookup survive autofill.

### Export to Excel

Reference: written specification. [Desktop](verification/screenshots/psf-final-export-desktop.png) · [Mobile](verification/screenshots/psf-final-export-mobile.png).

1. The page header and three aligned native filter columns use the same form language as administration.
2. Export XLSX and queued/running/error/success feedback appear before the long request preview.
3. Preview identity, status, requester and due date remain in a real locally scrollable table.
4. Exact catalog kinds provide status recognition; unknown kinds remain neutral.
5. Mobile preserves 44 px controls, readable scope copy, busy locks and retry/download actions.

Copy and contract-preserving differences: “Export preview” becomes “Request preview.” Copy explains that preview scope can be broader and its count is not an exported record count. Synchronous/queued services, polling, ownership, filenames and URL cleanup remain unchanged; no export-profile CRUD was added.

### Global Audit History

Reference: written specification. [Desktop](verification/screenshots/psf-final-history-desktop.png) · [Mobile](verification/screenshots/psf-final-history-mobile.png).

1. Apply/Clear filters align with the shared toolbar and stack on mobile.
2. UTC filter labels and the local display timezone are explicit.
3. Event, timestamp, actor and available metadata retain a clear technical hierarchy.
4. Request numbers remain real detail links with visible focus treatment.
5. A named horizontal scrolling region keeps all audit columns accessible without fabricating pagination.

Copy and contract-preserving differences: Fixture action names were corrected to the real REQUEST_STATUS_CHANGED contract; application event interpretation was unchanged. Typing does not query until Apply. Clear retains the original empty-query boundary. Hidden PSF data remains server-controlled.

### Administration directory

Reference: written specification. [Desktop](verification/screenshots/psf-final-administration-desktop.png) · [Mobile](verification/screenshots/psf-final-administration-mobile.png).

1. The shared page header introduces the existing tool directory without dashboard cards.
2. Working destinations are simple icon/text links separated by thin rules.
3. Available links derive from the existing role-visible navigation matrix.
4. Loading/error/retry use the shared announcement and action vocabulary.
5. Mobile links use the available width and remain reachable with keyboard and touch.

Copy and contract-preserving differences: The structural placeholder becomes a directory of existing authorized tools. Non-admin access is explained; an authorized Export destination or Back to Dashboard remains available where applicable. No new administration capability is implied.

### Master Data

Reference: written specification. [Desktop](verification/screenshots/psf-final-master-data-desktop.png) · [Mobile](verification/screenshots/psf-final-master-data-mobile.png).

1. The existing route uses the same shell, title and content gutter as working tools.
2. A restrained information notice communicates availability rather than fabricated metrics.
3. Not configured is an explicit text state with an information icon.
4. A real navigation action leads to working administration tools.
5. The mobile layout wraps the explanation and action without horizontal page overflow.

Copy and contract-preserving differences: The route explicitly states “Not configured.” No editor, sample record, Save action or master-data endpoint was fabricated.

### Request history route

Reference: written specification and detail history vocabulary. [Desktop](verification/screenshots/psf-final-request-history-desktop.png) · [Mobile](verification/screenshots/psf-final-request-history-mobile.png).

1. Resolved request number and title lead the page with a real Back to request link.
2. The timeline uses the same open History presentation as request detail.
3. Each entry presents action, actor/role and local timestamp with restrained milestones.
4. Loading, empty, failure and Retry read the existing authorized history endpoint.
5. Mobile keeps the title, back action and complete timeline readable; request-scoped rendering excludes previous identity/events during navigation or denial.

Copy and contract-preserving differences: The structural placeholder now presents existing capability. Request context is optional and independent of history authorization. A new regression and client-side browser navigation check verify that denied request B cannot retain request A’s identity or events.

### Company and development login

Reference: written specification. [Desktop](verification/screenshots/psf-final-login-desktop.png) · [Mobile](verification/screenshots/psf-final-login-mobile.png).

1. A compact authentication surface uses the same typography, input boundaries and solid primary action.
2. The existing official NXP image is retained without redrawing or creating a substitute logo.
3. Company sign-in and LDAP credentials have explicit labels and autocomplete semantics.
4. The password toggle retains an accessible Password name and exposes its pressed state; pending/error controls remain usable.
5. Mobile inputs/actions are 44 px, and the development-only role section remains visually subordinate; dark tokens were separately verified.

Copy and contract-preserving differences: Copy identifies Company sign-in and Local test accounts. Development identities remain gated by the existing build behavior. Login dark styling was captured after applying the theme class; full-navigation theme persistence is unchanged and is not claimed.

## Additional interaction evidence

- [Independent saved forms](verification/screenshots/psf-form-acceptance-separate-saves-clean.png), [discard dialog](verification/screenshots/psf-form-acceptance-discard-dialog.png), [upgraded draft](verification/screenshots/psf-form-acceptance-upgraded-draft.png), [autofill preservation](verification/screenshots/psf-form-acceptance-autofill-preservation.png).
- [Schema draft mobile](verification/screenshots/psf-schema-editor-mobile.png), [field editor](verification/screenshots/psf-schema-field-mobile.png), [preview](verification/screenshots/psf-schema-preview-mobile.png), [publication conflict](verification/screenshots/psf-schema-acceptance-publish-conflict.png), [PSF publication consequence](verification/screenshots/psf-schema-acceptance-psf-confirmation.png).
- [User editor](verification/screenshots/psf-admin-users-editor-mobile.png), [partial session-refresh error](verification/screenshots/psf-admin-users-partial-success-mobile.png), [used-status replacement](verification/screenshots/psf-admin-status-used-replacement-mobile.png), [autofill editor](verification/screenshots/psf-admin-autofill-editor-mobile.png).
- [Queued export](verification/screenshots/psf-admin-export-queued-running-mobile.png), [download failure](verification/screenshots/psf-admin-export-download-failed-mobile.png), [completed retry](verification/screenshots/psf-admin-export-completed-mobile.png), [login error](verification/screenshots/psf-admin-login-errors-mobile.png).
- [Complete create mobile](verification/screenshots/psf-final-create-mobile-full.png), [complete detail mobile](verification/screenshots/psf-final-detail-mobile-full.png), [exact create concept size](verification/screenshots/psf-final-create-exact-concept.png), [dark login styling](verification/screenshots/psf-final-login-dark.png), [denied history](verification/screenshots/psf-final-request-history-denied.png).

## Verification limits and handoff

All browser API responses and mutation results in the original acceptance run were synthetic, fulfilled or blocked in isolated Playwright sessions. The configured backend stayed off during that run because startup initializes/backfills business data and export workers. No live LDAP success, database persistence, production authorization, server-generated workbook scope or real server concurrency was claimed. No safe isolated integration environment was available. These limits did not prevent frontend fixture, unit, build, keyboard, responsive or visual acceptance.

After browser feedback the user authorized starting the configured development backend and requested removal of preview mock data. The gateway and fixture scripts were removed, and a fresh browser session checked the connected application. The user confirmed that existing database DEMO records are intentional system-test data and must be retained. See [live backend review](2026-10-03-live-backend-review.md) for current runtime, 28 database-backed renders, data dimensions and the two requested presentation changes. Original screenshots, results and hashes retain their original historical scope.

The existing theme toggle remains; full browser reload theme persistence was not added. The login dark capture verifies the approved stylesheet after setting the theme class. The developer login section is visible in development captures and remains gated out by the existing production behavior.

Source and documents remain in the existing feature checkout for review. [Verification instructions](verification/README.md) explain fixture isolation and how to repeat the retained checks. No known frontend implementation blocker remains within the approved scope.

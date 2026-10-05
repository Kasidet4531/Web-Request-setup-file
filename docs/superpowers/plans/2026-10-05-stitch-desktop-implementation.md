# Stitch Desktop implementation

User-approved reference: [.stitch/DESIGN.md](../../../.stitch/DESIGN.md) and [complete suite](../../../.stitch/suite-review.md). Implementation authorized 5 October 2026 after visual approval. Follow-up answers approve Light initially with remembered theme, remembered sidebar collapse, and retained unsaved edits while switching detail tabs.

## Scope and architecture

Implement every existing page represented in the 31 role/state previews with the existing React/TanStack/native CSS frontend and NestJS/pg API. Server data, identity, permissions, exact catalog names, schemas and revision tokens remain authoritative. Preview records/counts are not production data. Desktop Light/Dark is the design scope; retain the existing small-screen drawer and basic layout safeguards.

Use the current feature checkout and preserve pre-existing documentation changes. Writers own separate files. Root coordinates integration, shared CSS and complete verification. All delegated work uses gpt-6.1-sol / high. The implementation phase excludes database writes, seeding and deployment. After verification, the user explicitly authorized committing and pushing the completed work on 5 October 2026 to origin/unified-local-auth.

## Tasks

- [x] Shared shell: AppShell, NavSidebar, navigationState, requestBreadcrumb, shared theme and company sign-in. Functional 220/72 px sidebar with accessible icon rail; linked semantic breadcrumbs and parent Back; account and theme controls; persisted preferences. Request breadcrumb accepts optional isDraft to identify My Drafts ancestry. Preserve session and route blocking behavior.
- [x] Status disclosure: ui/StatusLabel retains exact strings and kind. One-line ellipsis plus complete hover/focus/click disclosure, Escape/outside dismissal, no mutation or row navigation from disclosure.
- [x] Requester forms: opt-in ActiveSchemaForm explicitEdit with initial view, Edit, Save information and Cancel; retain current saved baseline and invalidate pending autofill on Cancel. DynamicFormRenderer accepts per-field read-only keys for requester identity and groups optional fields without hiding required/configured fields. New Request and Draft remain editable and keep explicit lifecycle/schema checks.
- [x] Workspace pages: Dashboard three summary controls above full-width queue; Requests and My Drafts retain server filtering/pagination; submitted Detail uses mounted Requester/PSF/History tabs, preserving dirty edits. Owner/Admin default PSF tab, Requester defaults requester tab. PSF Edit/Save/Cancel preserves masking and revision conflicts. Separate Save Status; Draft Submit request remains explicit. Request-specific History and routing retain UUIDs.
- [x] Audit: backend audit controller/service permit authenticated roles with creator-private Draft and unreleased PSF protections before count/pagination. GlobalHistoryPage retains Apply/Clear and UTC bounds, displays Asia/Bangkok and permitted actual metadata changes.
- [x] Admin and Export: approved directory/cards, users, catalog, both form catalogs/draft/active editors, autofill, actual export/download/job states and genuine Master Data placeholder. Preserve existing management APIs, validation and confirmation dialogs. Shared tokens/classes apply to all pages; any required markup changes stay local to page presentation.
- [x] Integration: build/lint/frontend suite/backend unit+isolated HTTP integration, browser Light/Dark checks with isolated fixtures, keyboard/navigation/dirty-status checks, independent review and corrections. Update current documentation with actual implementation and verification boundaries.

## Verification focus

Behavioral changes get failing regressions before implementation. Presentation-only CSS is verified in the rendered browser instead of tests that mirror styling declarations.

1. Collapsed Desktop keeps links, account/theme and recovery toggle accessible; preferences survive reload. Mobile closed drawer remains inert.
2. Exact 71-character Status remains unchanged, reveals full string and never navigates or saves when opened.
3. Detail tabs retain unsaved values. Cancel restores latest server baseline; stale autofill cannot reintroduce edits; dirty forms block Status and leaving a route.
4. Every authenticated role sees Audit History while other creators' Draft events and Requester-unreleased PSF values remain absent, including count/filter inference.
5. Dynamic configured fields, readonly active form versions, explicit draft upgrade/submission, failed saves/conflicts and real export jobs retain their current functional behavior.

Commands: frontend npm test / npm run build / npm run lint; backend npm test -- --runInBand / npm run build / npm run test:e2e -- --runInBand. Backend lint is invoked read-only directly because its package lint script fixes files. Use locked dependencies. No checks connect to the supplied PostgreSQL instance or LDAP unless explicitly identified as read-only.

## Progress

- Read-only CodeGraph/API/frontend investigation complete. No additional domain decisions required.
- User UX answers recorded above; implementation and local verification complete.

## Verification — 5 October 2026

- Frontend: all 34 suites / 392 tests pass; production build and read-only ESLint pass. Backend: all 32 suites / 605 tests pass, 18 isolated HTTP integration tests pass, build and read-only ESLint pass. The isolated PGlite audit visibility test also passes. Locked dependencies are unchanged.
- Browser plugin not available; used bundled Playwright 1.62.1 with installed Chrome and a temporary synthetic API server outside the repository. All 31 approved role/page states passed in Light and Dark at 1280 × 900 (62 captures); no application errors, no page overflow, and visible Status text stays one line. Anonymous session 401 is expected and leads to Login.
- Representative Dashboard, Detail, form editor and Audit routes also pass at Desktop widths 1024, 1280 and 1920. Mobile design/testing remains outside scope.
- Browser interactions passed: remembered Light/Dark and 220/72 px navigation; exact Status hover/focus/click and Escape/outside dismissal; keyboard Arrow/Home/End tab navigation; form saving and pending selection leave Status unchanged until explicit Save Status; summary selection; retained requester/PSF edits across tabs; dirty Status blocking; Stay/Cancel; readonly/released PSF; creator Draft schema guard; MFG department scope; Admin form Stay/Discard, user and autofill dialogs; readable audit changes; loading/empty/error retry; queued XLSX download and failed-export recovery; password disclosure and Login return path.
- Independent source review found a clean PSF baseline could remain stale after a requester snapshot refreshed its revision. Regressions reproduced it, and snapshot acceptance now refreshes clean PSF values while preserving dirty edits and ignoring stale route callbacks. New request identities also reset the edit/tab view. Draft sidebar selection now matches its resolved My Drafts breadcrumb.
- Intentional design differences: show all runtime configured fields/optional counts and server pagination rather than the small illustrative records in Stitch; keep explicit accessible search labels and existing global creation shortcut. Active form versions and genuine Master Data placeholder retain their existing behavior.
- Implementation verification performed no deployment, schema migration or configured PostgreSQL/LDAP access. The production frontend still uses the existing real API client; synthetic APIs and records exist only in the temporary verification server.

## Git delivery authorization

On 5 October 2026, the product owner explicitly requested committing and pushing the completed redesign. Include source, regression tests, the approved Stitch design evidence, documentation corrections and scoped design-detector exceptions. Destination is the existing origin/unified-local-auth branch. Use the authenticated GitHub account identity with its noreply email for this commit because this checkout has no configured author.

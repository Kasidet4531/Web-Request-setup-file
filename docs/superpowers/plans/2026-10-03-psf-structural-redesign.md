# PSF structural redesign implementation plan

> For agentic workers: use subagent-driven development. Root leads design decisions, Taste implements, and Impeccable reviews the rendered result.

**Goal:** Make the existing operations product meaningfully different in matched screenshots by changing navigation and working composition while preserving its business workflows.

**Architecture:** Keep React, TanStack Router, native controls, dynamic schema rendering, API contracts, and current state/guard helpers. Restructure presentation within the existing components. One Taste owner controls shared CSS; a second Taste owner handles form and administration markup.

**Tech stack:** React 19, TypeScript, TanStack Router, Vite, Lucide, plain CSS, Vitest, installed Playwright CLI.

**Spec:** The design contract below supersedes the visual geometry/composition in `docs/design/2026-10-03-frontend-design-spec.md`; its business and permission contracts remain applicable.

## Design contract

- A roughly 96px dark labelled work rail and light utility header replace the long pale all-purpose sidebar. Administration tools move into role-aware contextual navigation. Keep all existing destinations reachable and retain the accessible mobile drawer.
- Dashboard uses a compact horizontal overview/scope strip above its full-width related queue at 900px and wider, following the user's approved placement feedback on 2026-10-04. Existing server summary values remain actionable work selectors; setup owners retain their Related work selector.
- Requests and drafts use a labelled horizontal filter strip above full-width results at 900px and wider, following the same approved feedback. Group existing data into Request, Status, Schedule, and Responsibility columns. Mobile requests remain complete readable records without horizontal panning; mobile filters retain an accessible disclosure with an evident active state.
- Create uses a bounded white form sheet, compact draft-first explanation, clear schema sections, native radio choice tiles, full-width title/notes where applicable, and a conspicuous save footer. Respect the earlier removal of the explanatory help rail.
- Detail places a title/status masthead and broad status-action band above metadata and independently saved requester/PSF editing panes. History sits below the editing workspace. No editor tabs that discard or unmount dirty state.
- Administration groups authorized tools into request configuration, access, and reporting. Form management clearly separates family selection, version catalog, and preview/editor surfaces.
- Keep the established sans-serif stack and monospaced identifiers. Use navy navigation, blue actions/focus, pale canvas, white working surfaces, restrained borders, and semantic status treatments. Structure, rather than palette alone, establishes the redesign.

## Global constraints

- Work only on `unified-local-auth`; do not create/switch branches or worktrees or commit unrelated changes.
- Preserve all unrelated baseline files. Baseline copies/hashes: `/tmp/psf-ui-second-pass-baseline`.
- No backend, API, database, schema, generated route tree, authentication, export-service, or dependency changes for presentation convenience.
- Preserve capability flags, draft privacy, captured schema order/fields/types, separate save boundaries, revision tokens, dirty/conflict guards, configurable statuses, autofill/manual preservation, and sticky PSF release policy.
- Use current server values only. No invented charts, progress stages, data, assignment, bulk actions, or saved views.
- Keep dark theme, 390px mobile access, visible keyboard focus, and long/custom labels usable.
- Use the existing backend only for read-only review. Do not save/submit/publish business records, change permissions, or generate workbook jobs during live browser review.

## Review focus

- Compact navigation must expose every authorized destination and preserve drawer focus/close behavior.
- Mobile record presentation must retain full status, dates, requester and owner information and ordinary request links.
- Moving forms must preserve independent unsaved state, status blocking, field validation, and PSF masking.
- Live schema additions, long labels/options, and unknown status kinds must remain visible and operable.
- Administration family/version changes and publication controls must retain their existing guards and draft-only editing semantics.

## Task 1: Shell, queues, and detail — Taste core owner

**Files:** `frontend/src/index.css`, `frontend/src/components/AppShell.tsx`, `NavSidebar.tsx`, `navigationState.ts`, `RequestsWorkspace.tsx`, `ui/PageHeader.tsx`, and their relevant tests.

**Interfaces:** Keep existing exported component signatures and query contracts. Add presentation wrappers/classes without changing service or domain helpers. Coordinate form/admin classes with Task 2; only this owner edits shared CSS.

- [x] Implement compact navigation and contextual authorized admin navigation; verify existing navigation/auth/drawer tests.
- [x] Restructure dashboard selectors and request filters/results; add meaningful coverage for new disclosure/navigation behavior and retain queue race/loading tests.
- [x] Regroup table data and mobile record presentation, retaining all fields, anchors and pending inertness.
- [x] Move detail actions, metadata, editor panes and history; retain dirty/save/release tests.
- [x] Run focused component tests and production TypeScript/build validation. Root integrates changes without a branch/worktree/commit operation.

## Task 2: Forms and administration — Taste form owner

**Files:** `frontend/src/components/DynamicFormRenderer.tsx`, `ActiveSchemaForm.tsx`, `AdministrationDirectory.tsx`, `AdminFormConfigPage.tsx`, and their relevant tests. Do not edit Task 1 files.

**Interfaces:** Preserve dynamic field values, handlers, schema iteration order and exported props. Supply class/markup contracts to Task 1 owner for styling. Existing save/duplicate/publish APIs stay unchanged.

- [x] Give schema sections, product choices, title/notes and form footer intentional presentation without hard-coded field omission or new defaults.
- [x] Group authorized administration links into working categories.
- [x] Recompose form family/version catalog and preview/editor presentation without changing lifecycle behavior.
- [x] Run focused renderer, active-form, administration and form-management tests; report markup/classes to CSS owner.

## Task 3: Rendered review and integration — Root and Impeccable

- [x] Capture matched after screenshots for dashboard, requests, create, detail, administration and form management at 1440×900 and 390×844, plus relevant full-page captures.
- [x] Have Impeccable independently inspect before/after renders and judge whether structural difference is sufficient. Fix material findings in a bounded batch and confirm the result.
- [x] Verify all routes at desktop/tablet/mobile, dark theme, navigation/keyboard, filtering/counts, dirty dialogs, record links and independent editor presentation using installed Playwright tooling.
- [x] Run frontend tests, lint, production build and `git diff --check`. Compare changed files with baseline and inspect for unrelated or backend changes.
- [x] Record comparison evidence, verification results and any live-flow limits. A result substantially matching the original composition remains incomplete.

## Completion evidence

The user-approved top-panel refinement supersedes the initial left-column geometry. UI/UX Pro Max recommended the compact placement, Taste implemented it, and Impeccable independently passed the matched desktop/tablet/mobile and dark renders. Follow-up evidence is recorded in `docs/design/2026-10-04-top-panels-review.md`; the 391-file preservation baseline for that refinement is `/tmp/psf-top-panels-baseline`.

Root approved the structural direction before implementation. UI/UX Pro Max proposed the direction, two Taste specialists implemented it, and independent Impeccable and regression specialists reviewed the result. Matched captures cover six pages at desktop and mobile sizes; browser verification includes 14 routes at 1440, 900, 390px, five dark renders, and 44 interaction assertions. Final results and before/after links are recorded in `docs/design/2026-10-03-structural-redesign-review.md`. Pagination rendering/guards are covered by existing automated tests; the local 100-record catalog does not expose a next page for a live pagination check.

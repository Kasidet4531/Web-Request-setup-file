# Form Management and Request Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make configured forms match their interactive previews and assign submitted requests to individual setup owners' dashboards.

**Architecture:** Reuse the existing form-version lifecycle and DynamicFormRenderer. Store a nullable assignee UUID alongside existing owner/department snapshots, synchronize the submitted search index atomically, and filter personal dashboards by UUID. Assignment is request metadata outside the configured form schema.

**Tech Stack:** React, TypeScript, TanStack Router, NestJS, PostgreSQL, Vitest, Jest, Node test runner and Playwright through the existing isolated system fixture. No new runtime dependencies.

**Command environment:** Commands below run in the named frontend/backend directory with `/home/kasidet4531/.nvm/versions/node/v24.21.0/bin` prepended to PATH. Local listener/database/browser tests may need sandbox escalation; their scope remains isolated loopback fixtures.

**Spec:** [Approved design](../specs/2026-10-06-form-management-and-request-assignment-design.md)

## Global Constraints

- Work in `feat-email-notification` on `feat/email-notification`; never implement on main or merge it as part of this plan.
- Use CodeGraph before locating/reading code; preserve the existing quiet background refresh.
- Edit only Draft form versions; retain Duplicate as draft and one Draft per form family. Preserve historical request schema snapshots.
- Both previews use interactive controls, local required validation and unsaved config; they never save requests, invoke runtime autofill, or send mail.
- Preserve schema section/field order and optional fields. Remove automatic Additional details grouping.
- Detail labels are 14px, bold, foreground with a thin separator below; section headings are 16px. Keep Owner / Dept.
- One optional setup-owner assignee. Every authenticated role that can access a request can assign/change/clear it; private Draft access remains creator-only.
- Dashboard relationship dropdown is setup-owner-only; requester/admin dashboards retain created-by-me scope.
- Assignment never changes status, grants edit rights, releases PSF, or queues notification mail. Remove first-PSF-save auto-claim.
- Test against disposable local PostgreSQL and boundary LDAP/SOAP substitutes; do not access company services or DB `10.0.20.6`.

## Review Focus

1. Two setup owners share a display name: only the selected UUID receives personal work. Task 2 SQL and Task 4 system tests.
2. An assignee changes role after Draft save: Submit rejects stale eligibility and permits explicit clearing. Task 2 service/SQL tests.
3. Admin previews unsaved changes or switches versions: controls show the current schema and temporary values never alter config or leak between versions. Task 1 interaction tests.
4. Two users change assignment concurrently, or audit/index writes fail: stale revisions conflict and no partial ownership/index/history survives. Task 2 SQL and Task 3 interaction tests.
5. An existing database has name/department-only ownership, or another request mutation upserts the index: legacy display survives startup and assignment UUID survives subsequent mutations. Task 2 SQL and Task 4 system tests.

## Shared Contracts

- `AssignableSetupOwner = { id: string; displayName: string; setupOwnerDepartment: 'GNTC' | 'MFG' }`.
- `GET /api/requests/assignees` returns `{ items: AssignableSetupOwner[] }` to authenticated users; excludes requester/admin and omits email/other account metadata. Register before the `:requestId` route.
- Request detail/list responses add `setupOwnerUserId: string | null`. Existing `setupOwner` and `setupOwnerRole` remain display-name/department snapshots.
- Draft create/update add optional `setupOwnerUserId?: string | null`: omitted preserves existing assignment, null clears it, UUID assigns from server-owned profile data. New requests with omission start unassigned.
- `PUT /api/requests/:requestId/assignment` accepts `{ setupOwnerUserId: string | null; expectedUpdatedAt: string }`, returns the complete `PsfRequestResponse`.
- Service signatures: `listAssignableSetupOwners(): Promise<{ items: AssignableSetupOwner[] }>`; `updateAssignment(id: string, dto: UpdateRequestAssignmentDto, actor: AuthenticatedUserProfile): Promise<PsfRequestResponse>`.
- Dashboard relation values: `'all' | 'created' | 'assigned' | 'department'`; labels `Related to me`, `Created by me`, `Assigned to me`, `Department work`.
- Audit action `REQUEST_ASSIGNEE_CHANGED`; metadata `{ before: { setupOwnerUserId, setupOwner, setupOwnerRole }, after: { setupOwnerUserId, setupOwner, setupOwnerRole } }`.
- Frontend API methods: `fetchRequestAssignees()` and `updatePsfRequestAssignment(requestId, payload)` follow existing API-client request/response conventions.

## Task 1: Discoverable form versions, faithful previews and readable Detail

**Files:**
- Modify: `frontend/src/components/AdminFormConfigPage.tsx`, `frontend/src/components/DynamicFormRenderer.tsx`, `frontend/src/components/ActiveSchemaForm.tsx`, `frontend/src/index.css`.
- Create: `frontend/src/components/AdminFormConfigPreview.tsx` for preview-only values and local validation; move/re-export the existing preview entry point to preserve imports.
- Tests: `frontend/src/components/AdminFormConfigPage.test.tsx`, `frontend/src/components/AdminFormConfigPage.interaction.test.tsx`, `frontend/src/components/DynamicFormRenderer.test.tsx`, `frontend/src/components/ActiveSchemaForm.interaction.test.tsx`.

**Interfaces:** Consumes existing `FormSchema` and `validateRequiredFields(schema, values)`; produces `AdminFormConfigPreview({ schema }: { schema: FormSchema | null })`. Runtime form schema types and request APIs are unchanged in this task.

- [ ] Add failing component/interaction tests: Draft has Edit; all versions have View; published has only Duplicate for editing; both previews render real text/select/radio controls and show required errors without request/autofill API calls. Assert an interleaved optional field remains between required fields, and unsaved label/options edits appear immediately.

  Representative assertions after rendering a schema with required text `Product` and optional select `Option`:
  ```tsx
  expect(screen.getByRole('textbox', { name: 'Product' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Option' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Check required fields' }))
  expect(screen.getByRole('textbox', { name: 'Product' })).toHaveAttribute('aria-invalid', 'true')
  expect(screen.queryByText('Additional details')).not.toBeInTheDocument()
  ```
- [ ] Add failing tests for version/schema changes resetting temporary preview values, server-seeded descriptions being hidden even on duplicated versions, and custom descriptions remaining visible. Pin config dirty state to config edits rather than preview input.
- [ ] Run `npm test -- src/components/AdminFormConfigPage.test.tsx src/components/AdminFormConfigPage.interaction.test.tsx src/components/DynamicFormRenderer.test.tsx src/components/ActiveSchemaForm.interaction.test.tsx` in frontend; verify failures reflect missing behavior.
- [ ] Add explicit links/actions using existing routes; remove editor family aside and retain Back/heading/breadcrumb. Filter the known seed descriptions only in display, including stored legacy copies.
- [ ] Implement preview state in the focused component with controlled values, real renderer controls and local validation; use `Check required fields` as its action. Requester identity uses a clearly identified sample with the actual identity field lock. Hide internal renderer schema metadata and use family-appropriate layout. Reset state on selected version changes without discarding in-progress preview input merely because the admin changes a label.
- [ ] Remove optional-field regrouping and its runtime flags. Keep every schema field in configured order across preview/create/edit. Scope Detail label/separator/section typography to Detail wrappers.
- [ ] Run full frontend `npm test`, `npm run lint`, `npm run build`; inspect every result. Commit this deliverable with its tests.

## Task 2: Atomic assignment APIs and UUID-based dashboard scope

**Files:**
- Modify: `backend/src/requests/requests.service.ts`, `backend/src/requests/requests.controller.ts`, `backend/src/requests/search-index.service.ts`, `backend/src/audit/audit_log.service.ts`.
- Create tests: `backend/src/requests/requests.assignment.spec.ts`, `backend/test/request-assignment.postgres.test.ts`.
- Extend tests: `backend/src/requests/requests.controller.spec.ts`, `backend/src/requests/search-index.service.spec.ts`, `backend/src/requests/requests.audit.spec.ts` and existing notification regression tests as relevant.

**Interfaces:** Produces all Shared Contracts. Uses the existing database pool, transaction helper, authenticated actor, request-access guard, revision serialization and audit writer. No new service layer is required solely to wrap these methods.

- [ ] Write failing tests `draft_assignment_is_private_and_not_indexed`, `requester_can_reassign_submitted_request`, `same_assignment_is_noop`, `invalid_assignee_is_rejected`, `psf_save_does_not_claim_owner`, and `assignment_does_not_enqueue_mail`. Assert persisted/request-visible behavior; reuse existing test doubles only at established database/notification boundaries.

  After an authenticated requester changes a submitted request from owner A to B:
  ```ts
  expect(changed.setupOwnerUserId).toBe(ownerB.id);
  expect(changed.setupOwner).toBe(ownerB.displayName);
  expect(changed.setupOwnerRole).toBe(ownerB.setupOwnerDepartment);
  expect(changed.status).toBe(before.status);
  expect(changed.canEditPsfCreatedData).toBe(false);
  ```
- [ ] Add SQL tests using disposable real PostgreSQL for same-name users, created-or-assigned deduplication, department scope, no Draft rows, legacy upgrade/repeated initialization, concurrent expectedUpdatedAt conflicts, and failure injected into audit/index writes causing complete rollback. Add `assignment_survives_status_and_request_data_changes` and invalid-role-at-Submit/clear/retry coverage.
- [ ] Run `npm test -- --runInBand requests.assignment.spec.ts requests.controller.spec.ts` and `node --require ts-node/register --test test/request-assignment.postgres.test.ts` before implementation; confirm behavior assertions fail for the intended reason, not missing test infrastructure. The SQL file owns an embedded-postgres loopback instance/temp directory and creates its own Pool explicitly; no inherited database environment or skipped external-DB tests.
- [ ] Add `setup_owner_user_id UUID NULL` to `psf_requests` and `request_search_index` through existing idempotent storage initialization; add a suitable index for personal assignment filtering. Preserve legacy owner/department text and do not infer UUIDs from names.
- [ ] Implement directory/UUID validation and eligible profile lookup in RequestsService using the transaction's query runner for mutations. Validate the user role and department from storage; coordinate profile reads with concurrent role updates through database locks. Do not accept client-owned snapshots.
- [ ] Extend Draft create/update to atomically persist explicit assignment, preserving it on omission and clearing all three ownership fields on null. Submit revalidates any stored UUID and indexes it only once publication succeeds. Remove ownership capture from PSF save.
- [ ] Implement revision-checked `updateAssignment`, including private Draft access, no-op detection, request/search-index timestamps and `REQUEST_ASSIGNEE_CHANGED` audit in one transaction. Do not update index for Draft or call notification enqueue for assignment.
- [ ] Update row mapping and every index-upsert source to preserve owner UUID across schema upgrades, PSF/requester edits, Submit and status changes. Retain legacy owner snapshots until an explicit assign/clear.
- [ ] Add `'assigned'` parsing/query types. For setup owners, related/all becomes requester UUID OR owner UUID; assigned becomes owner UUID; department retains stored Dept matching. Requester/admin related scope remains requester UUID. Use identical relationship predicates for list/count/summary.
- [ ] Run backend `npm test -- --runInBand`, `npm run test:e2e -- --runInBand`, `npm run lint`, `npm run build`, and `node --require ts-node/register --test test/request-assignment.postgres.test.ts`. Inspect every result, including lint's automatic edits. Commit the backend deliverable with tests.

## Task 3: Assignment picker and Dashboard relationship dropdown

**Files:**
- Modify: `frontend/src/services/api.ts`, `frontend/src/components/ActiveSchemaForm.tsx`, `frontend/src/components/RequestsWorkspace.tsx`, `frontend/src/components/GlobalHistoryPage.tsx`, `frontend/src/components/ui/HistoryChanges.tsx`, `frontend/src/index.css`.
- Create: `frontend/src/components/RequestAssigneePicker.tsx`, `frontend/src/components/RequestAssignmentDialog.tsx`, and corresponding `.test.tsx` files.
- Extend: `frontend/src/services/api.test.ts`, `frontend/src/components/ActiveSchemaForm.interaction.test.tsx`, `frontend/src/components/RequestsWorkspace.test.tsx`, `frontend/src/components/DashboardPage.test.tsx` and history tests.

**Interfaces:** Consumes Task 2 directory, assignment mutation and `setupOwnerUserId`; produces a controlled searchable picker `RequestAssigneePicker({ value, onChange, disabled })` and native Detail dialog `RequestAssignmentDialog({ request, open, onClose, onSaved, disabled })`. Extend the API types using Shared Contracts. Keep assignment metadata outside `DynamicFormValues`.

- [ ] Add failing tests for requester selecting an owner before Draft save, reopening/changing/clearing a Draft selection, assignee-only dirty state/navigation protection, and omission preserving assignment during ordinary requester edits.
- [ ] Add failing Detail-dialog tests for all three actor roles, searchable name+Dept, Unassigned, Save/Cancel/Escape/focus return, invalid/failed directory loading, stale revision preserving the selection, and blocking duplicate saves. If requester or PSF edits are pending, prevent assignment Save from racing those unsaved forms.
- [ ] Add failing dashboard tests for setup-owner-only dropdown with all four labels, query `relation='assigned'`, filter/page reset and identity changes; requester/admin have no dropdown and use relation all. Keep rendered rows/cards during pending refresh.

  Setup-owner interaction pins the public UI/query contract:
  ```tsx
  fireEvent.change(screen.getByRole('combobox', { name: 'Relationship' }), { target: { value: 'assigned' } })
  expect(api.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'related', relation: 'assigned', offset: 0 }))
  ```
  Also assert resulting rows and totals; this API-call assertion alone does not verify dashboard correctness.
- [ ] Run targeted tests to see the missing behavior, then implement API bindings and the two focused components using existing controls/native dialog patterns; directory failures must retain current assignment and offer Retry.
- [ ] Integrate assignment into Draft form save/load/reset/dirty tracking and Detail summary actions. On successful mutation consume the returned revision/snapshot and refresh history. On conflict refresh server context without silently discarding the selected assignee or other unsaved edits; preserve the latest revision before retry.
- [ ] Implement the relationship dropdown in Dashboard and assignment labels in request/global history. Distinguish legacy name-only ownership from a confirmed selected UUID so merely opening a legacy request never clears its displayed owner.
- [ ] Run full frontend `npm test`, `npm run lint`, `npm run build`. Commit the integrated frontend deliverable.

## Task 4: Real system flows, visual checks and final review

**Files:**
- Create: `backend/test/form-management-system.e2e.mjs`, `backend/test/request-assignment-system.e2e.mjs`.
- Modify as needed: `backend/test/email-system.fixture.mjs`, `backend/package.json`, `backend/eslint.config.mjs`, `docs/current-implementation.md`.

**Interfaces:** Uses existing `startEmailSystem()`, `loginPage(system, t, expectedHttpErrors?)`, `api(page, method, path, data?)` and `system.database` from `backend/test/email-system.fixture.mjs`. Add `test:forms:system` to build frontend/backend and run these two files sequentially. Extend the fixture with opt-in multi-user credentials/profiles for these tests, keeping its current default admin login unchanged. Reuse real authentication/session behavior without contacting corporate services.

- [ ] Write system cases for Edit/View/old versions and both interactive previews; configure interleaved required/optional fields, change unsaved labels/options, verify rendered Preview/New Request parity and no business write/autofill requests from Preview.
- [ ] Write Draft → Submit → personal Dashboard flow with creator, two same-name setup owners and admin: assigned Draft stays private/unlisted, only selected user sees Assigned to me after Submit, requester reassign/clear works, directory exposes only eligible minimal fields, and Unassigned Submit succeeds.

  With the setup owner authenticated, assert the actual submitted request number and totals in the browser after selecting Assigned to me. Compare persisted ownership/index UUIDs and outbox count using `system.database.query`; do not mock application API responses.
- [ ] Cover stale/invalid assignee, API permission/revision conflict, old owner snapshots, PSF-save non-claim, unchanged editing rights, and no new email jobs for standalone assignment. Check real request/global history after assignment.
- [ ] Run the new system script, existing `test:email:system` and `test:ui:system` with `EMAIL_E2E_CHROME=/usr/bin/google-chrome` against isolated fixtures. Avoid repeating unit/build suites already passed unless later edits warrant it.
- [ ] Inspect desktop/mobile and light/dark screenshots for preview/create layout, Detail label/separator, assignment dialog and Dashboard dropdown; verify keyboard operation, modal focus, no horizontal overflow, and no unexpected console/server errors.
- [ ] Update the implementation guide with final assignment semantics, legacy compatibility and actual verification results. Run `git diff --check`; commit system tests/docs.
- [ ] Run one fresh independent review against approved spec and the fixed start commit `d7d65e8`. Use `gpt-6.1-sol` with high effort if delegating, per the user's preference. Resolve substantive findings with reproducing tests and report remaining limitations honestly.
- [ ] Finish on the feature branch. Do not merge main. Commit/push feature changes and update the existing PR only within the user's existing authorization; attach the existing PR if needed.

## Execution Handoff

The user approved execution with the parent acting as orchestrator and delegated implementation/testing. Use **Subagent-driven** with `gpt-6.1-sol` / high effort. Tasks 1 and 2 may run in parallel because they own disjoint frontend/backend files; the orchestrator serializes commits and reviews. Task 3 waits for Task 1's frontend files and Task 2's contracts. Task 4 starts after the integrated interfaces are ready. Use fresh task reviewers and one final reviewer; workers never spawn their own agents.

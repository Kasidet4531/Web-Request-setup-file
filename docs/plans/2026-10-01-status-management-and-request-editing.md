# Status Management and Request Editing — Scope and Design Plan

## Current Integration Checkpoint — 2026-10-02

This checkpoint supersedes historical planning-only, pending-approval and older routing statements below. The user approved implementation, isolated workers/runtime, and a local final commit with no push or local-auth sync; the latest coder/reviewer choice is independent `gpt-6.1-sol/high`. Backend/frontend SPEC and QUALITY passed, including Q1/Q2 remediation. Hime executed 14 live HTTP/PostgreSQL/Excel scenarios in the approved isolated schema and integrated the frozen sources into the canonical rapid worktree. Fresh canonical checks passed: backend 578 unit / 18 mocked-HTTP e2e; frontend 230 tests; both lint/build, frontend type-check, source parity and diff check.

The final independent bounded cross-lane integration review is APPROVED. Hime recertified all 31 backend and 23 frontend files against the reviewed workers, reran the complete canonical package checks, removed the exact isolated schema with unchanged public hashes and namespace-absence readback, stopped the owned mounted harness, and restored the original delegation routing without changing other settings. Local-delivery readiness is complete; the authorized delivery is the local commit containing this plan and its verification record, with no push or local-auth synchronization. Public `updated_at` drift in two user records was detected before startup; the user accepted a refreshed public baseline with the unchanged original copy. All nine public hashes matched that approved baseline before/after the live run and cleanup. Evidence limitations and deferred Q3 are in [Status Management verification](../verification/2026-10-02-status-management.md). No deployment, connected-browser or unchanged-since-original-copy claim is made. Historical unchecked planning steps below do not supersede this verified delivery checkpoint.

## Native Delegation Approval — 2026-10-01

The user approved native background delegation for all remaining coding/review work and temporary default-profile delegation routing changes: “อนุญาตจัดการได้เลย”. This is a narrow exception to the earlier no-shared-routing-change restriction, not authorization to change Hime's main model or other profiles/settings. Hime saved the exact original `delegation.model`, `delegation.provider`, and `delegation.reasoning_effort` in `/opt/data/cache/scratch/status-workers/control/native-delegation-policy.json`, set and read back `openai-codex / gpt-6-luna-900k / max` for coding, and will switch to `gpt-6.1-sol / high` only after every coding child has stopped. Restore the original routing at delivery or if the execution is abandoned. Do not change these settings while any native child is still running.

All four previous CLI coding/continuation runs have stopped; their existing source diffs are preserved, not accepted. Continue from those diffs in fresh, bounded native checkpoints, one writer per isolated source lane; no long CLI resume, duplicate implementer, or full-scope restart. The worker session-persistence failure is not claimed fixed by this execution-method change. Backend/frontend checkpoints may run in parallel only with unchanged subtree ownership. Independent spec then quality review, isolated-schema integration, full canonical checks, English evidence, local commit/no push and no local-auth changes remain required.

## Execution Approval Checkpoint — 2026-10-01

The user approved: “Approved ทำทุกอย่างตามแผนได้เลย”. This checkpoint supersedes the historical planning-only/pending-approval markers below. Source implementation, temporary isolated workers under `/opt/data/cache/scratch/status-workers/`, independent review and canonical integration are now authorized. Delivery is a verified local commit only: no push, GitHub artifact, deployment or `local-test-auth` sync. Do not change shared Hermes/model profiles.

Approved defaults include Admin-only catalog management, protected Draft, immutable catalog identifiers, semantic open/completed/cancelled classification, and a separate sticky PSF release timestamp. Initial visibility trigger remains explicitly unconfigured (`null`) until an Admin selects it; do not guess a business trigger. Exact test database/reset/schema target and shared-runtime effects must still be identified and confirmed before destructive or live fixture execution.

Frozen worker API/interface contract and ownership: `/opt/data/cache/scratch/status-workers/control/api-contract.md`. Backend owns `backend/**`; frontend owns `frontend/**`; Hime owns root documentation/integration. Real model routing preflight already passed and is not repeated. Workers may not commit, access live data, start shared runtimes, or touch other lanes; independently reviewed source patches are integrated by Hime. Native `hermes --worktree` cannot honor the explicitly approved scratch path (it hardcodes repo-local `.worktrees` and defaults to remote-base synchronization), so manually managed Git worktrees at the approved paths are the minimal safe fallback.

**Isolated runtime/reset gate resolved:** Read-only discovery identified `psf_setup_db.public` as shared with local-auth backend port 3000 (PID 181426). The user explicitly selected a separate copied schema, not a public reset. Authorized namespace: `status_verify_94eb255ec6f1` in `psf_setup_db`; all runtime fixture writes use this namespace without public search-path fallback. Copied/reset old test rows: 6 requests, 50 canonical values, 23 request audit records, 5 search rows, 1 obsolete workflow setting. Verified preservation of 4 copied users and 4 form versions plus autofill settings. All nine public table hashes were unchanged after reset; local-auth source/runtime remain untouched. A protected rollback checkpoint is retained in scratch. Cleanup must drop only this exact authorized namespace and reverify public invariance; no public test data has been deleted.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans only after Hime receives implementation approval and the open product decisions below are resolved. This document is a planning draft, not authorization to edit production code or live data. Implementation steps use checkbox (`- [ ]`) tracking.

**Goal:** Replace the fixed status/transition matrix with a configurable work-status list; separate owner-private Drafts from shared work requests, allow authenticated users to change shared work status/requester information, and retain backend-authorized PSF editing.

**Architecture:** Reuse the existing workflow service, PostgreSQL JSONB configuration storage, request endpoints, shared form renderer, audit service, and search index. Keep each displayed status as the complete supplied string. Proposed catalog entries have an immutable internal identifier so semantic rules survive display-name changes; existing request status TEXT columns can remain display strings, updated transactionally on rename/replacement. No new workflow engine, dependencies, numeric progress calculation, or parallel form renderer.

**Tech Stack:** Existing NestJS, PostgreSQL, TypeScript, React, TanStack Router, native HTML controls, and project CSS.

**Spec:** The product contract, proposals, and open decisions in this document. This scope/design draft deliberately contains no implementation code. An executable implementation breakdown follows product approval, not before it.

## Global Constraints

- Implementation scope, when approved: `/opt/data/Web-Request-setup-file/.worktrees/rapid-frontend-rewrite`.
- Proposed parallel-isolation exception, pending the user's next approval: temporary worker Git worktrees under `/opt/data/cache/scratch/status-workers/`, with final integration only into the canonical rapid worktree above. Do not create these worktrees before approval or treat parallel permission as authority to touch local-auth/main source. If this path exception is not approved, keep writes within the original boundary and parallelize only safely isolated read-only/check work.
- Planning authorization currently covers this document only. Do not edit application code, database records, runtimes, or `local-test-auth` during planning.
- Source baseline: `b5ad405`. The previously completed PSF backend sync is separate, at local-auth commit `9c6b3a4`.
- Do not add development authentication to production source or modify shared Hermes/model configuration.
- Do not create commits, push, open GitHub artifacts, or deploy from this planning request.
- Preserve snapshots, original requester identity, audit history, validation, concurrency protection, and Excel fidelity during ordinary operations. The separately authorized test-data reset may remove the explicitly scoped test records and their dependent history; it must not become a general runtime wipe.
- Reuse native controls and existing patterns. Do not introduce drag-and-drop, a generic state-machine framework, or form versioning for the status list.

## Product Contract — Confirmed

- Each supplied line is one complete status string. Percentages are part of the name, not a separate progress field, ordering algorithm, or automatic transition trigger.
- Use the supplied list as initial business statuses; it is not a permanently hardcoded list. Adding, deleting, and renaming statuses must be supported.
- Keep `Draft` as the existing initial status.
- Only Draft saves may omit required fields. Required validation is form-scoped: first submission and subsequent requester-information saves require the requester form's required fields; authorized PSF saves in work status require the PSF form's required fields. Do not require requester-only users to populate PSF fields before they can submit. Existing type/choice/date validation remains in force.
- Any transition into the configured PSF visibility-trigger status must also validate required PSF fields against that request's captured PSF schema, even when the action only changes status. This applies to ordinary changes, initial submission targeting the trigger, and used-status replacement into the trigger. If validation fails, leave status and release state unchanged and report the missing fields; never publish/release first and validate afterward. This gate does not impose PSF completeness on initial submission to every other work status.
- A Draft is visible and accessible only to the user who saved/created it, identified by stored user ID. Other users, including other PSF team members, cannot access it merely because of their role. No implicit Admin exception to the stated owner-only Draft policy is assumed.
- Add a left-navigation menu labeled `My draft` immediately below All Requests. It contains only the current user's Drafts and reuses existing request-list/table primitives.
- All Requests and operational Dashboard lists/counts exclude Drafts. On successful first submission, the same record leaves My draft and enters the shared work listing; do not duplicate the request.
- Once a request enters a non-Draft work status, Draft is no longer a valid selectable destination. Reject return-to-Draft server-side, including bulk status replacement, not just in the dropdown.
- Submission UX is approved: Save draft saves privately and opens its saved detail; Action center is the single target-status selection surface. For Draft, explicitly choose a non-Draft work status and press `Submit request`, validating requester-form requirements. For shared work, use the same Action center with `Apply status`. Do not add a status-picker popup or duplicate Submit button in the form footer. Field saves remain separate from status changes.
- Users choose work statuses manually, may skip/backtrack work stages, and may reopen completed work. Record who changed the status, when, and the before/after values.
- Every authenticated role may change the work status of every non-Draft request. Do not limit shared-work status changes by requester ownership or PSF department; private Draft access is the explicit exception.
- All Requests exposes all non-Draft requests to authenticated users. Dashboard shows only non-Draft requests related to the current user. My draft is the separate owner-only preparation area.
- Setup Owner Dashboard scope is approved as work they created plus work assigned to their PSF department. Use the union of those sets and deduplicate by request ID; a request belonging to both sets is still one request. Do not restrict the queue to an individually named owner or expose Drafts through department membership.
- Every authenticated role may edit requester information on any shared non-Draft request. Only the creator edits/submits their private Draft. Setup Owners must be able to create requests themselves.
- PSF Created Information editing remains backend-authorized for the PSF team at every status, including Completed; reopening is not required merely to edit PSF data. Global request/status permissions must not grant PSF editing to a requester.
- PSF team members see both Requester Information and PSF Created Information on shared work requests at every work status, and on their own private Drafts, including when the same Setup Owner creates and performs the PSF work. They cannot access another user's private Draft. After enforcing Draft privacy, backend-authorized PSF team access takes precedence over requester identity; creating a request does not downgrade a PSF team member to requester-only visibility. Do not add assigned-worker checks or role switching merely to implement this visibility distinction.
- Every PSF edit, including a Completed edit, must record the actor, time, and meaningful before/after changes in audit history, atomically with the saved data. Reuse the existing PSF audit path rather than adding a second audit mechanism.
- Requester-only users without PSF team access wait for a configured work-status trigger to see PSF Created Information. Once a request reaches the trigger and access is released, this visibility stays unlocked after subsequent work-status changes, including backtracking. Preserve release as per-request state; do not recompute it from the current status, percentages, catalog order, or a renamed/deleted trigger. Preserve existing Admin PSF access on otherwise accessible requests, without bypassing another user's Draft privacy.
- Existing database records are test data. The user permits deleting old test data and creating fresh fixtures instead of migrating legacy current statuses. This is permission for the eventual reset, not a request to execute deletion during this planning-only phase. The exact database and reset scope must be identified before destructive execution.
- Deleting a used status opens a replacement dialog. Move current requests to the chosen replacement and remove the catalog entry, without retaining an inactive status entry solely for those current requests.
- Preserve historical audit labels and events during ordinary catalog operations. Removing a catalog entry does not erase or rewrite evidence of earlier status changes. Explicit deletion of old test requests and their linked test history is the approved reset exception.

## Initial Status Names — Preserve Verbatim and in Supplied Order

```text
Draft
5% -- Reject (Information not complete)
10% -- Test Engineer Data Entry
20% -- PSF File Creating
30% -- Compare Old and New layout
40% -- Feedback Requester(Layout mismatch)
80% -- Wait for create DCC
81% -- Edit Template Map (Bin62)
82% -- Wait for sent Template Map
83% -- Complete Excel probe pattern
85 % -- Reject check list
90% -- Wait for buyoff check list
93% -- Provide test template map to EWFM\Update auto FI script (ST Fab)
95% -- Reject (Wrong site location and wafer map)
99% -- Wait requestor Buyoff site location and wafer map
100% -- Completed
0% -- Rejected (Cancel Request)
```

Do not normalize `85 %`, the backslash, spelling, capitalization, or internal spacing without explicit approval.

## Verified Current-Code Gaps

- `backend/src/admin/workflow_transition.service.ts` fixes seven non-Draft statuses and validates every directed role/department transition. Its existing `workflow_transition_config` table already stores JSONB settings.
- `frontend/src/components/AdminWorkflowTransitionPage.tsx` edits the role/department transition matrix, not the status catalog.
- `RequestsService.queryRequests` forcibly scopes requester-role users to their own identity; `assertCanAccessRequest` also rejects another requester's request. All Requests visibility is therefore not yet the proposed global-access policy in this backend.
- `RequestsService.updateDraftRequesterData` rejects every non-Draft status and excludes Setup Owners. Request creation/submission guards also need alignment for Setup Owners.
- Requester saves presently use form-version checks, not a full data-revision token, and the Draft save path does not refresh submitted canonical/search projections.
- `getServerRequesterIdentity` derives identity from the acting requester. Reusing that behavior for cross-request editing would incorrectly replace the original requester with the editor.
- PSF saves authorize Setup Owner/Admin; Setup Owner is blocked at `Completed`, while Admin is not. Requester PSF visibility and required-field validation reference the old `PSF Created`/`Completed` names.
- Status updates currently assign the acting Setup Owner as the request's owner. Under global manual status changes, changing a status must not silently take ownership.
- Dashboard filters and summary cards contain role-specific and old-status-name assumptions. Request metadata, search, synchronous Excel, and worker Excel must agree after edits and catalog changes.
- Current `DashboardPage` fetches only the first 100 list results and computes card totals from that subset. Its waiting/progress cards match old literal statuses; its overdue card does not exclude closed work. These need correction before counts are presented as totals for the approved related scope.
- The current browser session is unauthenticated: only the dashboard layout/error/empty state was visually inspected, not populated Setup Owner data. It shows zero summary cards and an empty-result message alongside an authentication failure; an error must not be represented as a successful zero-work result.
- Request and search-index status columns are already TEXT. This feature does not need a new numeric progress column or a wider VARCHAR migration.

## Proposed Defaults — Not Yet Product Approval

- Catalog administration remains Admin-only. Permission to change a request's status does not imply permission to rename/delete the global catalog.
- Protect the system `Draft` entry from rename/deletion. It is a preparation state, not a work-stage destination or replacement for an existing work status. Never allow a submitted request to return to Draft; the user has confirmed this boundary.
- Reuse JSONB workflow storage for catalog entries and small semantic references; do not introduce a new request status-ID column merely to support naming.
- Rename updates current request/search labels in one transaction while preserving historical audit text, requester identity, ownership, and business timestamps.
- Save edits without automatically advancing/reverting status. Keep the request's captured requester/PSF schemas, rather than switching to newly published form definitions.
- Add optimistic revision checks to requester saves, status changes, and catalog writes, reusing the existing microsecond `updatedAt` pattern. Keep PSF conflict protection.
- Define completion/cancellation behavior by catalog identity or explicit semantic designation, not by parsing percentages or matching arbitrary display-name fragments. A stage containing `Reject` is not automatically a cancelled request.
- Proposed visibility setting: select the PSF requester-visibility trigger from the same status catalog using an existing/native select control. Reference the immutable catalog identifier so rename preserves the trigger. Deleting that referenced entry must explicitly resolve its trigger reference rather than leave an orphan configuration; selecting another trigger or otherwise changing the policy requires an explicit, audited action. No general automation/rules engine is needed.
- Proposed release storage: use one nullable per-request release timestamp, set on first entry to the configured trigger in the same transaction as the status change and audit event. Reuse an existing column only if its semantics match requester release exactly; do not overload the separate PSF creation timestamp. This minimal schema addition remains subject to implementation approval. Configuration changes affect future release events, not previously released requests; no automatic retroactive grant or revocation is implied.
- Enforce private Draft ownership first, then resolve PSF visibility using existing backend team/Admin authorization; requester-only users use the stored release state. A PSF team member remains authorized on accessible records even when also the request creator. Do not infer ownership from display-name equality, require a new assigned-worker permission, or downgrade creator-specific PSF authorization.
- Required omission is allowed only while Draft; invalid nonempty field types/choices/dates remain invalid even in Draft. Validate the effective saved form against its own captured required-field rules: requester requirements on first submission/requester saves and PSF requirements on non-Draft PSF saves. This form-scoped boundary is approved, not an open question.
- Submission selection never writes or submits by itself, and no work status is silently chosen as a default. Apply the approved single-Action-center flow in the product contract; do not add a second submission path.
- Keep partial-save semantics on initial `Save draft` and do not force publication. Reject or explicitly resolve unsaved form edits before a status/submission action; do not silently discard changes or submit older saved values as if they were current inputs. Reuse existing form dirty-state and navigation patterns rather than introduce a new state manager.
- Proposed reset scope: old test requests, their request-linked audit/search/canonical projections, and obsolete workflow settings. Preserve users, roles, form definitions/versions, autofill rules, and unrelated administrative/authentication logs by default. Confirm the exact target and dependent tables before deletion; do not implement an automatic startup reset.
- Recreate fresh test requests across the new statuses and actors after the bounded reset. Do not build legacy-status migration, mapping dialogs, or compatibility adapters for data the user has explicitly permitted discarding. The ordinary used-status replacement dialog remains required for future data.

## Dashboard Usability — Approved Bounded Scope

The user approved the following bounded dashboard changes together with Status Management and explicitly requested another scope summary before implementation. Use existing CSS, list/table, and native controls; do not interpret this as permission to start coding or perform a full redesign. No charts, Kanban board, inline status editing, or new dependencies.

- Default to related open work, with a clear option to include completed/cancelled work. A Setup Owner can switch between `Related work`, `Created by me`, and `PSF department work`; all subsets remain server-enforced and exclude Draft.
- Replace old literal-stage summary cards with the approved useful small filters: `Open work`, `Overdue`, and `Completed`. Clicking a card filters the queue without navigating to an unscoped global list. Use proper keyboard/focus semantics, not click handlers on noninteractive sections.
- Reuse existing keyword/status filtering above the queue and resolve status choices from the catalog. Show the active filters and a clear reset action; do not derive next-actor responsibilities or completion from percentage text.
- Keep rows task-oriented: request number/product, readable full status, requester/department context, due date when actually available, and an existing detail link leading to Action center. Distinguish work created by the actor from department-assigned work; both may apply to the same row. No additional workflow/assignment engine is implied.
- Query accurate counts for the complete approved server-side scope, not only the loaded page. Keep totals, pagination, filters, and deduplication consistent. Overdue applies only to open work with a real due date, using approved date semantics; closed work must not be marked overdue.
- Separate loading, empty results, expired authentication, and query failures. On failed loading, provide an appropriate login/retry path instead of displaying authoritative zeros and `No requests`.

## Delegation Policy — Routing Verified, Implementation Approval Pending

- **Coder:** exact verified model ID `gpt-6-luna-900k`, provider `openai-codex`, reasoning effort `high` by default. Hime may select `max` upfront for genuinely difficult units: transactional catalog replacement/trigger release, concurrent edits, or private-Draft/PSF permission boundaries. Routine navigation, form wiring, filters, and visual changes remain `high`. Unclear product requirements are escalated, not guessed by spending more reasoning.
- **Reviewer:** exact verified model ID `gpt-6.1-sol`, provider `openai-codex`, reasoning effort `high`, in an independent context. Review against the approved contract first, then code/security/data integrity quality; require concrete file locations, evidence, and a clear verdict. Review is read-only for application source; fixes return to the coder and are re-reviewed. No silent reviewer effort/model substitution.
- **Hime:** Keep the current primary model unchanged. Own scope, task decomposition, API/interface agreements, effort selection, handoff evidence, revision routing, integration checks, and final acceptance. A coder's completion report is not acceptance.
- **Execution discipline:** Parallelize independent work when interfaces and file ownership are explicit. Use isolated worker worktrees for concurrent implementation, never multiple writers on a shared dirty checkout. Shared files/dependent steps stay serialized; do not run reviewers against a moving diff. Group work into meaningful deliverables rather than launching agents for every tiny edit. Use focused checks per revision and canonical integrated checks at the final gate; do not eliminate spec/quality review to save tokens.
- **Actual routing:** The active native `delegate_task` schema has no per-task model/effort override. For task-scoped routing, use isolated Hermes CLI runs with explicit provider/model/reasoning flags, rather than changing shared `delegation.*`, auxiliary review, worker-profile, or primary-model settings. The local CLI supports `--model`, `--provider`, and session-only `--reasoning high|max`. Writing these names in a prompt or plan is not a model configuration.
- **Completed routing preflight:** Synthetic real API calls succeeded for Luna-900k/high, Luna-900k/max, and Sol/high. Read-back of session storage confirmed the exact model IDs, enabled reasoning with the requested effort, provider `openai-codex`, one API call and zero tool calls per check, and the exact assistant response `ROUTE_OK`. Evidence: `/opt/data/cache/scratch/status-model-routing-smoke.json`; sessions `20261001_081932_c23181`, `20261001_081942_0a72c6`, `20261001_081951_e5297c`. This verifies routing/configuration, not coding quality or full 900k-token context capacity. Normal project rules remain enabled for real implementation/review runs.
- **Current state:** Only the explicitly requested synthetic routing checks have run. No implementation/review work has started, no worker worktrees have been created, no shared configuration has changed, and implementation/database-reset authorization is still withheld.

### Proposed Parallel Work Sequence — For the Next Approval

1. **Hime preflight:** Freeze catalog/status API payloads, request permission flags, revision tokens, list scopes, and first-submission/trigger rules before dispatch; give both lanes the same approved contracts and explicit file ownership. Confirm the authorized test-data reset target before any destructive or live fixture action.
2. **Parallel coding lanes:** Backend coder uses Luna-900k/max for catalog transactions, Draft privacy, requester/PSF validation, release/audit/concurrency, and server-side Dashboard scope/totals; it owns `backend/**` only. Frontend coder uses Luna-900k/high for Admin status UI, My draft/navigation, form/Action-center wiring, API client, and bounded Dashboard improvements; it owns `frontend/**` only. Hime owns shared root documentation and integration. Frontend Draft and Dashboard edits remain one lane because they share RequestsWorkspace/API/CSS; do not split them into competing writers.
3. **Parallel stable review:** Once a lane hands off a frozen diff, Sol/high may perform its spec review and then quality review while the other independent coding lane continues. A contract change pauses dependent work and is reconciled by Hime. Findings return to the appropriate coder and a frozen revision is re-reviewed.
4. **Sequential integration gate:** Hime integrates reviewed changes into the canonical rapid worktree, runs canonical integrated checks and authorized end-to-end/privacy/export/concurrency scenarios, then obtains a final Sol/high integration verdict. Database reset/seeding, shared runtime startup, and final Git operations are coordinated only by Hime, not concurrent worker side effects.

## Change Groups and Acceptance Gates

### 1. Catalog, Status Management UI, and Safe Rename/Delete

**Files:** `backend/src/admin/workflow_transition.service.ts`, `workflow_transition.controller.ts`, their tests; `frontend/src/components/AdminWorkflowTransitionPage.tsx`, its existing tests; `frontend/src/services/api.ts`, `api.test.ts`, and scoped CSS in `frontend/src/index.css`.

**Interfaces:** Existing `/api/admin/workflow` management and `/api/workflow/statuses` reading are the starting points. Keep authenticated status reading available to all roles and management writes Admin-only under the proposed default. Document any changed response/payload instead of silently ignoring old transition-matrix writes.

- [ ] Replace the fixed transition matrix with a simple status list using existing page/dialog primitives.
- [ ] Add create/rename/delete actions; validate names, duplicates, identities, and reserved Draft before writing.
- [ ] For used-status deletion, show affected request count, require a different valid non-Draft work-status replacement, and support Cancel with no side effects. Preserve reserved Draft and do not use replacement to turn shared work into a private Draft.
- [ ] Perform replacement, search updates, per-request audit events, and catalog deletion atomically. Recheck references under lock; concurrent new uses must not leave orphan labels.
- [ ] Replacement obeys the same domain validation as a normal status change; bulk deletion must not bypass completion/required-field rules. Rename must not simulate a business transition or reset timestamps.
- [ ] Replace hardcoded client dropdown/filter/badge status lists with the catalog. Preserve literal labels and readable long-status rendering on desktop/mobile.

### 2. Shared Work Access, Private My draft, Manual Status Changes, and Related Dashboard

**Files:** `backend/src/requests/requests.service.ts`, `requests.controller.ts`, `search-index.service.ts`, associated tests; `frontend/src/components/RequestsWorkspace.tsx`, `RequestsWorkspace.test.tsx`, `DashboardPage.test.tsx`, `navigationState.ts`, `NavSidebar.test.tsx`, API types/tests. Create `frontend/src/routes/my-drafts.tsx` as a thin file route using existing request-list/table UI. Reuse `NavSidebar.tsx` rendering unless an actual required behavior is missing; regenerate router output through the existing build tooling rather than manually editing generated routes.

**Interfaces:** Preserve ordinary request routes and authenticated-session resolution. Proposed list query distinguishes `all`, `related`, and `my-drafts` scope: `all`/`related` exclude Draft; `my-drafts` is Draft plus the authenticated creator's user ID. Ownership and related membership are enforced on the server, never by a spoofable display-name or caller-supplied owner filter.

- [ ] Allow every authenticated role to list/read every non-Draft work request and change its valid work status, including backward changes from completed work but never back to Draft.
- [ ] Add My draft immediately below All Requests for authenticated roles, using owner-scoped Draft results and existing list/table styling. Read own Drafts from existing request storage; do not add them to the shared work index solely to reuse the UI.
- [ ] Enforce Draft privacy at common backend read/mutation boundaries and in lists/counts, history/search/export responses. Knowing another Draft's ID, using an Admin/PSF role, or altering query scope/owner parameters must not expose or mutate it. Apply ownership to Draft save, first submission, and schema upgrade as well as direct detail reads.
- [ ] First submission moves the same record from My draft to shared work atomically; invalidate the relevant existing list/count caches after success. Reuse existing submission logic for required/schema checks, request-number allocation, submitted timestamps, and projections. A generic status-change API must not bypass that lifecycle when leaving Draft. Validate the approved required boundary and reject stale/racing saves or double submission.
- [ ] Implement the approved single-Action-center UX: Save draft opens its saved detail; Draft uses explicit target selection plus Submit request; shared work uses Apply status; remove the duplicate footer Submit. Test that selecting without applying causes no writes, missing required fields keep the record private, unsaved edits are not discarded, and successful submission removes it from My draft without creating a duplicate.
- [ ] Dashboard uses the approved non-Draft related scope for Setup Owners: actor-created work UNION PSF-department-assigned work, deduplicated by request ID. Own Drafts belong only in My draft, not operational totals. Do not add an individually assigned-only restriction.
- [ ] Separate status changes from automatic owner reassignment. Preserve original requester and existing assignment unless an explicit assignment action changes them.
- [ ] Reuse request transactions, audit logging, search upserts, and server validation; retain 401 for unauthenticated access and conflict handling for stale revisions.
- [ ] Update existing dashboard counts/filter semantics so renamed/new status labels do not silently yield zero or incorrect totals. Do not redesign unrelated dashboard layout.
- [ ] Apply the approved bounded dashboard usability scope: related/created/department views, default open-work queue, clickable open/overdue/completed filters, keyword/catalog-status filters, task-oriented detail links, accurate server-scoped full totals, and distinct loading/empty/authentication/error states. Test deduplicated related membership, exclusion of Draft/closed-overdue cases, counts beyond the loaded page, filter interactions, and keyboard navigation.

### 3. Request Creation and Requester Editing Beyond Draft

**Files:** `backend/src/requests/requests.service.ts`, `requests.controller.ts`, `autofill.controller.ts`, request/audit/search tests; `frontend/src/components/ActiveSchemaForm.tsx`, `activeSchemaFormState.ts`, existing interaction/autofill tests; `AppShell.tsx`, `navigationState.ts`, `routes/requests/new.tsx`, API types/tests.

**Interfaces:** Generalize the existing requester-data save route instead of adding a second form/editor. Extend the save payload with the existing request-revision token. Ordinary autofill lookup follows the newly authorized editors; administration of autofill rules remains outside this work.

- [ ] Allow Setup Owner request creation and show the existing Create Request controls to every authenticated role.
- [ ] Permit requester-field saves by every authenticated role on shared non-Draft requests; only the creator may save their private Draft. Use the record's captured schema and require the configured required fields on non-Draft form saves.
- [ ] Keep original requester identity immutable when another user edits. Record the editor separately in audit history.
- [ ] Validate supplied field types/choices/dates even for Draft saves; permit missing required fields only in Draft. Enforce requester-form required fields on first submission and non-Draft requester saves, independently of PSF-form requirements. Do not silently auto-upgrade old snapshots or require requester-only users to fill inaccessible PSF fields.
- [ ] Update request values, denormalized metadata, submitted canonical values when applicable, and search projections together, so filters/dashboard/Excel do not show stale data.
- [ ] Record meaningful before/after field edits and reject stale concurrent saves instead of accepting last-writer-wins overwrites.
- [ ] Save does not change status automatically or pretend a post-Draft record is a Draft. Update UI messages and refresh the existing detail shell after a save without discarding other unsaved fields.

### 4. PSF Policy, Fresh Test Data, Export, and Integration

**Files:** `backend/src/requests/requests.service.ts`, `search-index.service.ts`, `backend/src/export/excel_export.service.ts`, audit service/tests only as needed; existing PSF panel, history labels, related API/types/tests; scoped domain documentation.

- [ ] Preserve backend PSF editor authorization after Draft ownership checks and remove the Completed-only edit restriction for authorized PSF editors. Only Draft permits saving missing required fields; non-Draft PSF form saves validate the captured PSF required fields. Every save, including Completed saves, records actor/time/before-and-after changes through the existing transactional audit path. Apply requester required validation on first submission, plus PSF required validation whenever the chosen target is the configured visibility trigger.
- [ ] Update PSF readiness/required/completion policies, timestamps, UI flags, and synchronous/worker export masking consistently; do not infer readiness from a percentage string.
- [ ] Implement the configured status trigger as a persistent per-request release for requester-only users; backend-authorized PSF team/Admin access does not wait for this trigger. Set release only once, atomically with a triggering status change and audit event; ordinary field edits must not release access. Enforce the same visibility decision on API response data, PSF field values in history/audit responses, and synchronous/worker Excel as on the UI; hiding the panel alone is insufficient. Test before trigger, first/repeated entry, leaving/backtracking, trigger rename/deletion, configuration changes, and the same Setup Owner creating and editing PSF on their own request before release and at Completed.
- [ ] Reuse the existing snapshot-based PSF required validator at the shared trigger-entry boundary for status-only changes, initial submission, and bulk replacement. Test missing required data rejection without status/release/projection updates or a successful-transition audit event; valid complete data allows the transition and one-time release atomically. Test both first and repeated trigger entry and verify that unrelated initial work statuses do not require PSF completeness prematurely.
- [ ] Identify the exact test database/schema, request-related dependencies, and counts with a read-only preflight. Confirm the bounded reset target/scope and shared-runtime effects before destructive execution; retain a recoverable backup or equivalent rollback checkpoint.
- [ ] Delete only the approved test records and dependent projections/history in one transaction, replace obsolete workflow settings with the new catalog, and verify the reset. Do not truncate unrelated configuration or disable integrity checks; no legacy-status migration is needed.
- [ ] Seed fresh fixtures covering different creators, PSF departments, new work statuses, Completed PSF edits, field-level audit trails, and concurrent changes. Verify read-back counts, catalog labels, and isolation from preserved configuration. Keep reset/seeding explicit, not automatic on startup.
- [ ] Exercise owner-private incomplete Draft saves, forbidden foreign-Draft access across roles and API/history/export paths, My draft nav order and list isolation, required-field failures without writes on non-Draft saves, first submission moving the same record, forbidden return-to-Draft including bulk replacement, trigger release, simultaneous edits/status changes, Setup Owner creation, old snapshots, and Excel round-trips with focused RED-to-GREEN checks.
- [ ] After integration, run canonical backend unit/e2e/lint/build and frontend test/lint/type-check/build plus `git diff --check`. Separate pre-existing out-of-scope lint findings from new ones.
- [ ] Use one bounded independent spec gate and one final quality gate, not new review lanes for every text tweak. Live write tests need explicitly authorized isolated fixtures and cleanup.

## Open Product Decisions — Implementation Gates

**Settled checkpoint:** Initial submission UX is approved as a single Action center, with explicit work-status selection and no status-picker popup/duplicate footer Submit. Form-scoped required validation, private My draft, no return to Draft, persistent requester release, and PSF-team access on shared work/own Drafts are also settled; do not re-ask these decisions.

1. **Test reset scope:** Legacy mapping is no longer needed. Before the approved future reset, identify the exact database/schema and confirm whether the proposed request-only reset with preserved users/forms/autofill configuration is the intended boundary. The planning-only approval gate still applies; no deletion has been executed.

**Additional settled checkpoint:** Setup Owner related scope is creator work plus department-assigned work; the bounded dashboard work-queue/filter/card improvements are approved. The latest instruction remains to summarize first and not begin implementation.
- PSF required validation at the visibility-trigger transition is now approved, including status-only changes. Implement the gate before any status or release write; do not re-ask this policy. This confirmation does not authorize starting implementation or resetting the database.


## Scope Cuts and Current Delivery State

- No implementation code, schema migration, live-data mutation, runtime restart, model setting change, or local-auth sync is authorized by this planning step.
- No automatic percentage progression, new workflow framework, new dependency, status drag-and-drop, or unrelated Autofill Rules rewrite.
- This document is ready for scope review, not execution. Resolve product gates and approve the final scope before creating executable coding tasks. Commit/push/sync instructions must be agreed for that implementation phase.

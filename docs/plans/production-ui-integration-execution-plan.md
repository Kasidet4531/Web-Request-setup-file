# Production UI Integration Implementation Plan

> **For agentic workers:** Use the `executing-plans` skill for approved execution, one task at a time. Subagent execution requires separate authorization and a verified non-Astra/non-shared-quota model; this plan does not authorize delegation. Checkboxes describe future work, not completed implementation.

**Goal:** Integrate the selected prototype UI/UX into the existing API-backed application without replacing its domain boundaries or versioned-form architecture.

**Architecture:** `Web-Request-setup-file/frontend` remains the **sole production frontend**. `UI_Web_Setup_file` supplies visual and interaction references only. The existing backend remains authoritative for identity, authorization, workflow, validation, numbering, timestamps, audit and persisted form versions.

**Tech stack:** Existing React, TanStack Router, TypeScript, Vite, native HTML/CSS and Lucide frontend; NestJS/Express, express-session, PostgreSQL/pg, ExcelJS backend; existing Vitest, Jest and Supertest checks. No new frontend framework, state library, form engine, microfrontend, BFF or shared UI package is planned.

## 0. Authorization, evidence and execution boundaries

This document is a plan, not authorization to implement or deploy. Its creation and this completeness-review revision are the only permitted repository writes. No implementation, source/test/configuration/ADR modification, branch creation, commit, staging, issue creation or deployment is part of this planning operation.

### Evidence reused

This plan preserves the completed audit/backlog evidence in the persistent baseline below; access to the original conversation is not required:

- Main audit snapshot: `072e41019904b64a459904d739fb820b9664b9bf`, `/opt/data/Web-Request-setup-file`.
- Prototype reference: `0a71ea6e756995deac84ee225d3d28514e6d96ed`, `/opt/data/repos/UI_Web_Setup_file`.
- The audit found a substantial production-oriented main frontend, not merely a backend-test scaffold.
- Existing API/form/session/workflow/export behavior is retained unless a task explicitly changes it.
- The prior audit reported successful isolated frontend/backend checks and prototype build/helper checks. These are historical evidence, not execution results for this plan, not live deployment proof, and not release acceptance.
- Planning-only lookup was limited to exact package scripts, test/service/route filenames and write-scope verification. No new repository audit was performed.
- Findings labeled CONFIRMED in the audit remain source or scoped-test findings. Request-number concurrency impact was LIKELY; real PostgreSQL concurrency, deployment topology, LDAP behavior and active production schema/data remain unverified.

### Persistent execution baseline (B0)

This is the minimum handoff record, not a claim that known defects are fixed. References below are relative to the main repository at `072e41019904b64a459904d739fb820b9664b9bf`; prototype references use the separately pinned SHA above. A narrow lookup during this revision confirmed only missing permission/API facts at the same main HEAD; no new repository audit or runtime verification was performed. At execution, read the named touched symbols/callers; if the workspace differs, record the relevant drift and stop only the affected contract, not restart the audit.

**Runtime/data authority:** Main React/TanStack frontend is already API-backed. LDAP authenticates; the local profile supplies `requester`, `setup_owner`, or `admin` authorization. PostgreSQL is authoritative for request data, snapshots, workflow, numbering and audit. Requester forms use persisted snapshots and explicit draft upgrades. PSF currently uses `PSF_CREATED_INFORMATION_SCHEMA`, not a configurable second form engine. Owner association is not exclusive queue assignment. Existing admin editors manage local users, transitions, autofill and schema JSON; the export-profile page is an export consumer, not profile CRUD.

**Current permission matrix — preserve until a named decision approves a change:**

| Operation | requester | setup_owner | admin | Source / change gate |
|---|---|---|---|---|
| Request list/detail/request history | Own requests only | Shared accessible population, no exclusive owner claim | Accessible population across requesters | `requests.service.ts`: `queryRequests`, `getRequestHistory`, `assertCanAccessRequest`; D01 for changes |
| Create/save requester draft; explicit upgrade; submit | Own request, existing state/version guards | Denied | Allowed subject to existing state/version guards | Same service: `assertCanCreateDraft`, `assertCanEditRequesterData`, `assertCanSubmitDraft`, mutation callers |
| Requester-data edits after submission | Denied by Draft-only write path | Denied | Denied by same Draft-only write path | `updateDraftRequesterData`; D01/D03/D04 must approve any relaxation |
| PSF detail visibility | Only in `PSF Created` or `Completed`, within own-request scope | Visible | Visible | `canActorViewPsfCreatedData`, `mapRequestRow`; search/export must enforce corresponding privacy, not assume detail masking suffices |
| PSF writes | Denied | Subject to server state/editability and concurrency checks | Same state/editability and concurrency checks | `assertCanEditPsfCreatedData`, `updatePsfCreatedData`, returned `canEditPsfCreatedData`; D03/D04 |
| Status mutation | Only targets authorized by current server transition policy and request access | Same server policy, shared queue | Same server policy | `getAllowedStatusTransitions`, `updateRequestStatus`, `workflow_transition.service.ts`; D03, never hard-code targets from this table |
| Global History | Denied | Denied | Allowed | `backend/src/audit/audit_log.controller.ts`; D01 expansion |
| Local user / workflow / autofill / schema management | Denied | Denied | Allowed subject to existing validation/last-admin safeguards | `backend/src/admin/{user_management,workflow_transition,autofill_rule,form_schema}.controller.ts` |
| Export initiation/status/download | Eligible under current scope/masking; job ownership required | Denied | Eligible; job ownership required | `backend/src/export/export.controller.ts`: `getExportActor`, status/download handlers; known stale-privilege defect remains T02/T04, D01/D07 govern changes |

Anonymous requests cannot gain protected API access. Request-controller identity comes from session `userId` followed by fresh `authService.getProfile`, not submitted role/actor fields (`requests.controller.ts:getAuthenticatedActor`). This matrix is a current contract, not evidence that every endpoint is secure: direct-API regression assertions must cover anonymous, other-requester, unauthorized role, hidden PSF reads/filter inference, forged authority fields and current-role revocation on touched surfaces. Preserve safe 401/403/404 distinctions without leaking protected metadata. Admin/route hiding is not enforcement.

**Critical API contracts (retain exact tokens):**

- Existing request routes under `/api/requests`: `POST /` create, `GET /` list; `GET /:requestId`, `GET /:requestId/history`, `GET /:requestId/status-options`; `PUT /:requestId/requester-data`, `POST /:requestId/upgrade-schema`, `POST /:requestId/submit`, `PUT /:requestId/psf-created-data`, `PUT /:requestId/status`. Source: `backend/src/requests/requests.controller.ts` and DTOs in `requests.service.ts`; frontend consumer: `frontend/src/services/api.ts`.
- List identity is `requestId`; detail identity is `id`. UUID links do not become request-number URLs. List uses server `limit`/`offset`/`total`; no browser all-record filtering. `/api/requests/summary` is proposed by T12, not existing baseline.
- Form key is `psf-request`; status strings include exactly `Draft`, `Setup In Progress`, `Need More Information`, `Submitted`, `PSF Created`, `Completed`. Do not treat this illustrative list as a new complete status catalog; server options remain authoritative.
- Draft save sends `formVersion` and `requesterData`; positive integer version validation already exists. Preserve submit/upgrade DTOs from the cited service rather than inventing a new body. Detail carries `schemaSnapshot`, `formVersion`, `psfCreatedInformationSchema`, `psfCreatedDataVisible`, `canEditPsfCreatedData`, and `updatedAt`.
- PSF write body uses `psfCreatedData` plus the **unmodified** detail `updatedAt` string as `expectedUpdatedAt`; preserve microseconds. Status body is `{status}`; actor is resolved server-side. T07/T23 must not silently add a client concurrency field without an approved additive contract.
- `/api/me` is the existing frontend session seam (`frontend/src/services/auth-session.ts`, `services/api.ts`); 401 invalidates protected state, 403 is not logout. Login stays LDAP-backed; no prototype persona authentication.
- `GET /api/requests/export.xlsx` returns XLSX or `202` with `id`, `status`, `statusUrl`; existing job reads are `GET /api/requests/export-jobs/:jobId` and `/download`. Source: `export.controller.ts`. Preserve API-relative URL handling and current default `>2000` async boundary until D07 approves a change; do not substitute client CSV.
- Date-only business values must not be silently shifted by parsing them as instants. D02 must approve Bangkok day boundaries, inclusive filters, terminal exclusions, display timezone and workbook native-date interpretation with before/at/after-boundary tests. Concurrency timestamps are opaque independently of display formatting.

**Known safety findings retained from the plan/audit, with task-owned references:**

| Finding / evidence limit | Owning correction and source |
|---|---|
| Mounted protected frontend can remain stale after logout/401 | T03; `AppShell.tsx`, `auth-session.ts`, `api.ts` and their listed tests |
| Completed artifact and queued worker can retain stale export privileges | T02/T04; `export.controller.ts`, `export-job.repository.ts`, `export-job.processor.ts`; must fail closed, not expand eligibility |
| Production session secret/store/proxy behavior remains unverified | T05; `backend/src/main.ts`, `auth.controller.ts`; actual D06 TLS/store/LDAP evidence required |
| Payload shape validation and same-status mutation need correction | T06/T07; `requests.service.ts`, `requests.controller.ts`, `auth.controller.ts`; V06/D03 gates below |
| Count-based draft numbering has likely concurrency impact, not proven production incident | T08; `nextDraftRequestNo`, `createDraft`; real PostgreSQL proof required |
| Draft/PSF projections, page-derived counts and detail coordination are incomplete | T09–T15; request/search services and `RequestsWorkspace.tsx`; privacy/backfill/large-population tests required |
| Schema mapping, action-only history, workflow and export lifecycle need approved scope closure | T18–T23/T26–T29; task cards specify affected symbols and tests; no historical diffs may be invented |

B0 plus the task cards and §9 are the durable audit handoff. Do not require unavailable chat citations for T01, claim mock tests prove deployment, or rewrite historical data to make the baseline appear clean.

### Global constraints

1. Never import prototype `AppContext`, mock data, state router, client authentication, generated audit, numbering, simulated files, client export authorization or autofill algorithm.
2. Preserve exact API identifiers: `Draft`, `Setup In Progress`, `Need More Information`; `psf-request`; list `requestId` versus detail `id`. Do not convert production DTOs into prototype models.
3. Preserve requester schema snapshots and explicit draft upgrade. Preserve the exact `expectedUpdatedAt` string for PSF optimistic concurrency; do not reserialize through `Date`.
4. Backend enforcement is mandatory even if frontend routes/buttons are hidden. The audited allow-all guard placeholders are not authorization implementations.
5. Keep the shared setup-owner queue. Do not introduce exclusive assignment or infer permissions from owner association.
6. No mass schema rewrite, identifier rewrite, mock data seeding, historical audit fabrication or destructive rollback.
7. One implementation task normally becomes one PR. SMALL means a narrow behavioral/presentation change; MEDIUM means a cohesive cross-layer contract or data change. If a task grows to LARGE, stop at architecture review and split it before coding.
8. Before editing during later implementation, read the touched flow and all callers, locate the smallest shared correction and add a regression that fails first. This is targeted execution discovery, not a repeat audit.
9. New filenames below are explicitly marked **proposed new**. Existing paths are relative to the main repository unless prefixed `UI:`. Do not create empty scaffolding in advance.
10. Independent review is required before merge/release. A coding worker hands off evidence as `blocked: review-required`, not self-completed. No automatic issue/PR/board actions are authorized by this document.
11. Parallel tasks require distinct authorized worktrees and non-conflicting writers. Within a shared worktree, serialize all writes. Do not launch duplicate agents or use the same Astra quota for parallel work.
12. Business/product ambiguities remain decision gates. Recommendations below are not silent approvals.

## 1. Decision register and architecture checkpoints

All decision records must identify the approver, selected behavior, affected tests and effective contract. T01 can record unresolved decisions without blocking unrelated security fixes. Existing permissions remain in effect until a decision explicitly changes them.

| Gate | Decision required; no assumed resolution | Blocks |
|---|---|---|
| D01 | Confirm role matrix: Setup Owner export access; Global History admin-only versus broader access; admin requester-data edits after submission. Existing endpoint restrictions remain unchanged meanwhile. | Permission expansion in T23/T26/T27 and D04; not T02/T04 revocation fixes |
| D02 | Define dashboard population/labels, open and overdue terminal exclusions, due-date comparison, Bangkok business-day boundary and list/export inclusive date behavior. Confirm owner all-status default in canonical docs. | T12/T13, dashboard T24; date semantics portion of T26 |
| D03 | Define Need More Information correction fields, actor, resubmit path and locking; PSF completion prerequisites; same-status request should reject or be a true no-op. | T07 and T23; unrelated status enforcement stays intact |
| D04 | Old-draft remain means editable-only or also submittable; approved cross-version mapping; PSF snapshot capture point and legacy representation; section visibility/editability policy. | T20/T21/T21R/T22 as applicable; existing old-draft submit restrictions remain until approved |
| D05 | Keep existing request-number appearance or change future display format; yearly allocation/reset semantics if required. Historical identifiers must not change. | T08 allocation design; UI never chooses numbers |
| D06 | Deployment owner supplies actual TLS/proxy topology, trusted proxy boundary, session lifetime/restart/logout requirements, persistent-store choice and test environment. Initial-admin startup upsert behavior must be explicitly accepted or separately corrected. | T05 configuration/store integration; T27 worker-recovery design; final production gate |
| D07 | Export revocation/retention contract: approved fail-closed artifact policy, lifetime, deletion obligations, stable dataset semantics, maximum rows/memory and threshold boundary. Current-role reauthorization is a safety requirement; exact invalidation representation is reviewed, not guessed. | T02/T04 architecture contract; T27–T29 scale/retention decisions |
| D08 | Audit visibility/redaction and which fields/actions require old/new values; reason/comment capture, if required. Never manufacture historical field diffs. | T18/T19 richer audit presentation; T23 only if new reason/diff metadata is required |
| D09 | Explicit funding/scope approval for attachments, export-profile CRUD, corporate directory administration, notifications, visual form builder or arbitrary statuses. | Deferred DEF01–DEF06 tasks only |

### Gate owners, timing and MVP manifest

No approval is recorded by this revision. **Product approver:** project owner/user or explicitly named delegate. **Technical/security approver:** independent reviewer named by that owner. **Deployment/DB owner:** operator nominated by that owner, never inferred from local shell access. **Visual approver:** product owner or named UI delegate. T01 records actual people/handles and evidence links in this document; an unassigned required owner blocks the affected task.

- D01/D02/D03/D04/D05/D08: product approver owns behavior; technical reviewer ratifies enforcement/data compatibility before the task listed in the register. D03 same-status choice can be approved separately for T07 without deciding the full correction workflow. D04 requester-upgrade mapping can be approved for T20 while PSF expansion remains deferred.
- D06: deployment owner plus security reviewer, before T05 configuration coding. Also approve worker count/topology, staging access, migration permissions, session-store schema initialization, production entry points and restart requirements.
- D07: product approver owns retention/dataset promises; security reviewer approves fail-closed artifact scope **before T02**, separately from scale/retention/recovery approval needed before T27/T28/T29. D06 topology is required for job-recovery design, not an unrelated T02 blocker.
- D08 governs T18/T19. AR4 is scoped: T18 needs approved audit/redaction behavior, not unrelated permission expansion or NMI decisions; T23 needs D01/D03 and D08 only if new reason/diff metadata is required.
- D09: product approver before any DEF01–DEF06 work. Unapproved deferred work stays absent.
- **MVP manifest, owned by T01:** record each T01–T30 task (T25a–e individually) as included, conditional or explicitly deferred with approver/reason and retained limitation. T02–T08 are mandatory G-SAFE for this visual migration; T30 and the applicable release/retirement gates cannot be silently deferred. T21/T22 may be deferred together; T21R follows AR3's compatibility choice. Every included task must have its dependency closure included. Subsequent scope changes require recorded approval; removal is not completion. DEF01–DEF06 remain outside MVP until separately authorized.
- **Coding start:** explicit implementation authorization, accepted T01/AR0 (T01 itself requires its scoped docs authorization), named task owner/reviewer, satisfied dependency row, approved applicable decisions and safe test environment. For storage-changing tasks, approve M below before coding; for visual work, also pass V16. Unrelated approved security work need not wait for later product decisions.

### V06 — Validation contract gate (before T06 coding)

Product approver and technical reviewer must approve a compact operation/fixture matrix in T01 or a coordinated T01 follow-up; unresolved rows block T06, not T02/T03. Do not decide stricter business rules implicitly in validation code.

| Write path | Contract that must be recorded and tested |
|---|---|
| Create/save draft | Distinguish incomplete required fields from malformed types/options/dates; decide allowed partial values and errors. New create uses the server-selected requester version; existing save uses the request's stored snapshot/version, not whichever schema was published most recently. |
| Submit | Define required completeness against the approved request snapshot; retain existing stale-version/old-draft submit restrictions unless D04 explicitly changes them. No partial submit or source-data mutation on rejection. |
| PSF write | Enforce actor/status/section boundary, supported types/options and exact optimistic token against fixed PSF schema until T21, then the approved PSF snapshot/legacy descriptor. Completion-only prerequisites belong to D03/T23, not an accidental draft-save rule. |
| Legacy-invalid values | Decide per operation whether unchanged old values can remain editable, require explicit user correction, or block submission; preserve original stored values and provide field-specific errors. No silent coercion, removal, re-mapping or mass cleanup; a rejected write leaves source/projection/audit unchanged. |

Fixtures must cover omitted/null/empty values, object/array-as-scalar, optional empties, old options/types, unknown authority fields, calendar-invalid dates and legitimate old/new payloads. Date-only versus instant parsing must be explicit; any changed business-day/filter policy additionally needs D02. Login shape validation happens before LDAP with no credential logging. Mapping/removal during T20 must preserve recoverable original data and surface unresolved conflicts, not use validation to discard them.

### Architecture-review checkpoints

- **AR0 — Baseline and contracts (T01):** ratify the sole-runtime decision, register ambiguities, preserve backend ownership and review task boundaries. No implementation authority is implied.
- **AR1 — Security boundary (before T02/T04/T05):** review current-actor lookup, downgraded export handling, no stale-role fallback, session storage/proxy trust and CSRF/origin assumptions of the actual deployment. Do not claim an unverified CSRF vulnerability; escalate only if the targeted design check finds a concrete gap.
- **AR2 — Read model (before T09/T10/T12):** review draft/PSF projection privacy, transaction boundary, idempotent backfill, the T10 concurrent-write contract, M sequencing and shared visibility predicates. No new read-model service layer just to avoid editing existing services.
- **AR3 — Versioned forms (before T20/T21/T21R/T22):** approve the applicable D04 subset, M sequencing, stable canonical mapping and server section partitioning; explicitly choose read-time legacy compatibility or persisted reconciliation via T21R. This checkpoint can reject PSF-schema expansion without blocking safe visual work.
- **AR4 — Workflow/audit (before T18/T23):** approve the applicable D01/D03/D08 subset described above and ensure actor/old/new capture is transactional and server-generated.
- **AR5 — Export scale and release (before T27/T29/T30):** agree measurable volume/retention budgets, supported downgrade/rollback versions and real-environment verification evidence. Streaming/dependency changes require concrete need.

## 2. File and ownership map

| Existing area | Responsibility retained | Planned task ownership |
|---|---|---|
| `frontend/src/services/api.ts`, `auth-session.ts`, `components/AppShell.tsx`, `routes/__root.tsx` | API/session boundary and mounted protected content | T03, T11–T13, T19, T22 |
| `frontend/src/components/RequestsWorkspace.tsx` | Dashboard, requests list, table, detail summary and workflow coordination | T11, T13–T17, T19, T23/T24; **one writer at a time** |
| `frontend/src/components/ActiveSchemaForm.tsx`, `activeSchemaFormState.ts`, `DynamicFormRenderer.tsx`, `types/forms.ts` | Requester version lifecycle, controls, validation presentation, autofill protection | T14, T17, T20/T22; preserve existing tests |
| `frontend/src/index.css`, `components/Navigation.tsx` | Shared styling and navigation | T03, T16/T17, T24/T25; serialize shared styling |
| `frontend/src/components/AdminFormConfigPage.tsx`, `AdminUserManagementPage.tsx`, `AdminWorkflowTransitionPage.tsx`, `AdminAutofillRulesPage.tsx` | Existing API-backed admin functions | T22/T25; no replacement by prototype state |
| `backend/src/auth/auth.service.ts`, `auth.controller.ts`, `backend/src/main.ts` | LDAP authentication, local role lookup, session bootstrap | T05/T06; no protocol rewrite |
| `backend/src/requests/requests.service.ts`, `requests.controller.ts` | Request commands, access, validation, snapshots, transitions | T06–T10, T12, T18/T20/T21/T23; **serialized domain lane** |
| `backend/src/requests/search-index.service.ts` | Search/list projection, scoped query/date predicates | T09/T10/T12/T26; shared writer lock |
| `backend/src/export/export.controller.ts`, `export-job.repository.ts`, `export-job.processor.ts`, `excel_export.service.ts` | Job ownership, export execution/content, server filtering/masking | T02/T04/T26–T29; serialized export lane |
| `backend/src/admin/form_schema.service.ts`, `workflow_transition.service.ts`, `backend/src/audit/audit_log.service.ts` | Schema publication, transition configuration, audit persistence | T18/T20/T21/T23 |
| `README.md`, `CONTEXT.md`, `psf_setup_file_web_application_spec_en.md`, `docs/adr/` | Canonical behavior and decisions | T01 and each affected future implementation PR; no docs changed during planning |
| `UI:src/app/pages/**`, `UI:src/app/components/**` at the pinned SHA | Visual/interaction reference only | Read-only reference for T16/T17/T24/T25; no runtime import |

No new production module is mandated except an approved session-store adapter if the existing runtime cannot provide one. New test files are created only where the audit's existing tests do not cover a real integration boundary.

## 3. Verification contracts used by every task

Run commands from `/opt/data/Web-Request-setup-file` in the later authorized implementation workspace. These commands are instructions, not checks executed when writing this plan.

**F — frontend regression/build/lint**

```bash
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
```

**B — backend unit/build**

```bash
npm --prefix backend test -- --runInBand
npm --prefix backend run build
```

**H — existing HTTP contract tests (mock-backed)**

```bash
npm --prefix backend run test:e2e -- --runInBand
```

**R — review scope**

```bash
git diff --check
git diff --stat
git status --short
```

`backend` lint contains `--fix`; neither it nor `format` is a read-only verification command. Do not silently substitute them for B/H. A task citing F/B/H/R requires each exact command above and a successful exit, plus its named assertions; no invented test totals.

**DB — real PostgreSQL integration:** T07 introduces the shared guarded harness and proposed `backend/test/form-version-lifecycle.e2e-spec.ts`; T08 introduces proposed `backend/test/requests-concurrency.e2e-spec.ts`; T10 introduces proposed `backend/test/request-projections.e2e-spec.ts`; T20/T21/T21R/T23 extend T07's lifecycle suite even if dynamic PSF is deferred; T27 introduces proposed `backend/test/export-consistency.e2e-spec.ts`; T30 introduces proposed `backend/test/production-ui-contract.e2e-spec.ts`. These extend existing Jest/Supertest, not a new framework. Each suite must require an explicit test-only `PSF_INTEGRATION_DATABASE_URL` (a proposed new test variable), reject unapproved targets before any connection/write, use a unique isolated schema/database, clean only that namespace, and fail its explicit integration invocation when configuration is missing. Ordinary H must remain usable without a live DB; document deliberate skips there, not as integration passes.

```bash
npm --prefix backend run test:e2e -- --runInBand --runTestsByPath test/requests-concurrency.e2e-spec.ts
npm --prefix backend run test:e2e -- --runInBand --runTestsByPath test/request-projections.e2e-spec.ts
npm --prefix backend run test:e2e -- --runInBand --runTestsByPath test/form-version-lifecycle.e2e-spec.ts
npm --prefix backend run test:e2e -- --runInBand --runTestsByPath test/export-consistency.e2e-spec.ts
npm --prefix backend run test:e2e -- --runInBand --runTestsByPath test/production-ui-contract.e2e-spec.ts
```

**Shared harness ownership:** T07 owns proposed new `backend/test/integration-db.ts` only if no existing guarded helper can be reused. All DB suites use that one target-validation/isolation/cleanup seam in existing Jest/Supertest; no per-suite frameworks or production test abstractions. T07 acceptance includes competing transitions (including same-target requests), committed-state revalidation, transaction rollback and atomic existing audit. T20 adds upgrade-versus-save and upgrade-versus-publish, preserved original draft data on conflict/failure, and unchanged submitted snapshots. T23 adds competing submit/correction/status/PSF-completion operations under its approved policy, with no partial data/projection/audit or unauthorized winning write. Use independent PostgreSQL connections and controlled barriers, not sleeps or mocked transaction calls. Assert committed results and denied/conflict outcomes after both operations settle. T21 being deferred never skips T20's real-DB gate.

T27 creates the export DB suite; T28 extends it for expiry/read/claim/cleanup races before destructive cleanup is accepted. T30 reruns these suites, not the first proof of their task-local correctness. Every explicit DB invocation must fail without approved configuration; ordinary H skips are reported as skips.

Before adding these tests, confirm the existing Jest discovery pattern includes the proposed paths. If explicit-invocation detection is unsuitable, use a documented test-only opt-in in the same test harness and make missing configuration fail in the integration job. Do not connect to an inherited production `DATABASE_URL`. Include only the relevant DB command for the task.

**V — actual browser acceptance:** In an approved disposable integration environment, start the existing application scripts only after DB target, seeds/startup mutations, LDAP/test accounts and API base URL are checked:

```bash
npm --prefix backend run start:dev
npm --prefix frontend run dev -- --host 127.0.0.1
```

Use the available browser tool for the task's listed interactions, keyboard checks and actual UI screenshots. Record exact build SHA, environment, role and outcomes. Use the real TLS/proxy staging path for session/cookie acceptance; localhost is insufficient for T05. No Playwright/Cypress/library installation is planned. These are persistent dev processes; stop them after bounded acceptance. Browser checks are not a substitute for runnable regression tests.

### Common task cycle and done rule

Every implementation task includes: targeted caller read → named failing regression → minimal fix → relevant F/B/H/DB/V/R → independent review → approved task release/rollback-readiness evidence. Task acceptance is not per-PR production deployment: live rollout and observation are owned by T30 after prerequisites pass, avoiding a circular release gate. Documentation and presentation-only tasks use contract checks or browser acceptance rather than artificial unit tests. Acceptance is not satisfied by a successful build alone. All tasks inherit the global constraints, verification definitions and final DoD.

### M — Migration/storage lifecycle execution contract

This is a required sub-deliverable of each affected PR, not a new migration framework or generic platform project. **Before coding**, its technical reviewer and deployment/DB owner approve the mechanism, compatibility bounds and named entry point. **Before staging/apply**, the owning PR must fill in exact runnable package/SQL/deployment commands, actual config locations, target guard and tested output in README/task evidence; guessed infrastructure commands are forbidden. Missing access or command approval blocks apply/release, not permission to invent defaults.

Execute in this order for each applicable change:
1. **Precheck:** record task/build SHA, approved DB/store identity and namespace, schema/app/worker versions, affected-row counts, permissions, capacity/lock budget, backup or source-reconstruction evidence, tested restore/forward-repair route and startup mutation list. Dry-run must not mutate production. Abort on wrong target, incompatible rows/version, unavailable recovery, missing approval or exceeded budget.
2. **Single runner:** deployment owner runs the recorded entry point once; use existing DB advisory/transaction locking or enforced maintenance serialization with lock timeout and fail-fast second-run behavior. App startup must not race migration or silently run backfills. Retry must detect completed/partial work safely.
3. **Quiesce when necessary:** disable only affected UI/API writes and job intake, drain or safely stop old workers, and stop old writers before allocation/version semantics diverge. Do not claim rolling compatibility without old/new read/write tests; use an approved maintenance window if compatibility is not proven.
4. **Expand, then reconcile:** apply additive DDL/store initialization first; validate constraints and initialization against populated data. Run approved bounded backfill with checkpoint/resume under its concurrency contract; compare source/target counts and mismatches. Do not delete source JSON, identifiers, snapshots or audit to force a clean result.
5. **Deploy:** compatible backend readers/writers first, compatible worker next, then frontend consumer/configuration enablement. Restart session consumers as D06 requires. Resume intake/writes only after direct API, privacy and consistency checks pass. If a task has no worker/frontend change, record that leg as not applicable with reason.
6. **Verify/abort:** retain command outputs, before/after counts, lock/error/duration evidence and exact deployed versions. Stop rollout on any authorization leak, unexpected data change, mismatch, duplicate identifier, stuck job or unapproved lock/time/memory failure; pause affected operations and notify the deployment owner/reviewer using O below.
7. **Rollback after new writes:** preserve additive storage and new history. Only use a rollback binary/config proven to read and safely write the new records; otherwise pause writes/jobs and forward-fix. No destructive down migration or blind database restore that loses intervening user writes. Cleanup bytes cannot be restored by reverting code. Retire compatibility paths only through Handoff/retirement below.

| Owner task / entry point to finalize in its PR | Mandatory sequencing-specific evidence |
|---|---|
| T05 / approved store initialization + actual deployment config from D06 | Store schema/permissions and secrets ready before session consumers; prove cookie/proxy behavior and restart/expiry. Document old-store cutover or controlled logout; old sessions must not resurrect. |
| T08 / approved allocation initialization in existing storage setup or bounded SQL entry point | Stop count-based writers before populated-number initialization; serialize multiple startup instances; initialize from existing numbers under D05, retain uniqueness, deploy safe allocator before resuming creates. Test restart and rollback allocator compatibility. |
| T09/T10 / transactional write deployment, then `rebuild:request-projections` | Deploy fresh canonical/projection writers before reconciliation; test concurrent writes under T10's chosen strategy; compare legacy/new visibility, counts and mismatch totals before consumer acceptance. |
| T18 / existing audit persistence path; additive DDL only if required | Old readers must tolerate new event metadata; atomic data/event commit before enabling richer history; preserve action-only entries and redaction. Record no-DDL explicitly if existing storage suffices. |
| T20 / existing explicit `upgradeDraftSchema` endpoint | No global backfill. Define where original snapshot/data remain recoverable before per-draft conversion; verify save/publish conflicts and safe disablement after upgraded drafts exist. |
| T21 / approved additive PSF lifecycle initialization; T21R only for persisted legacy reconciliation | Compatible readers before conversion; old-client writes may continue only if proven not to reinterpret versions. Otherwise pause PSF writes/configuration until consumers pass. Read-time branch must cause no hidden writes; persisted branch follows T21R before T22 release. |
| T27/T28 / existing job repository/worker lifecycle, approved state/expiry initialization | Drain/stop incompatible workers before new claim/state metadata; explicitly define legacy queued/running/completed jobs and pre-existing artifact expiry treatment under D07. Rehearse crash/restart/retry before re-enabling intake; verify expiry denial before enabling bounded deletion. |

Any actual additive storage change uncovered within an already approved task inherits M; no speculative columns/migration tooling are mandated. T30 assembles these task-owned runbooks into one ordered release rehearsal rather than designing migrations at the end.

### O — Operational observability and stop criteria

Use the existing backend logger and operator log access, not a new monitoring stack. Owning tasks T05/T08/T10/T18/T20/T21/T21R/T27/T28 add the minimum structured events for their changed lifecycle: correlation ID, request/job ID where relevant, task/migration/batch ID, outcome, safe error code, count and duration. Record session-store/config failures, allocation initialization failure, reconciliation conflicts/resume/mismatches, transaction failures, job claim/retry/stall/recovery and cleanup failures. Verify representative success/failure log output without storing confidential fixtures.

**Never log** passwords, LDAP credentials, secrets, cookie/session IDs, authorization headers, raw requester/PSF payloads, artifact bytes, hidden field diffs or database URLs with credentials. IDs must not grant access and error text must be sanitized. Business audit remains separate from operational logs. Deployment owner records where to inspect logs and numeric duration/lock/memory/stall budgets before the relevant task's staging run. Any authorization disclosure, data loss, unexpected migration mismatch or broken session invalidation is an immediate rollout stop; repeated operational failures or budget breaches pause affected intake/writes until owner/reviewer triage. No silent infinite retry. O evidence is required for task acceptance and T30.

### V16 — Visual acceptance contract (before T16 coding)

Visual approver must sign the selected screens/states and pinned references in this document before styling; T16-preflight checks the record, it is not a separate PR. Use the prototype SHA from B0, never its moving HEAD. T16 uses the exact list/table/badge files in its card; T17/T24/T25 use their named detail/dashboard/admin references. If a card names only a component, record its resolved path at that pinned SHA during targeted reference inspection, not a new audit. Capture the main baseline at its implementation SHA and list role, loading/empty/error/access/dirty/historical states applicable to each screen.

Record supported browser names/versions, production support expectations, approval owner and evidence paths. Proposed minimum acceptance widths are **360, 768 and 1440 CSS pixels**, plus 200% zoom; these are test proposals, not a silently approved support policy. The visual approver must accept or replace them with concrete values before T16. A browser available to the agent is not proof of all supported browsers; missing required environments block that acceptance.

Checklist on the actual main UI: keyboard-only navigation and controls; visible focus and sensible focus return; input labels and programmatic error association/announcement; accessible loading/empty/error/denied states; contrast (WCAG AA: ordinary text 4.5:1, large text 3:1, relevant controls/focus 3:1); zoom/reflow without lost content/actions; narrow-screen layout; wide tables with reachable headers/actions and deliberate horizontal overflow, not whole-page clipping. Preserve native controls and use existing browser tools; no visual-test framework or dependency is required. Capture real screenshots and interaction outcomes, including shared-CSS regressions across previously accepted screens.

### Handoff/retirement — Per-screen migration completion

Owning visual/route PRs T16/T17/T19/T22/T24/T25a–e/T29 maintain one checklist entry per migrated screen: route, pinned reference, main accepted SHA, approver/evidence, contract deviations, authority status, obsolete assets and cleanup disposition. Before acceptance the pinned prototype guides only the approved visual scope, never API/domain behavior. **At accepted main-screen review, the main implementation and canonical spec become authoritative for that screen; the pinned prototype becomes historical reference.** Later prototype edits are not automatic requirements; further changes require normal scope approval.

Remove dead components/CSS in the owning PR only after caller/import/route/shared-style checks prove no consumer and rollback does not require them. If an old reader/route/asset remains needed for cached clients or rollback, name it, its owner and the compatible-release/support-window exit condition in the release record; perform cleanup after that condition is verified. Preserve needed URL redirects and new-data readers. Supersede/archive obsolete guides with a pointer to the current spec; retain historical ADRs with amendment/supersession, never fabricate history or automatically delete the prototype repo. T30 verifies the inventory; full migration closure requires each item deleted/archived or explicitly retained with reason and bounded follow-up gate, not unexplained dead code.

## 4. Dependency graph and execution order

`Tnn` is an implementation PR candidate; `D01`–`D09` in the decision register are decisions, while `DEFnn` below are deferred tasks. An arrow is a hard dependency, not an instruction to run tasks simultaneously.

The following is the canonical immediate-dependency graph. All tasks inherit T01 transitively, the task-cycle review rule and applicable M/O contracts. Rows separate functional prerequisites from shared-writer scheduling; use both. A conditional edge is required only when its stated branch is included.

| Task | Hard predecessor tasks | Decisions / additional start gates |
|---|---|---|
| T01 | None | Scoped docs authorization, AR0; name approvers and approve MVP manifest |
| T02 | T01 | AR1, D07 fail-closed artifact subset |
| T03 | T01 | Existing B0 permission/session policy |
| T04 | T02 | AR1, D07 fail-closed processing subset |
| T05 | T01 | AR1, D06, M store/cutover contract |
| T06 | T01 | V06 approved before coding |
| T07 | T06 | D03 same-status subset; introduces guarded lifecycle DB harness |
| T08 | T07 | D05, M allocator contract; reuses T07 DB guard |
| T09 | T06, T08 | AR2, M projection writer contract |
| T10 | T09 | AR2, M, approved concurrent-write strategy |
| T11 | T09, T03 | Existing scoped list contract |
| T12 | T10 | D02, AR2; produces canonical aggregate response and implements approved date predicates |
| T13 | T12, T03 | Exact T12 response and approved labels |
| T14 | T03 | Existing requester mutation contract |
| T15 | T14 | Existing PSF optimistic contract |
| T16 | T11, T02, T03, T04, T05, T06, T07, T08 | G-SAFE accepted plus V16/T16-preflight |
| T17 | T16, T14, T15 | V16 screen acceptance |
| T18 | T10 | D08, scoped AR4, M/O audit contract |
| T19 | T18, T14, T16 | D08; G-SAFE/V16/Handoff for its presentation |
| T20 | T06, T07 | D04 requester mapping, AR3, M; extend shared lifecycle suite |
| T21 | T20 | D04 PSF scope, AR3 compatibility branch, M; coordinate T18 metadata if included |
| T21R (conditional) | T21 | Only if AR3 chooses persisted reconciliation; M and approved target |
| T22 | T21, T16; T21R if persisted branch | D04/AR3, G-SAFE/V16; no consumer release before branch acceptance |
| T23 | T07, T15; T18 if new reason/diff metadata required | D01/D03, scoped AR4 and D08 for that metadata branch |
| T24 | T13, T16 | V16 screen acceptance |
| T25a | T03, T16 | Existing admin policy |
| T25b | T25a | V16; shared CSS schedule |
| T25c | T25a | V16; shared CSS schedule after T25b |
| T25d | T25a | V16; shared CSS schedule after T25c |
| T25e | T25a | V16; shared CSS schedule after T25d; serialize with T22 |
| T26 | T04, T10 | D01/D02; reuse approved shared date predicates and T10 DB suite |
| T27 | T26 | D06 worker topology, D07 scale/recovery, AR5, M/O |
| T28 | T04, T27 | D07 retention/legacy expiry, M/O; extends T27 DB suite |
| T29 | T26, T27, T28, T16 | G-SAFE, D07 polling/lifecycle, AR5, V16 |
| T30 | All included tasks and conditional successors | AR5, approved manifest, staging/release access, M/O/Handoff and post-release gates |

G-SAFE = accepted T02–T08. **Any visual migration implementation**, including richer route/editor/export presentation, inherits G-SAFE and V16; T16 remains the first visual PR. Presentation portions of T19/T22 therefore also follow accepted T16, while their nonvisual backend/contract work need not wait. Task cards explicitly retain this distinction. T25 is a completion group, not a PR. T21/T21R/T22 may be deferred together at AR3; retain and disclose fixed PSF semantics. D02 freezes the shared date/scope semantics before either T12 or T26. Whichever PR lands first owns the minimal predicate correction/tests in the existing search-index service; the later PR reuses that implementation and adds its consumer assertions. Serialize their shared files. T26 does not require the dashboard summary endpoint or a speculative helper-extraction PR.

T16-preflight is not a separate PR: verify V16 approval, G-SAFE evidence and T11 loaded/total/paging. Deferred/rejected scope is removed only by the manifest approver with dependent consumers disabled; never count it implemented.

### Recommended merge order

This is one valid serialized order, not a requirement to idle non-conflicting lanes:
1. T01, T02, T03. T03 may precede T02 if D07/AR1 is pending; both remain the first behavior PR candidates.
2. T04/T05 (serialize T05 with T06 auth files), then T06 → T07 → T08; accept G-SAFE. T07 establishes the guarded DB harness before T08 consumes it.
3. T09 → T10 → T11 → T12 → T13, and T14 → T15 in the frontend lane when shared files are free. T11 needs T09/T03, not T10; this ordering simply serializes the example.
4. T16 → T17 → T24 → T25a → T25b → T25c → T25d → T25e. T16 can start earlier once G-SAFE/T11/V16 pass; T24 always waits for T13. Merge one shared-CSS surface at a time.
5. T18 → T19; T20 → T21 → T21R (only persisted branch) → T22; T23 after T07/T15 and, if applicable, T18. All relevant product/checkpoint gates still apply.
6. T26 → T27 → T28 → T29, then T30 against the manifest. Export backend work can occur earlier once its table prerequisites pass. No production rollout before applicable release gates.

### Parallel workstreams (logical, not automatic delegation)

- **Security/export:** T02→T04 can overlap frontend work in authorized separate worktrees. Later T26→T27→T28→T29 is serialized across export/index/worker files and shared DB-suite edits. T28 now waits for T27's recovery and DB harness; it is not an independent concurrent export writer.
- **Frontend correctness:** T03→T14→T15 can overlap backend work. T11/T13/T14/T16/T19/T22/T23 all share workspace/API consumers; one writer at a time.
- **Domain/data:** T06→T07→T08→T09→T10→T12 is the domain writer schedule. T18/T20/T21/T21R/T23 join this same lane later; serialize shared lifecycle tests too. No concurrent source reconciliation/release writer.
- **Deployment:** T05 can overlap T02/T03 or T08 after D06/AR1, but not T06 auth-file writes. No speculative store adapter before topology/store approval.
- **Documentation/decisions:** gather approvals alongside unrelated approved work; coordinated T01 follow-ups or owning PRs write canonical docs, never competing writers.
- **Visual:** G-SAFE/V16 and first T16 acceptance precede later migrated surfaces. T17/T19/T22/T24/T25/T29 share styling/consumers; serialize those files. Independent review of a fixed diff can overlap the next non-conflicting authorized worktree, not waive dependencies or shared quota rules.

## 5. First three recommended PRs

1. **T01 — `docs: pin production UI architecture and decision gates`** (SMALL). Record the accepted direction/current contracts, reconcile high-impact stale statements and leave disputed policies visibly unresolved. This is a later PR, not modifications made while generating this plan.
2. **T02 — `fix(export): reject artifacts exceeding current actor privileges`** (SMALL). Close the already-completed export download/status authorization gap with demotion and ownership regressions; do not expand export eligibility.
3. **T03 — `fix(auth): invalidate mounted protected UI on logout and expiry`** (MEDIUM). Reuse the existing session seam, clear protected content on logout/401 and preserve deep-link behavior. No new state library.

T02 starts after AR1's fail-closed contract approval. T03 is independent of T02's code and can be prepared in a separate approved workspace. If that approval is pending, prepare T03 first but do not bypass T02's security gate.

## 6. Phase plan and production-safety gates

### Phase 0 — Baseline and decisions (T01)

**Done:** architecture accepted, source/reference SHAs recorded, current API contract separated from product intent, D01–D09 and V06 assigned to named approvers with required timing, no ambiguity silently resolved. Unrelated implementation may start once its own gates are approved.

### Phase 1 — Safety foundation (T02–T08)

**G-SAFE, required before any visual migration implementation:**

- Current actor reauthorized for completed and pending export jobs, with no stored-role escalation path (T02/T04).
- Logout/expired session removes protected mounted UI; anonymous deep links and 403 behavior verified (T03).
- Production session/proxy/secret/store contract accepted and proven on representative staging; no unexamined fallback secret/store (T05).
- Backend input shape/options/date validation and approved same-status behavior covered (T06/T07).
- Request-number allocation passes a real concurrent PostgreSQL test without rewriting old identifiers (T08).
- Independent review accepts the safety evidence; failing/unknown gates are not relabeled passed. If staging is unavailable, visual tasks remain blocked under this plan unless the user explicitly revises the gate.

**Done:** all above passed, rollback paths demonstrated or reviewed; no permission expansion slipped into safety patches.

### Phase 2 — Trustworthy data and coherent detail (T09–T15)

**Done:** drafts discoverable with server pagination; PSF projection privacy and idempotent backfill verified; scoped aggregates accurate beyond one page; D02 date rules tested; parent/child status/history state coherent; unsaved PSF edits protected. T16 needs T11 and G-SAFE, not completion of unrelated aggregate work.

### Phase 3 — Selective visual migration (T16/T17/T24/T25)

**Done:** each selected screen renders the agreed reference hierarchy on the main runtime; real screenshots, keyboard/responsive checks, existing API/form/workflow protections and cross-screen CSS regressions pass. Dashboard restyle waits for T13. No prototype application logic/dependencies imported.

### Phase 4 — Approved domain completeness and export (T18–T23, T26–T29)

**Done:** each approved audit/form/workflow/export capability has backend enforcement, compatible data handling and regression/integration evidence. Explicitly deferred capabilities remain disabled or absent. No claim of fully dynamic PSF or field-level history unless its tasks actually pass.

### Phase 5 — Release acceptance (T30)

**Done:** full relevant suites plus real DB/browser/TLS checks pass; representative roles and schema versions tested; migrations/backfills and rollback compatibility reviewed; docs reflect actual released behavior; independent reviewer authorizes deployment; post-deploy smoke evidence recorded. Deployment access absent means release remains blocked, not locally verified production success.

## 7. Implementation tasks

### T01 — Pin architecture, contract baseline and unresolved decisions

**Goal / why:** Prevent agents rebuilding the prototype runtime or implementing stale phase-2 placeholder/API assumptions. Covers A01 and documentation sync.

**Files/functions:** `CONTEXT.md`; `README.md`; `psf_setup_file_web_application_spec_en.md`; existing `docs/adr/` records identified in the audit (0002/0004/0005/0006/0007/0010/0011/0013); this plan's decision register. Exact ADR filenames are discovered by prefix during execution rather than invented here. UI phase-2 plan remains reference-only; no UI-repo edit is required.

**Dependencies:** implementation authorization; AR0. **Parallel:** approval gathering alongside T02/T03 preparation; no competing doc writer.

**Steps:**
- [ ] Record sole production frontend and pinned visual reference; distinguish LDAP authentication from local app authorization.
- [ ] Correct current route/API/implemented-module statements using B0 and its pinned source references; retain historical ADR context through explicit supersession/amendment, not deletion.
- [ ] Record each D01–D09/V06 decision as approved or unresolved with named approver, required timing, selected contract/tests and blocker list; approve the dependency-closed MVP manifest. Register M/O/V16/Handoff and post-release owners. Unresolved gated choices are not defaults.
- [ ] Define current contract examples for status values, form key, identity fields, `/api/me`, status options/update and PSF concurrency string.

**Tests to add/update:** No artificial code test. Reviewer checks contract examples against cited controllers/types and all decision rows against B0 and the approved scope; only targeted lookup for a missing identifier.

**Verification commands:** R. **Acceptance:** no contradictory claim that working pages are placeholders; no declaration of unsupported features as implemented; decision owners named before gated coding starts.

**Rollback:** revert documentation PR only; preserve historical decisions. **Risk:** LOW. **PR size:** SMALL.

### T02 — Reauthorize completed export artifact access

**Goal / why:** Stop a demoted admin downloading a previously admin-scoped workbook. Covers the first part of A04.

**Files/functions:** `backend/src/export/export.controller.ts` (`getExportActor`, job status/content handlers); `export-job.repository.ts` (`findOwnedContent`, stored owner-role metadata); existing `export.controller.async.spec.ts`, `export.controller.spec.ts`.

**Dependencies:** T01; AR1/D07 fail-closed artifact contract. **Parallel:** T03 in a separate non-conflicting workspace; T08 can overlap only if T07 already passed. Serialize with T04/T28 export edits.

**Steps:**
- [ ] Add regressions for admin→requester after completion, another user's job and missing actor; establish current vulnerable result.
- [ ] Resolve current local profile/role at artifact access; require both ownership and current authorization for the artifact's generation scope.
- [ ] Deny access on revocation or lookup failure; never fall back to persisted admin role. Keep setup-owner denial and current requester masking policy unchanged.
- [ ] Apply consistent non-leaking behavior to job status metadata where it reveals protected content/scope; preserve approved download/error contract.

**Tests to add/update:** named demotion/ownership/deletion cases; unchanged authorized actor succeeds; fixture is synthetic, not real confidential export data.

**Verification commands:** B, H, R. **Acceptance:** no route returns higher-privilege artifact bytes to a downgraded actor; no export permission expansion.

**Rollback:** do not restore vulnerable downloads; disable artifact serving with an explicit error while forward-fixing if needed. Retain job metadata for investigation under retention policy. **Risk:** HIGH. **PR size:** SMALL.

### T03 — Invalidate protected frontend state coherently

**Goal / why:** Remove stale mounted request/admin data after logout or 401; retain real session/routing integration. Covers A02.

**Files/functions:** `frontend/src/components/AppShell.tsx`; `services/auth-session.ts`, `services/api.ts`; `routes/__root.tsx`; `components/Navigation.tsx`; `routes/login/-LoginPage.tsx`. Tests: `services/auth-session.test.ts`, `services/api.test.ts`, `components/Navigation.test.ts`; proposed new `components/AppShell.interaction.test.tsx` using existing interaction harness patterns.

**Dependencies:** T01; retain existing role policy. **Parallel:** T02 and backend domain lane; serialize later frontend API/shell changes.

**Steps:**
- [ ] Add expired-session/logout mounted-view regressions and anonymous deep-link case.
- [ ] Route API 401 and explicit logout through the existing session invalidation seam; clear/unmount protected content and prevent stale in-flight responses from repopulating it.
- [ ] Distinguish 403 from logout, guard protected entry behavior and preserve a safe local return location without open redirects.
- [ ] Remove demo credentials/persona/local-auth copy; retain actual LDAP login and role-appropriate links.

**Tests to add/update:** valid reload, anonymous detail/admin deep link, logout during fetch, stale response after logout, 401 once without redirect loop, 403 permission state, user B login never sees user A state.

**Verification commands:** F, V, R. **Acceptance:** no stale protected content after invalidation; server authorization remains unchanged; no state library added.

**Rollback:** revert frontend routing change only if protected views are temporarily disabled; do not restore stale-session exposure. **Risk:** HIGH. **PR size:** MEDIUM.

### T04 — Reauthorize pending export processing

**Goal / why:** Prevent saved `ownerRole` from granting stale privileges when jobs execute. Completes A04.

**Files/functions:** `backend/src/export/export-job.processor.ts` (`processNext`); `export-job.repository.ts` (`enqueue`, job lifecycle); existing current-profile lookup in `backend/src/auth/auth.service.ts`; tests `export-job.processor.spec.ts`, `export-job.repository.spec.ts`, `export.controller.async.spec.ts`.

**Dependencies:** T02; AR1/D07. **Parallel:** T03/T08; no concurrent export writer.

**Steps:**
- [ ] Add queued-job demotion/deleted-actor regressions before processing.
- [ ] Re-resolve actor immediately before generation and enforce approved current scope; deny/invalidate stale higher-privilege work rather than silently downgrading an already-defined export.
- [ ] Preserve T02 download-time reauthorization for revocation during generation; ensure denied jobs reach a documented terminal state without content publication.
- [ ] Verify retries do not revive revoked work and role lookup failure fails closed.

**Tests to add/update:** demotion before execution and during generation; deletion; retry; authorized current requester/admin; no bytes on failed job.

**Verification commands:** B, H, R. **Acceptance:** processing never grants authority from persisted role alone; all stages remain independently authorized.

**Rollback:** pause processing and keep download guard; do not resume old unsafe worker. **Risk:** HIGH. **PR size:** SMALL.

### T05 — Establish production session safety

**Goal / why:** Replace unverified MemoryStore/fallback-secret/proxy assumptions with a supported deployment contract. Covers A03.

**Files/functions:** `backend/src/main.ts` (session/bootstrap); `backend/src/auth/auth.controller.ts` (login/logout); `auth.controller.spec.ts`; proposed new `backend/src/auth/session-configuration.spec.ts`; `README.md` deployment section. A production store integration file/dependency is not preselected; AR1 must approve the exact existing adapter or minimal integration location before coding.

**Dependencies:** T01, AR1, D06, M store/cutover and O. **Parallel:** T02/T03; avoid T06 auth edits. **Scope boundary:** if approved store integration cannot fit this PR, split it into a reviewed T05 follow-up and keep G-SAFE blocked until both pass; do not ship an empty adapter.

**Steps:**
- [ ] Obtain real proxy/store/lifetime contract; verify existing runtime capabilities, not diagram assumptions. Review initial-admin startup behavior separately from visual work.
- [ ] Add missing-production-secret/config regressions; enforce explicit production settings without embedding credentials.
- [ ] Configure the approved persistent session store and bounded proxy trust; regenerate session ID at successful login and destroy/invalidate on logout.
- [ ] Verify cookie Secure/HttpOnly/SameSite against the actual approved topology, restart behavior and authentication failure handling.

**Tests to add/update:** session ID rotation, old ID invalid, logout invalidation, config failure, store outage fails safely, restart/expiry; actual TLS/proxy browser test.

**Verification commands:** B, H, V through approved TLS staging, R. **Acceptance:** no silent unsafe production fallback; explicit store/topology evidence. A dependency is allowed only if AR1 documents the concrete persistent-store need and existing options cannot meet it.

**Rollback:** controlled logout/maintenance and prior safe configuration; never revert to default secret/unsafe production store. **Risk:** HIGH. **PR size:** MEDIUM, mandatory split if it becomes LARGE.

### T06 — Enforce trust-boundary payload validation

**Goal / why:** Reject malformed requester/control/login inputs before mutation. Covers validation part of A05.

**Files/functions:** `backend/src/requests/requests.service.ts` (required-value/validation helpers, create/save/submit callers); `requests.controller.ts`; `backend/src/auth/auth.controller.ts`; tests `requests.service.spec.ts`, `requests.controller.spec.ts`, `auth.controller.spec.ts`, `backend/test/app.e2e-spec.ts`.

**Dependencies:** T01, approved V06 before coding. **Parallel:** T02/T03; serialize requests/auth writes with T05/T07.

**Steps:**
- [ ] Add tests showing `{}`, `[]` and invalid scalar values are not valid text/required inputs.
- [ ] Validate plain object shape, supported control value types, options and valid dates using existing schema definitions; prevent unknown data from becoming authority fields.
- [ ] Validate login input type/required shape before LDAP call, without changing credential protocol.
- [ ] Keep errors actionable and non-sensitive; prove all sibling create/save/submit paths use consistent validation. Do not retroactively rewrite stored data.

**Tests to add/update:** malformed input on each write path, optional empty value, invalid select/date, valid existing schemas, malformed login never calls LDAP; V06-approved partial-draft/submit/PSF and legacy-invalid fixtures must pass before review; failed validation leaves source/projection/audit unchanged.

**Verification commands:** B, H, R. **Acceptance:** server rejects invalid shape even when UI bypassed; legitimate existing payloads remain accepted.

**Rollback:** retain trust-boundary guards; narrow an over-strict rule through a forward fix with regression rather than disable validation globally. **Risk:** HIGH. **PR size:** MEDIUM.

### T07 — Make same-status transitions non-mutating

**Goal / why:** Prevent timestamps/owner/audit changes through current→current bypass. Completes A05.

**Files/functions:** `backend/src/requests/requests.service.ts` (`assertStatusTransitionIsAllowed`, `updateRequestStatus`); tests `requests.service.spec.ts`, `requests.audit.spec.ts`, `requests.controller.spec.ts`; proposed new `backend/test/form-version-lifecycle.e2e-spec.ts` and shared guard from §3.

**Dependencies:** T06; D03 reject-versus-no-op approval. **Parallel:** frontend lane; no concurrent request-service writer.

**Steps:**
- [ ] Add regression proving current target changes no owner, `completed_at`, `updated_at` or audit record.
- [ ] Place approved reject/true-no-op handling before mutations in the shared status path.
- [ ] Retain permission enforcement and normal allowed transitions; do not implement new workflow actions here.

**Tests to add/update:** same-status authorized/unauthorized actor, completed record, genuine transition, transaction behavior and approved HTTP response.

**Verification commands:** B, H, DB form-version-lifecycle command, R. **Acceptance:** repeated/competing targets cannot refresh business metadata or fabricate an event; real rollback and audit-atomicity assertions pass using the shared guarded harness.

**Rollback:** retain a rejecting guard while forward-fixing response compatibility. **Risk:** HIGH. **PR size:** SMALL.

### T08 — Allocate request numbers atomically

**Goal / why:** Remove count-based concurrency risk without renaming existing requests. Covers A06.

**Files/functions:** `backend/src/requests/requests.service.ts` (`nextDraftRequestNo`, `createDraft`, existing storage initialization); `requests.service.spec.ts`; proposed new `backend/test/requests-concurrency.e2e-spec.ts`. No separate migration framework.

**Dependencies:** T07 (shared DB guard), D05 and M allocation/startup contract before coding. **Parallel:** export/frontend lanes; serialize requests-service writes.

**Steps:**
- [ ] Agree number-format compatibility and choose a PostgreSQL-native sequence or equivalent atomic allocation; do not require gapless numbering.
- [ ] Add real concurrent-create regression under isolated DB guard plus existing unit boundary cases.
- [ ] Introduce additive allocation state initialized safely against existing numbers, retaining uniqueness constraint; remove `COUNT(*) + 1` allocation.
- [ ] Verify failure/retry and upgrade from populated DB; do not change `DRAFT-*` appearance unless D05 explicitly authorizes future-only format changes.

**Tests to add/update:** concurrent creates, rollback gaps allowed, restart/retry, populated database initialization, old request URLs/identifiers unchanged.

**Verification commands:** B, H, DB requests-concurrency command, R. **Acceptance:** real simultaneous writes produce distinct valid identifiers; no existing record renamed.

**Rollback:** retain additive allocation state; use the safe allocator in rollback binary or pause creates. Never restore count allocation while concurrent writes continue. **Risk:** HIGH. **PR size:** MEDIUM.

### T09 — Project drafts on create/save

**Goal / why:** Make saved drafts discoverable through actual request-list/search storage. First part of A07.

**Files/functions:** `backend/src/requests/requests.service.ts` (`createDraft`, draft save path); `search-index.service.ts` (`upsertRequestSearchIndex`, scoped queries); tests `requests.service.spec.ts`, `search-index.service.spec.ts`.

**Dependencies:** T06, T08; AR2 and M projection-writer contract; shared service writes remain serialized. **Parallel:** T14/frontend lane.

**Steps:**
- [ ] Add create/save→list regressions for requester ownership and other-role policy.
- [ ] Reuse index upsert within the existing write transaction; preserve correct canonical values and status.
- [ ] Ensure failed request writes cannot leave index-only drafts; do not add all-record browser filtering.

**Tests to add/update:** saved draft included, other requester excluded, edit updates projected values, rollback leaves no orphan; preserve submit index behavior.

**Verification commands:** B, H, R. **Acceptance:** new/edited drafts visible through authorized list queries, no duplicate projection or ownership leak.

**Rollback:** retain projection rows; revert presentation exposure only if necessary. Do not delete canonical requests/index history. **Risk:** MEDIUM. **PR size:** SMALL.

### T10 — Synchronize PSF projections and reconcile existing rows

**Goal / why:** Align list/search owner/PSF information with writes without exposing hidden PSF values. Completes A07.

**Files/functions:** `backend/src/requests/requests.service.ts` (`updatePsfCreatedData`, `updateRequestStatus`); `search-index.service.ts`; tests `requests.service.spec.ts`, `search-index.service.spec.ts`; proposed new `backend/test/request-projections.e2e-spec.ts`; proposed new `backend/scripts/rebuild-request-projections.ts` only if no existing reconciliation entry point is available at execution.

**Dependencies:** T09; AR2, M/O and approved current visibility policy/concurrent-write contract. **Parallel:** T11/T14, not another index/domain writer.

**Steps:**
- [ ] Add role-specific list/search tests for hidden PSF fields and actual PSF filename/owner after save/status update.
- [ ] Reuse canonical/index mapping with explicit requester versus PSF sections; apply access rules to selection/filtering as well as response fields.
- [ ] Update request and projection transactionally on each relevant write.
- [ ] Before coding, AR2/DB owner selects the concurrent-write strategy: lock and re-read each canonical row in the same transaction as projection upsert; conditional source-version write with conflict re-read/retry; or an explicitly approved write-maintenance window. Record the chosen SQL/locking boundary in M. Never apply a projection computed before an intervening save/status change without revalidation.
- [ ] Add a bounded, idempotent, opt-in reconciliation command with dry-run summary and transaction batches; require an explicit approved DB target, never auto-run on production startup. Use stable cursor/checkpoint semantics, bounded conflict retries and an explicit unresolved-conflict summary. Resume must not skip changed rows; post-run mismatch verification reads current canonical state, not only initial counts.
- [ ] Add real PostgreSQL barrier-controlled races: reconciliation reads then concurrent requester/PSF save or status update commits; batch interruption/resume; second runner contends for M lock. Assert latest committed projection, no hidden-field inference, no source/audit mutation from reconciliation and no lost live write. For maintenance strategy, prove attempted live writes are blocked and resume safely instead of claiming online safety.

**Tests to add/update:** PSF save/search consistency; requester cannot infer hidden filename by query; unchanged/replayed batch; interruption/resume; transaction rollback. Real DB test includes legacy drafts missing projections.

**Verification commands:** B, H, DB request-projections command, R. Add proposed `backend/package.json` script `rebuild:request-projections` invoking the approved reconciliation entry point (if the proposed new file is needed: `ts-node scripts/rebuild-request-projections.ts`). The command is new, not an audited existing capability. With an explicitly approved isolated DB target, run `npm --prefix backend run rebuild:request-projections -- --dry-run --batch-size 100`, then `npm --prefix backend run rebuild:request-projections -- --apply --batch-size 100`, then repeat dry-run and verify no remaining mismatches. Apply against any non-test target needs separate deployment approval; the command must reject missing target/approval rather than inherit production defaults.

**Acceptance:** both new writes and reviewed legacy rows consistent; reconciliation counts reviewed; no privacy regression or fabricated audit history.

**Rollback:** stop reconciliation; retain source JSON and recover projections from it. Revert faulty query/code, not source data; backfill never deletes canonical records. **Risk:** HIGH. **PR size:** MEDIUM.

### T11 — Add complete request browsing and draft rediscovery

**Goal / why:** Stop hiding later pages and make draft reopening a real API-backed user journey. Part of A08.

**Files/functions:** `frontend/src/components/RequestsWorkspace.tsx` (`RequestsListPage`, `RequestsTable`); `services/api.ts` list query/result types; tests `RequestsWorkspace.test.tsx`, `services/api.test.ts`.

**Dependencies:** T09, T03. **Parallel:** T10/backend lane; not T13/T14 workspace edits.

**Steps:**
- [ ] Add limit/offset/total and changed-filter page-reset regressions using current server contract.
- [ ] Wire server pagination, loading/error states and Draft selection; preserve request UUID links.
- [ ] Show loaded/page results versus total truthfully, handle empty later page after data changes, and ignore stale filter responses.
- [ ] Preserve existing backend role scope; no client-only permission/filter substitutes.

**Tests to add/update:** population beyond 100, second page, filter reset, empty page with nonzero total, reopened saved draft, stale response, error retry.

**Verification commands:** F, V, R. **Acceptance:** authorized later records and saved drafts reachable; counts never imply loaded page equals population.

**Rollback:** revert paging UI to an explicitly labeled limited view without claiming completeness; retain backend projections. **Risk:** MEDIUM. **PR size:** SMALL.

### T12 — Add authoritative scoped dashboard summary

**Goal / why:** Replace limited-array operational totals. Backend part of A08.

**Files/functions:** `backend/src/requests/requests.controller.ts`, `requests.service.ts`, `search-index.service.ts`; tests `requests.controller.spec.ts`, `search-index.service.spec.ts`, `backend/test/app.e2e-spec.ts`.

**Dependencies:** T10, D02, AR2. **Parallel:** T14/T15 frontend lane.

**Steps:**
- [ ] Record approved metric/date definitions in API documentation and add population/role/boundary regressions.
- [ ] Add proposed `GET /api/requests/summary` (new contract, not an audited existing endpoint), declared safely relative to `/:id` routes; reuse existing actor/scope/filter predicates.
- [ ] Return a small typed aggregate object for the approved four cards, with an explicit evaluation timestamp and declared date boundary if time-sensitive; finalize field names in this PR before T13 starts.
- [ ] Aggregate in PostgreSQL without fetching all requests or deriving totals from a page; verify query behavior against representative data.

**Tests to add/update:** beyond 100 rows, zero data, requester scope, owner shared queue, terminal overdue exclusion and Bangkok due-date boundary; route is not parsed as request UUID.

**Verification commands:** B, H, DB request-projections command extended for aggregate cases, R. **Acceptance:** summary equals independently computed fixture population under identical access scope; no misleading “my” label semantics in contract.

**Rollback:** remove/disable new consumer first; retain additive endpoint compatibility until no clients depend on it. **Risk:** MEDIUM. **PR size:** MEDIUM.

### T13 — Consume summaries without changing dashboard presentation

**Goal / why:** Separate metric correctness from visual migration. Completes A08's dashboard data work.

**Files/functions:** `frontend/src/services/api.ts`; `components/RequestsWorkspace.tsx` (`DashboardPage`); tests `services/api.test.ts`, `RequestsWorkspace.test.tsx`.

**Dependencies:** T12, T03. **Parallel:** backend safety/export lane; serialize workspace edits.

**Steps:**
- [ ] Add tests against the exact T12 response, including summary/list partial failure.
- [ ] Fetch server summary separately from the limited queue; stop counting operational totals from `items`.
- [ ] Use approved labels and refresh behavior; never show fabricated zero or stale totals as fresh when summary fails.

**Tests to add/update:** queue limit does not alter summary, summary unavailable while list succeeds, explicit refresh/time-sensitive count behavior, role scope change.

**Verification commands:** F, V, R. **Acceptance:** cards derive only from authoritative summary; limited queue remains clearly bounded.

**Rollback:** hide summary cards or label them unavailable; never restore misleading page-derived operational totals. **Risk:** MEDIUM. **PR size:** SMALL.

### T14 — Synchronize detail after requester mutations

**Goal / why:** Eliminate parent/child request/status/history drift. First part of A09.

**Files/functions:** `frontend/src/components/RequestsWorkspace.tsx` (`RequestDetailShell`, `RequestHeaderSummary`); `ActiveSchemaForm.tsx`; existing `ActiveSchemaForm.interaction.test.tsx`, `RequestsWorkspace.test.tsx`; proposed new `RequestsWorkspace.interaction.test.tsx` if mounted coordination cannot fit existing harness.

**Dependencies:** T03. **Parallel:** backend lane; serialize T11/T13 workspace edits.

**Steps:**
- [ ] Add mounted save/submit regression proving header, actions and history refresh together.
- [ ] Add the smallest typed mutation-result callback from requester form to its parent; use existing detail API response/refresh rather than a second state store.
- [ ] Coordinate canonical detail, allowed status options and history after success; cancel stale request-ID/session responses.
- [ ] Distinguish successful mutation from failed refresh so UI does not prompt duplicate submission.

**Tests to add/update:** child submit, save metadata change, navigate during fetch, refresh error after success, no double mutation.

**Verification commands:** F, V, R. **Acceptance:** no obsolete Draft header/actions after submit; history refreshes for committed operations.

**Rollback:** keep successful mutation acknowledgement and safe reload fallback; revert callback refactor without duplicating writes. **Risk:** MEDIUM. **PR size:** SMALL.

### T15 — Protect dirty PSF values and concurrency tokens

**Goal / why:** Prevent status actions/refetch overwriting unsaved PSF edits. Completes A09.

**Files/functions:** `frontend/src/components/RequestsWorkspace.tsx` (`RequestDetailShell`, `updateStatus`, PSF save/dirty state); tests `RequestsWorkspace.test.tsx`, proposed/new T14 interaction test.

**Dependencies:** T14. **Parallel:** backend lane only for shared workspace separation.

**Steps:**
- [ ] Add regression for dirty PSF→status action and 409 conflict with exact timestamp token.
- [ ] Require explicit save/discard/cancel before an action replaces edited data; do not autosave without user intent.
- [ ] Preserve raw `expectedUpdatedAt`, refresh authoritative state after committed writes and keep local edits recoverable on conflict.

**Tests to add/update:** cancel retains edits, save failure prevents status mutation, discard explicit, concurrent edit returns conflict without silent overwrite, microsecond token preserved.

**Verification commands:** F, V, R. **Acceptance:** no successful status operation silently destroys local PSF changes; conflict UX does not lie about persistence.

**Rollback:** disable status actions while dirty or conflicting until forward fix; retain server optimistic checks. **Risk:** HIGH. **PR size:** SMALL.

### T16 — FIRST VISUAL: restyle API-backed requests browsing

**Goal / why:** Deliver a small measurable visual improvement on a read-only surface, not a runtime rewrite. Covers A10.

**Files/functions:** `frontend/src/components/RequestsWorkspace.tsx` (`RequestsListPage`, `RequestsTable`); `frontend/src/index.css`; `RequestsWorkspace.test.tsx`. Read-only reference: `UI:src/app/pages/RequestsListPage.tsx`, `components/dashboard/RequestsTable.tsx`, `components/requests/StatusBadge.tsx` at pinned SHA.

**Dependencies:** G-SAFE, T11, approved V16. **Parallel:** backend/audit decisions; no concurrent shared CSS/table writer.

**Steps:**
- [ ] Verify gate evidence and capture current main UI baseline; inspect shared table consumers before styling.
- [ ] Port header/filter/table hierarchy, spacing and badge treatment into existing components with scoped CSS/native controls and current status values.
- [ ] Keep server paging, supported filters, native detail links, loading/error/empty states and loaded/total semantics. Do not add FAB filter, bulk actions or prototype sorting.
- [ ] Capture actual rendered main screenshots at agreed viewport widths and review Dashboard's shared table for regressions.

**Tests to add/update:** existing list/filter/link behavior, loading/empty/error/access states, shared table regression; keyboard focus/labels/contrast/responsive overflow checked in browser, not fabricated screenshots.

**Verification commands:** F, V, R. **Acceptance:** visibly matches approved reference hierarchy, no mock/context/router imports, no new dependency or changed write/domain contract.

**Rollback:** revert scoped JSX/CSS PR; no DB rollback required. **Risk:** LOW–MEDIUM. **PR size:** SMALL.

### T17 — Restyle detail and existing requester form presentation

**Goal / why:** Adopt workflow-first hierarchy without replacing the form engine or undoing mutation safety. Covers main detail/form visual recommendations.

**Files/functions:** `frontend/src/components/RequestsWorkspace.tsx` (`RequestDetailShell`, `WorkflowStatusActions`); `DynamicFormRenderer.tsx`; `ActiveSchemaForm.tsx` only for presentation props if necessary; `index.css`; existing renderer/form/workspace tests. UI reference: `RequestDetailPage`, unified `DynamicFormRenderer`, status/section presentation, not obsolete duplicate section renderers.

**Dependencies:** T16, T14, T15. **Parallel:** backend/audit lane; serialize all form/CSS writes.

**Steps:**
- [ ] Capture requester/owner/admin detail states including old-version request before restyling.
- [ ] Port header/section/action layout with dynamic controls unchanged; show only server-authorized actions and PSF content.
- [ ] Preserve upgrade/remain UX, concurrency strings and autofill race protection. If porting `AutofillBadge`, display only actual provenance/status; no invented source request number.
- [ ] Keep stepper non-authoritative for branching/reversed workflow; use labels/status treatment without implying unrecorded completed steps.

**Tests to add/update:** historical snapshot rendering, hidden PSF, read-only submitted requester form, allowed targets, dirty protection, autofill edited/stale response; real keyboard/responsive acceptance.

**Verification commands:** F, V, R. **Acceptance:** visual-only contract, no hard-coded prototype fields/options, no historical active-schema substitution.

**Rollback:** revert visual JSX/CSS only; retain T14/T15 behavior and server schema data. **Risk:** MEDIUM. **PR size:** MEDIUM.

### T18 — Capture truthful transactional field audit

**Goal / why:** Extend action-only history for approved mutations, including PSF save, without inventing evidence. Backend portion of A12.

**Files/functions:** `backend/src/audit/audit_log.service.ts`; `backend/src/requests/requests.service.ts` (draft/PSF/status write paths); tests `audit_log.service.spec.ts`, `requests.audit.spec.ts`, `requests.service.spec.ts`.

**Dependencies:** T10, D08, scoped AR4, M/O. **Parallel:** frontend visuals; no concurrent request-service writer. T21 may require additive audit metadata later, not an incompatible rewrite now.

**Steps:**
- [ ] Define approved additive event metadata for changed field key/label/old/new and actor/server time; preserve older action entries.
- [ ] Read old state and capture actual committed changes within the existing transaction; omit no-op events.
- [ ] Add PSF-save audit and redact sensitive section metadata at authorized read boundary; browser never supplies actor/time/diff truth.
- [ ] Document that pre-existing action-only history cannot be backfilled with trustworthy old/new values.

**Tests to add/update:** real changed field, unchanged value, missing/removed key, PSF save, transaction rollback, unauthorized reader, old metadata compatibility.

**Verification commands:** B, H, DB request-projections command with transaction/audit cases, R. **Acceptance:** audit matches committed changes; no failed-write event or hidden-value disclosure.

**Rollback:** preserve additive events; old reader must tolerate them. Temporarily use compatible action view rather than deleting history. **Risk:** HIGH. **PR size:** MEDIUM.

### T19 — Implement request-history route and real audit presentation

**Goal / why:** Replace the remaining history-route placeholder and show only available audit data. Frontend portion of A12.

**Files/functions:** `frontend/src/routes/requests/$requestId/history.tsx`; `components/RequestsWorkspace.tsx` (history panel); `components/GlobalHistoryPage.tsx`; `services/api.ts` audit types; tests `GlobalHistoryPage.test.tsx`, `RequestsWorkspace.test.tsx`; proposed new `components/RequestHistoryPage.test.tsx` only if extracting a real reused component.

**Dependencies:** T18, T14, T16; G-SAFE/V16; D08 visibility. Read-only route/reference inspection may precede T16; migrated presentation coding and acceptance wait for T16. **Parallel:** export backend lane; serialize workspace edits.

**Steps:**
- [ ] Use existing request-history endpoint for the route and shared data presentation; preserve current global-history access policy.
- [ ] Render richer entries when supplied and an honest action-only fallback for old events; no empty invented field diffs or fake departments.
- [ ] Preserve refresh-on-mutation and deep links; handle 403/404/loading/error distinctly.

**Tests to add/update:** route request ID, old/new event formats, redacted event, unauthorized access, mutation refresh, keyboard timeline/table semantics.

**Verification commands:** F, V, R. **Acceptance:** dedicated route works; global and request history show server evidence only.

**Rollback:** revert new presentation/route wiring to safe action history; keep stored events. **Risk:** MEDIUM. **PR size:** SMALL.

### T20 — Preserve canonical values during draft schema upgrade

**Goal / why:** Avoid losing meaning when a field key changes but approved canonical identity remains. First part of A11.

**Files/functions:** `backend/src/requests/requests.service.ts` (`upgradeDraftSchema`); `backend/src/admin/form_schema.service.ts` (publication validation); `requests.schema-upgrade.spec.ts`, `form_schema.service.spec.ts`, T07's `backend/test/form-version-lifecycle.e2e-spec.ts`; `frontend/src/components/activeSchemaFormState.ts` only if approved response/error handling requires it.

**Dependencies:** T06, T07 (shared DB harness), applicable D04, AR3 and M/O. **Parallel:** export/visual lane; serialize schema/request files.

**Steps:**
- [ ] Agree deterministic precedence: validated exact field identity versus unique approved canonical match; ambiguous or type-incompatible migration requires explicit resolution, not data guessing.
- [ ] Add rename/stable-canonical, collision, removed-field and invalid-option regressions.
- [ ] Apply minimal upgrade mapping inside existing transaction/lifecycle; preserve old snapshot and submitted records.
- [ ] Keep current old-draft submit restriction unless D04 explicitly changes it in a separately reviewed behavioral change.

**Tests to add/update:** rename retention, canonical collision rejected, incompatible option/type surfaced, active-version race, original submitted snapshot untouched.

**Verification commands:** B, H, DB form-version-lifecycle command, F if frontend changed, R. **Acceptance:** real upgrade/save/publish races and transaction/audit rollback pass even if T21 is deferred; approved data survives upgrade without silent remapping; ambiguities cannot auto-resolve.

**Rollback:** retain old snapshots/data; disable new upgrade path while correcting mapping. Never bulk reverse upgraded data from labels. **Risk:** HIGH. **PR size:** MEDIUM.

### T21 — Version PSF schema on the existing backend lifecycle

**Goal / why:** Replace the fixed server PSF constant only if dynamic PSF configuration is approved. Backend part of A11; not needed for read-only visual migration.

**Files/functions:** `backend/src/requests/requests.service.ts` (`PSF_CREATED_INFORMATION_SCHEMA`, `mapRequestRow`, `updatePsfCreatedData`, snapshot capture path); `backend/src/admin/form_schema.service.ts`; `backend/src/export/excel_export.service.ts` schema consumption; tests `requests.schema-upgrade.spec.ts`, `form_schema.service.spec.ts`, `excel_export.service.spec.ts`; extend T07's `backend/test/form-version-lifecycle.e2e-spec.ts`.

**Dependencies:** T20, applicable D04, AR3 compatibility choice, M/O; coordinate T18 metadata without depending on unapproved audit expansion. **Parallel:** unrelated frontend visual/export work only when files do not overlap.

**Steps:**
- [ ] AR3 approves an additive PSF schema/version identity, capture point, M rollout and server-owned section partitioning using existing form-version machinery; choose read-time compatibility or persisted reconciliation explicitly. Do not place PSF fields inside requester input and rely on renderer hiding.
- [ ] Add version publication/edit/visibility tests and immutable old-record cases before changing reads.
- [ ] Introduce additive storage/response data and validation for the approved PSF snapshot; retain backward compatibility for old client responses during rollout.
- [ ] Define the deterministic legacy representation of the audited fixed schema, explicitly labeled reconstructed compatibility metadata rather than a historically captured snapshot. **Read-time branch:** retain legacy rows unchanged, prove reads cause no hidden writes and active publishing cannot alter their descriptor; no T21R is created. **Persisted branch:** T21 introduces compatible storage/readers and the approved mapping, while T21R owns dry-run/apply/resume/reconciliation. No unowned later backfill.
- [ ] Before accepting either branch, exercise populated old/new records and old clients/readers under M; record where original values/snapshots remain recoverable. PSF section redaction/validation must hold for detail, search/filter inference, audit and export.

**Tests to add/update:** publish then old record unchanged, authorized owner edit, requester response/write redaction, duplicate field key rejection, stale optimistic token, old export fields and legacy record behavior in real DB.

**Verification commands:** B, H, DB form-version-lifecycle command, R. **Acceptance:** schema version semantics hold on both sections; legacy provenance honest; no active-schema rewrite of history.

**Rollback:** retain additive columns/versions; only deploy an older reader proven compatible. Pause PSF writes if old binary would reinterpret new versions. **Risk:** HIGH. **PR size:** MEDIUM for lifecycle/storage/readers. Persisted reconciliation is always the separate conditional T21R below; T21 plus the selected compatibility branch must pass before T22 release.

### T21R — Reconcile persisted legacy PSF metadata (conditional PR)

**Goal / why:** Own the data conversion separately from T21's additive contract. Exists only when AR3 selects persisted reconciliation; read-time compatibility requires no empty migration task/file.

**Files/functions:** reuse T21 mapping and existing DB access; proposed new `backend/scripts/reconcile-legacy-psf.ts` only if no existing reconciliation entry point suffices; `backend/package.json` proposed script `reconcile:legacy-psf`; extend shared `backend/test/form-version-lifecycle.e2e-spec.ts`. Keep mapping in its existing owning service/helper, not a second schema engine.

**Dependencies:** T21, AR3 persisted branch, D04 and M/O; serialize request/schema/reconciliation writers. **Parallel:** unrelated frontend work in a separate authorized worktree; T22 release remains blocked.

**Steps:**
- [ ] Record immutable legacy descriptor, eligible/already-converted/ambiguous counts, explicit approved target and operator, single-run lock, original-data preservation and concurrent-write rule in M. Ambiguous/incompatible rows stop their conversion and block release unless product approves a documented safe exclusion/compatibility path.
- [ ] Implement bounded dry-run/apply using a stable cursor and explicit resume checkpoint, idempotent already-converted detection and atomic per-batch writes. Revalidate/lock current source before writing; never overwrite a live PSF edit or fabricate historical capture time/audit.
- [ ] Add the named package script invoking the existing entry point, or `ts-node scripts/reconcile-legacy-psf.ts` if that proposed file is used. Its contract is `--dry-run` or `--apply`, `--batch-size 100`, and `--resume <recorded-checkpoint>` for interruption; target/approval input names and lock timeout are finalized in M before apply. Reject missing target/approval, never inherit a production default.
- [ ] In the approved isolated environment run `npm --prefix backend run reconcile:legacy-psf -- --dry-run --batch-size 100`, then the same with `--apply`, interrupt/resume using the emitted checkpoint, and repeat dry-run. Record eligible/converted/skipped/conflicted counts and zero unexplained mismatches. Non-test apply requires separate deployment approval.

**Tests:** repeated apply, interrupted/resumed batch, concurrent PSF write, duplicate runner, old/new client compatibility, hidden-section redaction and transaction rollback using real PostgreSQL/shared harness. Descriptor stays stable after active publish; source values and audit history unchanged except explicitly approved non-historical compatibility metadata.

**Verification commands:** B, H, DB form-version-lifecycle command, named dry-run/apply/resume commands on isolated target, R; O output review. **Acceptance:** reviewed counts reconcile, no unresolved data-loss/visibility conflict, repeat dry-run clean, M rehearsal passes; T22 release may proceed only now.

**Rollback:** stop conversion; retain additive descriptors and original source/snapshots. Use compatible reader or pause affected PSF writes and forward-fix; no destructive reversal. **Risk:** HIGH. **PR size:** MEDIUM, data reconciliation only.

### T22 — Wire approved PSF versions into existing editors/renderers

**Goal / why:** Expose real backend PSF schema support without another form engine. Completes A11.

**Files/functions:** `frontend/src/services/api.ts`; `types/forms.ts`; `components/RequestsWorkspace.tsx` PSF panel; `DynamicFormRenderer.tsx`; `AdminFormConfigPage.tsx`; tests `DynamicFormRenderer.test.tsx`, `RequestsWorkspace.test.tsx`, `AdminFormConfigPage.interaction.test.tsx`.

**Dependencies:** T21, T16 and T21R if persisted reconciliation is chosen; G-SAFE/V16; D04/AR3. Read-only API/reference inspection may precede T16; this consumer/presentation coding and acceptance wait for T16. **Parallel:** backend export lane; serialize form/workspace/CSS changes.

**Steps:**
- [ ] Consume T21's exact additive schema/version response; keep historical PSF renderer bound to its approved snapshot/legacy descriptor.
- [ ] Extend the existing JSON editor/publish/preview only as far as supported backend schema permits; no drag-and-drop builder.
- [ ] Preserve server visibility/editability flags, unique keys, allowed control types and exact concurrency token.

**Tests to add/update:** old/new PSF versions, publish preview, unauthorized section never rendered, unsupported `file` field rejected/not offered, snapshot remains stable after active publish.

**Verification commands:** F, V, R; B/H if any backend follow-up is required must be reviewed explicitly. **Acceptance:** both form sections use approved version contract; no fake file upload or hard-coded prototype fields.

**Rollback:** hide new configuration entry and use compatible snapshot renderer; do not fall back blindly to active schema. **Risk:** HIGH. **PR size:** MEDIUM.

### T23 — Close approved workflow gaps through existing transitions

**Goal / why:** Complete Need More Information/completion behavior only after product decisions, not from prototype assumptions. Covers A13.

**Files/functions:** `backend/src/admin/workflow_transition.service.ts`; `backend/src/requests/requests.service.ts` requester edit/submit/status paths; `frontend/src/components/RequestsWorkspace.tsx` (`WorkflowStatusActions`); tests `workflow_transition.service.spec.ts`, `requests.service.spec.ts`, `requests.audit.spec.ts`, `RequestsWorkspace.test.tsx`; extend T07's `backend/test/form-version-lifecycle.e2e-spec.ts`.

**Dependencies:** T07, T15, D01/D03, AR4; T18 if the approved flow requires new reason/diff metadata. **Parallel:** unrelated export lane; serialize domain/workspace writes.

**Steps:**
- [ ] Record approved state/actor/field matrix with concrete request correction/resubmit and PSF completion cases.
- [ ] Add direct-API denied and allowed-path regressions before implementing minimal backend rules in existing endpoints.
- [ ] Derive named action buttons solely from returned allowed targets; preserve dropdown for supported manual transitions.
- [ ] Preserve shared queue and authoritative owner association; no arbitrary status catalog or duplicate named-action endpoints.

**Tests to add/update:** approved correction/resubmit; forbidden actor/field; missing required PSF data; same-status invariant; direct endpoint bypass; owner association/audit; dirty form interactions.

**Verification commands:** B, H, DB form-version-lifecycle command, F, V, R. **Acceptance:** real competing submit/correction/status/PSF-completion writes and transaction/audit rollback pass; approved flow works end-to-end and rejects equivalent unauthorized calls; no silent policy choice. If more than one independently reviewable workflow emerges, create one successor PR per approved flow before coding.

**Rollback:** disable newly exposed actions and retain stricter old behavior; never migrate statuses back destructively. **Risk:** HIGH. **PR size:** MEDIUM.

### T24 — Restyle dashboard on authoritative metrics

**Goal / why:** Port card/queue presentation after count correctness, not conceal it. Covers dashboard visual recommendation.

**Files/functions:** `frontend/src/components/RequestsWorkspace.tsx` (`DashboardPage`, shared `RequestsTable`); `index.css`; `RequestsWorkspace.test.tsx`. UI reference: `UI:src/app/components/dashboard/SummaryCards.tsx`, dashboard page/layout.

**Dependencies:** T13, T16. **Parallel:** backend domain/export lane; serialize CSS/workspace writers.

**Steps:**
- [ ] Capture current role-specific summary and queue behavior.
- [ ] Port four-card layout and queue hierarchy, using approved labels and server counts; card click semantics must map to supported server filters or remain non-clickable.
- [ ] Keep unavailable/stale summary states explicit and queue limited/total semantics truthful.

**Tests to add/update:** summary independence from loaded rows, role labels, loading/error, card filter mapping if present; keyboard/responsive screenshots.

**Verification commands:** F, V, R. **Acceptance:** approved visual reference without prototype count predicates or misleading totals.

**Rollback:** revert JSX/CSS only; keep T12/T13 metrics. **Risk:** LOW–MEDIUM. **PR size:** SMALL.

### T25 — Admin workstream (completion group, not a PR)

T25 in the graph means all five independently reviewable tasks below. Each covers part of A14, retains existing permissions and requires G-SAFE through T16. Merge T25a → T25b → T25c → T25d → T25e to serialize shared CSS. This is scheduling order, not invented functional coupling; independent non-conflicting reviews can overlap.

#### T25a — Expose existing admin capabilities accurately

**Goal / why:** Make the working workflow editor reachable and stop labeling the export consumer as implemented profile management.

**Files/functions:** `frontend/src/components/Navigation.tsx`; `frontend/src/routes/admin/workflow.tsx`, `frontend/src/routes/admin/export-profile.tsx`; `frontend/src/components/Navigation.test.tsx`.

**Dependencies:** T03, T16. **Parallel:** backend lane; coordinate with T29 navigation, not another navigation writer.

**Steps:**
- [ ] Add role/link regressions for the current backend policy and existing workflow route.
- [ ] Add the missing workflow link and relabel the export consumer; keep existing route URL by default, avoiding unnecessary route migration.
- [ ] If a separately approved route rename is required, preserve the old URL with a minimal redirect and test it; do not introduce profile CRUD.

**Tests to add/update:** authorized navigation, unauthorized role visibility/entry, existing deep links, export-consumer label.

**Verification commands:** F, V, R. **Acceptance:** working features reachable, no unsupported management promise or permission expansion.

**Rollback:** revert navigation-only change while preserving any approved compatibility redirect. **Risk:** LOW. **PR size:** SMALL.

#### T25b — Restyle user management

**Goal / why:** Reuse real role/department administration rather than prototype directory/user mutations.

**Files/functions:** `frontend/src/components/AdminUserManagementPage.tsx`; `frontend/src/index.css`; `frontend/src/components/AdminUserManagementPage.test.tsx`, `AdminUserManagementPage.interaction.test.tsx`.

**Dependencies:** T25a; current user-management API unchanged. **Parallel:** backend export work; no shared CSS writer.

**Steps:**
- [ ] Capture current load/edit/error/last-admin states.
- [ ] Port table/form layout with scoped CSS and existing native controls; retain API save and current local-profile fields.
- [ ] Keep directory search/create/delete absent; verify keyboard and narrow viewport behavior.

**Tests to add/update:** existing role/department save, last-admin denial, load/save failure, labels/focus and disabled state.

**Verification commands:** F, V, R. **Acceptance:** same administration semantics and actual API fields, approved visual hierarchy, no mock profile data.

**Rollback:** revert page/CSS only; retain backend last-admin guard. **Risk:** MEDIUM. **PR size:** SMALL.

#### T25c — Restyle workflow transition administration

**Goal / why:** Improve the real transition editor without replacing it with a mock status catalog.

**Files/functions:** `frontend/src/components/AdminWorkflowTransitionPage.tsx`; `frontend/src/index.css`; `frontend/src/components/AdminWorkflowTransitionPage.test.tsx`, `AdminWorkflowTransitionPage.interaction.test.tsx`.

**Dependencies:** T25a; schedule after T25b for CSS ownership. **Parallel:** unrelated backend work, not T23's frontend changes or CSS writers.

**Steps:**
- [ ] Capture current matrix/role/department save behavior.
- [ ] Restyle existing controls and error states; retain fixed status values and server transition contract.
- [ ] Keep arbitrary status creation/colors-as-domain configuration out of scope; verify keyboard controls.

**Tests to add/update:** load/save failure, approved role/department payload, unchanged fixed statuses, accessible controls.

**Verification commands:** F, V, R. **Acceptance:** actual transition administration unchanged, no client-only rule enforcement.

**Rollback:** revert visual page/CSS only. **Risk:** MEDIUM. **PR size:** SMALL.

#### T25d — Restyle autofill rule administration

**Goal / why:** Present API-backed canonical rules, not prototype page-local settings disconnected from autofill.

**Files/functions:** `frontend/src/components/AdminAutofillRulesPage.tsx`; `frontend/src/index.css`; `frontend/src/components/AdminAutofillRulesPage.test.tsx`, `AdminAutofillRulesPage.interaction.test.tsx`, `adminAutofillRulesState.test.ts`.

**Dependencies:** T25a; schedule after T25c. **Parallel:** backend export work; no shared CSS writer.

**Steps:**
- [ ] Capture create/update/error states for actual rule API.
- [ ] Port rule form/list presentation while preserving canonical identifiers, newest-completed behavior and persisted save feedback.
- [ ] Leave unsupported delete/deactivate controls absent; no hard-coded prototype trigger/target algorithm.

**Tests to add/update:** existing create/update payloads, reload persistence, validation/save failure, labels and keyboard access.

**Verification commands:** F, V, R. **Acceptance:** UI saves real configured rules and makes no unsupported operation appear available.

**Rollback:** revert page/CSS only; keep persisted rules and existing service behavior. **Risk:** MEDIUM. **PR size:** SMALL.

#### T25e — Restyle schema JSON administration

**Goal / why:** Improve the working JSON/version/preview/publish interface without building a new visual form designer.

**Files/functions:** `frontend/src/components/AdminFormConfigPage.tsx`; `frontend/src/index.css`; `frontend/src/components/AdminFormConfigPage.test.tsx`, `AdminFormConfigPage.interaction.test.tsx`.

**Dependencies:** T25a; schedule after T25d and serialize with T22. T22 is not mandatory if PSF configuration remains deferred.

**Parallel:** backend export work only when no editor/CSS overlap.

**Steps:**
- [ ] Capture current dirty/save/preview/publish/version-conflict states.
- [ ] Restyle existing JSON controls/version list/preview; preserve supported schema capabilities and current publish lifecycle.
- [ ] Do not add Monaco/CodeMirror, drag-and-drop, unsupported file fields or dynamic PSF claims unless separately approved and implemented.

**Tests to add/update:** invalid JSON, dirty-state protection, save/publish/version conflict, preview, existing snapshot behavior, keyboard labels.

**Verification commands:** F, V, R. **Acceptance:** current schema administration remains functional and honest about supported sections/controls.

**Rollback:** revert presentation only; preserve published schema versions and existing JSON editor. **Risk:** MEDIUM. **PR size:** SMALL.

### T26 — Align export filters and date boundaries

**Goal / why:** Make approved list/export populations agree and include the intended final day. First part of A15.

**Files/functions:** `backend/src/export/export.controller.ts`; `backend/src/requests/search-index.service.ts`; `frontend/src/services/request-export.ts`, `components/RequestExportPage.tsx`; tests `export.controller.spec.ts`, `search-index.service.spec.ts`, `RequestExportPage.test.tsx`.

**Dependencies:** T04, T10 (DB projection suite), D01/D02; follow the shared predicate ownership rule in §4. Reuse any earlier T12 date/scope correction; if T26 lands first, it owns the minimal existing-service correction under D02. No dashboard-endpoint dependency. **Parallel:** non-conflicting form/frontend work; serialize index/export files.

**Steps:**
- [ ] Approve exact supported filter set; do not imply prototype FAB/date/owner filters already exist.
- [ ] Add end-of-day/timezone boundary and list/export population parity cases.
- [ ] Reuse canonical date predicates and actor scope; expose only approved additive filters in DTO/client and keep existing downloads backward compatible.
- [ ] Validate invalid/reversed dates rather than broadening results on parse failure.

**Tests to add/update:** final-day records, next-day exclusion, reversed/invalid date, role masking, approved filter parity, old client without new filters.

**Verification commands:** B, H, F, DB request-projections command for date/filter population, R. **Acceptance:** export selection matches documented semantics and never broadens authorization.

**Rollback:** remove new filter controls first; retain corrected date validation and current-actor checks. **Risk:** MEDIUM. **PR size:** MEDIUM.

### T27 — Make export dataset/size behavior explicit and bounded

**Goal / why:** Avoid silent OFFSET drift and unbounded assumptions; implement only approved scale needs. Part of A15.

**Files/functions:** `backend/src/export/excel_export.service.ts`; `export-job.processor.ts`; `export.controller.ts`; `backend/src/requests/search-index.service.ts`; tests `excel_export.service.spec.ts`, `excel_export.worker.spec.ts`, `export-job.processor.spec.ts`; proposed new `backend/test/export-consistency.e2e-spec.ts` using the DB safety contract above.

**Dependencies:** T26, D06 worker topology, D07 scale/recovery, AR5, M/O. **Parallel:** frontend visuals; no concurrent export/index writer.

**Steps:**
- [ ] Agree snapshot/consistency semantics, row/memory limit and sync/async threshold; document current `>2000` behavior rather than silently changing it to `>=2000`.
- [ ] Add mutating-dataset regression that detects duplicate/omitted rows under the approved semantics.
- [ ] Choose the smallest existing PostgreSQL/ExcelJS-supported strategy that satisfies those semantics, such as a consistent transaction snapshot with deterministic ordering; do not assume keyset pagination alone provides a point-in-time snapshot.
- [ ] Measure representative memory/time. Use existing ExcelJS streaming only if the agreed budget requires it; do not add queue infrastructure or streaming abstraction speculatively.
- [ ] Under D06/D07 define worker count, claim ownership, stalled-running detection interval, maximum attempts/backoff/elapsed budget and terminal failure representation before coding recovery. Choose safe terminal failure requiring a new authorized job or bounded requeue; retries must reauthorize and must never republish revoked/partial content. Preserve legacy job/old-client interpretation under M.
- [ ] Exercise worker termination after claim, during generation and before publication; restart must yield exactly one valid published outcome or an explicit terminal failure, not a permanently running job. Reuse existing repository/worker transactions. For multiple workers, test atomic claim, ownership/lease or equivalent fencing and cleanup coordination with separate DB connections; if deployment guarantees one worker, document/enforce that ceiling and test restart without introducing distributed infrastructure.

**Tests to add/update:** insert/update during export under declared consistency rule, threshold edge, maximum/over-limit behavior, error cleanup, role masking and workbook cells including approved native dates.

**Verification commands:** B, H, DB export-consistency command, R. Run the same guarded integration command with a representative approved fixture population and capture elapsed time plus Node process peak/RSS measurements from the test; record fixture size, budget and actual output in PR evidence. T27 owns its integration check and does not depend on the later T30 harness.

**Acceptance:** no silent result-set drift under promised semantics; enforce documented ceiling. A deliberate bounded in-memory implementation gets a `ponytail:` comment naming ceiling and streaming upgrade path.

**Rollback:** reduce/disable large exports or pause jobs; retain safe authorization and stable existing artifact handling. **Risk:** HIGH. **PR size:** MEDIUM; streaming optimization is a separate PR if needed, not hidden in consistency fix.

### T28 — Expire and clean export content safely

**Goal / why:** Stop indefinite artifact storage according to approved retention, without deleting active jobs. Part of A15.

**Files/functions:** `backend/src/export/export-job.repository.ts`; `export-job.processor.ts`; `export.controller.ts`; tests `export-job.repository.spec.ts`, `export-job.processor.spec.ts`, `export.controller.async.spec.ts`.

**Dependencies:** T04, T27 (recovery contract and DB suite), D07 retention/legacy-expiry approval, M/O. **Parallel:** domain/frontend lane, not T27/T29 shared export writers.

**Steps:**
- [ ] Add expiry/read/cleanup race tests using the approved lifetime.
- [ ] Persist or derive explicit expiration using server time; deny expired download before serving content.
- [ ] Add bounded idempotent cleanup via the existing worker lifecycle if appropriate; do not introduce a separate scheduler/framework without need.
- [ ] Preserve required non-content audit/job metadata and avoid deleting processing jobs; document retention implications before enabling cleanup. D07 must explicitly decide expiry/retention for pre-existing artifacts and required legacy metadata before any destructive apply.
- [ ] Reuse T27 claim/recovery coordination: cleanup cannot delete bytes being published, resurrect expired jobs or remove active processing state. Prove competing download/expiry/publication/cleanup transactions in the shared real DB suite before enabling deletion, including repeated cleanup and worker restart; emit O counts/failure evidence.

**Tests to add/update:** before/at/after expiry, repeated cleanup, processing job retained, download race, store error, metadata retention.

**Verification commands:** B, H, DB export-consistency command extended for real expiry/claim/cleanup races, R; T30 reruns this evidence. **Acceptance:** approved bytes expire and are reclaimed; no active-job deletion or expired content serving.

**Rollback:** pause destructive cleanup while retaining expired-access denial. Deleted bytes are not recoverable by code revert; regeneration requires a new authorized job. **Risk:** HIGH. **PR size:** SMALL.

### T29 — Restyle export consumer and complete job UX

**Goal / why:** Present the actual backend XLSX/job lifecycle, not client CSV or fake profile settings. Completes A15's frontend scope.

**Files/functions:** `frontend/src/components/RequestExportPage.tsx`; `services/request-export.ts`; `routes/admin/export-profile.tsx`; tests `RequestExportPage.test.tsx`, `RequestExportPage.async.test.tsx`, `services/request-export.async.test.ts`.

**Dependencies:** T26, T27, T28, T16; G-SAFE, D07 polling/lifecycle, AR5, V16. **Parallel:** backend schema lane; coordinate T25 navigation.

**Steps:**
- [ ] Render approved filters and clear queued/running/failed/denied/expired/completed states through existing API-relative URL resolution.
- [ ] Stop polling on logout, terminal states or unmount; never retry a revoked download as though it were a transient network error. Before coding, D07/T27 contract provides maximum polling duration/attempts, bounded backoff and restart/stalled-job representation. On budget exhaustion show an honest unresolved/status-refresh state with explicit manual retry; do not claim server cancellation or re-enqueue automatically. Test request count/time bounds and a worker crash/restart flow.
- [ ] Port layout only, retaining backend XLSX downloads; do not add export-profile CRUD or client masking.

**Tests to add/update:** sync/async boundary, denial after demotion, expiration, failure, transient polling error, cancellation/unmount, API base-path download, keyboard controls.

**Verification commands:** F, V, R. **Acceptance:** no fabricated success/download; actual lifecycle and permissions visible accurately.

**Rollback:** revert layout while retaining security-aware terminal-state handling; disable large export entry if incompatible. **Risk:** MEDIUM. **PR size:** SMALL.

### Post-release acceptance (owned by T30 and deployment owner)

Before deployment, record the named operator and independent release reviewer, approved live test accounts/requests, exact target/build/config versions, smoke commands/browser steps, expected results, log location, observation duration and rollback commands from M. Do not run destructive tests on real user records; test-data cleanup/retention is approved separately and must not erase audit evidence.

Execute and retain live evidence in this order:
1. **Deployment/migrations:** verify actual app/worker versions and M migration completion/lock release; reconcile source/target/legacy counts with zero unexplained mismatches. Confirm no unsafe old writer/worker remains before resuming affected intake.
2. **Identity and denial:** through real TLS/proxy, login with approved LDAP accounts, deny anonymous protected access, requester B reading/writing requester A's test request, unauthorized PSF/admin/global-history access and another user's export job. Test current-role revocation with a disposable account, not by demoting a real operator/last admin.
3. **Create/read/write:** create/save/reopen the approved draft, find it via scoped list/pagination, read detail/history and perform the allowed submit/PSF/status flow included in the manifest. Verify resulting source/projection/audit and summary semantics, not merely HTTP 200; preserve cleanup evidence and approved historical retention.
4. **Export:** verify sync XLSX and async enqueue→processing→terminal→authorized download, denial after revocation, explicit failure/recovery and expired access under approved safe fixtures. Validate actual workbook content/masking, not only a download link. Staging may use accelerated expiry; never shorten real users' retention merely to make live smoke convenient.
5. **Session restart where applicable:** perform an approved controlled restart and verify D06's promised persistence or logout, old-ID invalidation and secure cookies. Do not casually restart production to test a promise already outside the release change; record applicability and representative staging evidence with reviewer acceptance.
6. **Observation:** proposed minimum is 24 hours **and** at least one real worker recovery/stall-check and retention-cleanup cycle; deployment owner/reviewer must approve this or a justified concrete replacement before rollout. Watch O errors, lock/latency/memory budgets, queue age/retries and reconciliation mismatch counts. A cleanup cycle with zero eligible rows is recorded as such; real byte-reclamation proof must still exist in staging, never invent a live deletion. Missing observation/cycle evidence blocks final production completion.
7. **Stop/rollback:** any unauthorized data/bytes, lost/rewritten history, duplicate identifier, unexplained migration mismatch, broken logout/session isolation or incompatible old writer stops rollout immediately. Repeated store/worker failures or breached agreed budgets pause affected writes/jobs. Deployment owner uses the reviewed safe rollback/forward-fix procedure from M, then repeats authorization, key reads/writes, job-state and count checks on the actual rollback target. Preserve evidence; do not restore vulnerable behavior or destructively erase post-deploy writes.

T30 closes only after the reviewer signs the observed live results, manifest, Handoff inventory and remaining explicitly retained compatibility items. No access, missing approver or uncompleted observation means **release blocked**, not a local success claim.

### T30 — Verify release candidate and synchronize final documentation

**Goal / why:** Prove the integrated runtime beyond mocks and record what actually ships. Closes all approved backlog tasks' release gates.

**Files/functions:** proposed new `backend/test/production-ui-contract.e2e-spec.ts`; relevant existing regression suites; `README.md`, `CONTEXT.md`, spec/affected ADRs and this plan's execution status. UI reference repo remains untouched. Deployment configuration locations must come from D06, not invented paths.

**Dependencies:** all approved in-scope tasks, AR5, actual staging access. **Parallel:** independent review of non-overlapping completed PRs; no competing release/migration writer.

**Steps:**
- [ ] Assemble exact merge SHAs/task evidence and list approved deferred scope separately; confirm test harness uses only approved disposable DB and no unintended startup mutations.
- [ ] Run full F/B/H, relevant DB suites and role-based browser flows: LDAP/session refresh/logout, create/save/reopen/submit, version upgrade, PSF visibility/concurrency, allowed/denied transitions, history, accurate summary/paging and sync/async export with revocation/expiry.
- [ ] Test dataset growth and populated legacy schema upgrade/backfill, TLS/proxy cookies, process restart and approved retention. Use real approved LDAP staging for integration; otherwise mark that gate blocked.
- [ ] Assemble and execute the ordered M runbooks on populated representative data, including old/new readers, startup/worker sequencing, original-data preservation and rollback after new writes. Review O logs and stop budgets; update canonical docs and preserve unsupported capability labels.
- [ ] Obtain independent security/domain/UI review; deployment owner executes Post-release acceptance above through the approved staged release and observation window. Sign per-screen authority handoff and retirement inventory, record exact live smoke/rollback results, and clean approved test artifacts without erasing required history. No remote success claim from local evidence alone.

**Tests to add/update:** reusable minimum Jest/Supertest integration cases for real DB contracts and export consistency/cleanup; existing frontend regression harness for lifecycle regressions; browser evidence for actual interaction/accessibility.

**Verification commands:** F, B, H, all applicable DB commands, V via staging TLS, R. **Acceptance:** every approved phase DoD has evidence; no required test silently skipped, no unresolved applicable product gate, no known authorization/data-loss regression. Mock HTTP tests remain labeled mock-backed.

**Rollback:** execute reviewed deployment rollback, pause affected writes/jobs as necessary, retain additive data/snapshots/audit and compatibility migrations; verify post-rollback authorization and key reads. **Risk:** HIGH. **PR size:** MEDIUM for final tests/docs; deployment is a separate approved operation, not a giant integration rewrite PR.

## 8. Deferred tasks (A16 and intentionally conditional scope)

These are not disguised prerequisites. Each requires D09 and a fresh small task contract before implementation; no unused production file is created now. Exact new production paths depend on the approved capability boundary, so they are not falsely presented as existing.

### DEF01 — Real attachments

**Goal / why:** Only if binary files are genuinely required; replace simulation with authorized durable references, not filename strings.

**Likely files/functions:** `backend/src/requests/requests.controller.ts`, `requests.service.ts`; `frontend/src/components/DynamicFormRenderer.tsx`, `types/forms.ts`; existing form-schema publisher. UI `FileUpload.tsx` is reference only. Storage/controller paths require AR3/D09 review.

**Dependencies:** D09, D04, T21/T22 if schema file capability is approved. **Parallel:** separate approved storage workstream, not concurrent request/schema writers.

**Steps:** approve storage/size/type/access/scanning/retention contract; add unauthorized/invalid-upload tests; implement real upload/reference/download and schema validation; expose control only after backend passes.

**Tests:** real bytes round trip; MIME/size rejection, ownership, hidden PSF attachment, download authorization, partial upload cleanup and unavailable storage.

**Verification commands:** B, H, F, DB/V for approved storage environment, R. **Acceptance:** durable access-controlled bytes, no fake blob/download. **Rollback:** disable new uploads; preserve authorized reads and retention obligations. **Risk:** HIGH. **PR size:** MEDIUM per storage-contract and UI PR; no combined LARGE implementation.

### DEF02 — Export-profile management

**Goal / why:** Add genuine profile CRUD only if configurable export layouts are required; current export consumer is not an editor.

**Likely files/functions:** `backend/src/export/excel_export.service.ts`, export repository/controller; `frontend/src/routes/admin/export-profile.tsx`, `components/RequestExportPage.tsx` for separating consumer navigation. New admin profile API/editor paths approved before coding.

**Dependencies:** D09, T26/T27, AR5. **Parallel:** unrelated UI only; serialize export lane.

**Steps:** approve profile schema/role/version policy; add validation/authorization tests; implement minimal persistence and exporter consumption; then editor preserving consumer deep links.

**Tests:** invalid/duplicate column mapping, permission denial, existing default profile unchanged, workbook order/types/masking, concurrent save.

**Verification commands:** B, H, F, V, R. **Acceptance:** actual persisted profile drives XLSX without bypassing masking. **Rollback:** select last approved profile/default; retain profile history. **Risk:** MEDIUM–HIGH. **PR size:** MEDIUM per API and UI PR.

### DEF03 — Corporate directory administration / extra user operations

**Goal / why:** Add directory search/create/delete only if required beyond current local role/department management.

**Likely files/functions:** `backend/src/auth/auth.service.ts`, existing admin user-management controller; `frontend/src/components/AdminUserManagementPage.tsx`; existing user-management/auth tests.

**Dependencies:** D09, D01, T03/T05. **Parallel:** unrelated visual lane; no concurrent auth writer.

**Steps:** approve directory authority and deletion/revocation rules; add unauthorized/last-admin/directory-failure tests; implement only approved external operation; expose UI after API contract works.

**Tests:** directory errors, last-admin safety, account revocation invalidates sessions/jobs, no client-supplied identity authority, audit.

**Verification commands:** B, H, F, V on approved directory staging, R. **Acceptance:** no prototype local-user/password store. **Rollback:** disable new operations, retain ordinary login/role administration and account/audit records. **Risk:** HIGH. **PR size:** MEDIUM per approved operation.

### DEF04 — Notifications

**Goal / why:** Add delivery only for approved business events; do not port mock header notifications or claim an email service exists.

**Likely files/functions:** `backend/src/requests/requests.service.ts`, existing audit transaction boundary; `frontend/src/components/AppShell.tsx` only if in-app notifications approved. New delivery integration requires provider/transaction review.

**Dependencies:** D09, D01/D03/D08, T18/T23. **Parallel:** independent delivery integration after event contract; serialize request-service edits.

**Steps:** approve recipients/content/delivery consent and retry policy; test no send on failed transaction; implement minimal idempotent delivery through approved existing capability; expose delivery status honestly.

**Tests:** duplicate event, retry, denied recipient, redacted PSF content, provider failure and rollback transaction.

**Verification commands:** B, H, F if UI added, approved sandbox delivery read-back, R. **Acceptance:** delivery evidence and no sensitive leak/duplicate flood. **Rollback:** stop sends; retain approved delivery/audit records, do not resend old backlog automatically. **Risk:** HIGH. **PR size:** MEDIUM per delivery channel.

### DEF05 — Visual form builder

**Goal / why:** Only if JSON editing measurably fails approved admin needs; not necessary for visual migration.

**Likely files/functions:** `frontend/src/components/AdminFormConfigPage.tsx`, `DynamicFormRenderer.tsx`; `backend/src/admin/form_schema.service.ts`; existing schema tests. Prototype builder is reference, not runtime source.

**Dependencies:** D09, AR3, T20–T22. **Parallel:** unrelated export lane; no concurrent schema/editor writer.

**Steps:** approve limited supported operations; test JSON round-trip preserving unsupported-but-valid metadata; build smallest native controls using current schema API; keep publish/version/dirty semantics unchanged.

**Tests:** builder→JSON→builder lossless round-trip, unique keys, invalid field rejection, historic snapshot unchanged, keyboard editing.

**Verification commands:** F, B/H if publisher changes, V, R. **Acceptance:** no second schema model or unsupported field controls. **Rollback:** retain JSON editor and existing persisted schemas. **Risk:** MEDIUM–HIGH. **PR size:** SMALL per editing capability, not a full builder rewrite.

### DEF06 — Arbitrary status catalog

**Goal / why:** Only if product explicitly requires statuses beyond current fixed catalog; transition matrix styling does not require it.

**Likely files/functions:** `backend/src/admin/workflow_transition.service.ts`, `backend/src/requests/requests.service.ts`, `search-index.service.ts`, `backend/src/export/excel_export.service.ts`; `frontend/src/services/api.ts`, `RequestsWorkspace.tsx`; existing workflow/search/export tests.

**Dependencies:** D09, D01/D02/D03, AR4, T23. **Parallel:** none in shared domain lane until contract is frozen.

**Steps:** approve terminal/open/overdue/export semantics and legacy compatibility; break into additive catalog contract then consumers; implement only approved statuses without renaming historical values; never import prototype `allStatuses` as authority.

**Tests:** old statuses readable, unknown target denied, approved matrix enforced, aggregate/export classification and historic audit stable.

**Verification commands:** B, H, F, DB/V, R. **Acceptance:** every consumer has explicit semantics; otherwise task remains deferred. **Rollback:** disable new transitions, retain catalog/history needed to read existing records. **Risk:** HIGH. **PR size:** MEDIUM per contract/consumer slice; LARGE cross-system PR forbidden.

## 9. Backlog traceability

| Audit item | Execution tasks / disposition |
|---|---|
| A01 Architecture/contract decisions | T01; D01–D09; AR0; documentation with owning PR and T30 |
| A02 Frontend session lifecycle | T03 |
| A03 Server session deployment | T05; D06/AR1 |
| A04 Export reauthorization | T02 + T04 |
| A05 Validation/same-status | T06 + T07 |
| A06 Request numbering | T08 |
| A07 Draft/PSF projections | T09 + T10 |
| A08 Summary/browsing | T11 + T12 + T13 |
| A09 Detail synchronization | T14 + T15 |
| A10 First visual slice | T16 |
| A11 Schema mapping/PSF versioning | T20 + T21 + conditional T21R + T22; D04/AR3 |
| A12 Audit/history | T18 + T19 |
| A13 Workflow gaps | T23; D01/D03/AR4 |
| A14 Admin navigation/restyle | T25 (navigation then one PR per existing screen) |
| A15 Export alignment | T26 + T27 + T28 + T29 |
| A16 Conditional capabilities | DEF01–DEF05; arbitrary statuses separately DEF06 |
| Other audited visual recommendations | T17 detail/forms; T24 dashboard |
| Cross-cutting real release verification | T30 |

## 10. Final target architecture and release definition of done

```text
UI_Web_Setup_file @ pinned reference SHA
  visual hierarchy / spacing / selected interactions only
                     │ selective recreation, never runtime dependency
                     ▼
Web-Request-setup-file/frontend  [SOLE PRODUCTION FRONTEND]
  TanStack routes + coherent session invalidation
  Existing typed API client + export lifecycle client
  Server-scoped dashboard aggregates and paged requests
  Coordinated detail / dirty-state protection
  Existing dynamic renderer and explicit version/upgrade lifecycle
  Existing API-backed admin editors, selectively restyled
                     │ cookie session / existing API boundaries
                     ▼
Web-Request-setup-file/backend
  LDAP authentication + current local roles/departments
  Approved production session store / proxy trust configuration
  Server authorization, validation, atomic numbering, workflow
  Immutable requester snapshots
  Approved versioned PSF lifecycle (only if T21/T22 accepted)
  Transactional projections and actual audit events
  Current-actor-authorized exports with declared consistency/retention
                     │ transactions / constraints / scoped queries
                     ▼
PostgreSQL + approved deployment integrations
```

- [ ] Only the main frontend is deployed; no UI prototype runtime/router/context dependency.
- [ ] Approved decision gates have named approval; unresolved or deferred capabilities are explicitly absent/disabled and described accurately.
- [ ] Every shipped task has a small reviewable diff, named regressions, actual command outputs, appropriate DB/browser evidence and independent review.
- [ ] Backend permissions remain authoritative at every read/write/export stage; no client-generated audit/IDs/timestamps substitute for persisted truth.
- [ ] Dynamic forms and old snapshots survive publication/migration; approved PSF versioning is tested or its fixed-schema limitation remains documented.
- [ ] Counts/search/history/export are truthful about population, visibility, date boundaries and retained evidence.
- [ ] Existing and new flows meet keyboard/accessibility basics and responsive acceptance on real rendered main UI.
- [ ] Additive data changes/backfills have explicit safe-target, retry, privacy and rollback review; no destructive reversal of historical identifiers/snapshots/audit.
- [ ] Documentation describes the verified released implementation, not the prototype or prior intent. Historical mock-backed test results are not presented as fresh/live release proof.
- [ ] No speculative frameworks, abstractions, visual builders, file storage or services were added. New dependency proposals require the documented concrete need and architecture approval.
- [ ] Dependency-closed MVP manifest and every applicable D01–D09/V06 decision have named approval; task gates, G-SAFE/V16 and scoped architecture reviews have recorded evidence. Deferred scope is not counted as shipped.
- [ ] Shared guarded PostgreSQL tests prove transaction races, rollback and audit atomicity at T07/T20/T23, reconciliation/live-write safety at T10/T21R, and worker/cleanup recovery at T27/T28; deferring dynamic PSF does not skip requester lifecycle tests.
- [ ] Every applicable M runbook has exact owner/entry point/target/lock/order/compatibility/abort/rollback evidence, including after new data is written; no migration is left to deployment-time guesswork.
- [ ] Existing logger provides reviewed O events without sensitive payloads; operational budgets, stop criteria and deployment ownership are recorded.
- [ ] Every migrated screen has accepted main evidence and authority handoff. Dead assets/docs are removed/archived or explicitly retained for a named compatibility need with owner and bounded follow-up gate; historical ADRs remain intact.
- [ ] Final deployment, role-denial/create-read-write/export/session/migration-count smoke and the approved observation/worker-cleanup window are verified against the actual target and signed by the independent reviewer before anyone claims production completion.

**Implementation status when this plan was written: not started.**

# Configurable PSF Created Information — approved implementation contract

> **Historical scoped plan (2026-10-02 audit):** This records the original task scope, approvals, execution instructions and checkpoints. It is not current implementation guidance or new authorization to execute commands, change data, configure agents or deploy. Historical verification claims apply only to their recorded environment and scope. Use [Current implementation](../current-implementation.md) for the checked-in baseline.

## Goal and boundaries
Allow administrators to configure PSF Created Information through the existing Form Management visual editor and version lifecycle. Work only in `/opt/data/Web-Request-setup-file/.worktrees/rapid-frontend-rewrite`. Do not modify `local-test-auth`, authentication code, global Hermes config, main, or unrelated features. Commit only after independent review and real verification; do not push.

The user approved separate PSF versions, snapshots for new requests, legacy compatibility without rewriting historical values, and the addition of one nullable snapshot column to the existing `psf_requests` table. No new schema engine or third-party dependency. Coding child agents run `openai-codex` / `gpt-6-luna-900k` / reasoning `max`; Hime retains its model.

## Shared API contract
- Supported form keys are exactly `psf-request` and `psf-created-information`.
- Extend existing `/api/admin/form-config` list/save/duplicate/publish/discard endpoints with an optional `formKey` query parameter. Omission preserves existing requester behavior and existing URLs/payloads. For PSF, append `?formKey=psf-created-information` to each endpoint.
- Existing response and payload shapes remain unchanged. List response `formKey` and each schema's `formKey` must match the selected form. Reject unsupported/malformed query keys and mismatched save payload keys. Keep admin-only guards.
- Store both form families in existing `form_definitions`, with independent versions, a single draft per form key, per-form transaction locks, immutable published versions, and existing Duplicate -> Draft -> Save -> Publish / Discard semantics.
- Generalize common schema validation, while retaining requester-specific identity/runtime constraints only for `psf-request`. Preserve restricted-legacy checks and reject unsafe field/canonical keys, duplicate keys, unsupported types, and invalid choices.

## Request and database contract
- Add only `psf_created_schema_snapshot_json JSONB NULL` to `psf_requests`, using existing idempotent storage initialization/additive schema pattern. Do not backfill or overwrite existing request values, requester snapshots, or historical audit data.
- Seed PSF v1 from the exact current fixed `PSF_CREATED_INFORMATION_SCHEMA`, preserving its keys, labels, types and options. Keep an immutable legacy descriptor for old rows; it is reconstructed compatibility metadata, not a historically captured snapshot.
- New requests capture the active PSF schema on creation. Capture must be consistent under publication races; use existing transaction/locking patterns. Existing requests with a NULL/absent PSF snapshot continue to use the immutable legacy descriptor.
- `psfCreatedInformationSchema` in existing request responses now resolves from the request's own snapshot or legacy descriptor. Never resolve historical rows against the currently active PSF schema.
- Requester schema upgrades do not silently upgrade PSF snapshots.
- PSF saves validate against that same request descriptor. Preserve optimistic concurrency (`expectedUpdatedAt`) and actor/status guards. Allow partially completed required fields on Save. Reject malformed supplied values/options instead of silently losing them; cleared optional values must still clear correctly.
- Before transitioning to `PSF Created`, require all required PSF fields from that request descriptor. Preserve all other workflow transition rules, transaction rollback and audit behavior.
- Requesters cannot edit PSF data and cannot receive its values before `PSF Created` or `Completed`. Setup File Owners remain editable before `Completed`; Admin retains existing permissions. No `visibleTo` reintroduction.

## Export contract
Use the stored PSF descriptor to interpret each record. Excel columns must retain fields from exported old/legacy snapshots even when absent from the current active PSF definition. Reuse canonical identities and existing serialization/masking; define deterministic column order/labels (active fields first, then missing historical fields). Preserve synchronous and worker exports and requester-before-PSF-Created cell masking. Do not modify requester export policy gratuitously.

## Frontend contract
- Add a native form selector to existing Form Management: Requester Information / PSF Created Information.
- Reuse existing version list, field dialog, Preview, Apply/Cancel, Save, Publish and Discard, including the corrected Choices hierarchy and vertical generic radios.
- Use shareable, form-key-aware navigation. Keep the existing requester `/admin/form-config/$version` URLs working; new explicit form-key/version routes may share existing editor components. Back and breadcrumb must preserve the selected form. Switching form/version resets local draft safely and honors unsaved-change guards.
- Generalize draft parsing/validation for the two supported keys, without requiring requester identity fields in PSF definitions. Preserve key/canonical identities; do not expose identity renaming controls.
- The existing `PsfCreatedInformationPanel` already consumes the returned schema and `DynamicFormRenderer` already uses `noValidate`; no new renderer/validation mode is required to allow partial saves. Add only the changes actually needed.
- New controls remain accessible; unsupported file upload is not offered. Attachment stays a text reference.
- Verify response form identity before treating a returned list as the selected form; an old backend must not silently masquerade requester configuration as PSF.

## Execution and ownership
1. Backend child owns `backend/**` only: schema lifecycle/controller, requests, export/search DTO propagation, tests. Move shared fixed PSF schema to a small existing-architecture-compatible constants module if necessary to avoid circular imports; preserve existing named exports/import compatibility where useful.
2. Frontend child owns `frontend/**` only: API helper, types/state, routing/layout/editor wiring and focused tests. Regenerate the route tree with canonical build tooling. Do not change backend files.
3. Hime owns this plan, scoped documentation, temporary verification scripts/runtimes, review integration, and final commit. Children do not commit, push, spawn further agents, alter auth, or write to live databases. Child tests use existing mocks/test harnesses; real DB lifecycle checks are coordinated by Hime.

## Gates and acceptance
- [x] Both children follow RED -> GREEN with focused regressions; retain existing tests and authorization checks.
- [x] Independent spec review passes, followed by independent quality/integration review; fix all material findings before claiming completion.
- [x] Backend unit/e2e tests, lint without autofix outside scope, and build pass; frontend tests, lint and TypeScript/build pass; `git diff --check` passes.
- [x] Real PostgreSQL verifies the nullable column, independent PSF lifecycle, new snapshot capture, old-record invariance, optimistic conflicts, required-before-status, and rollback/cleanup of temporary data.
- [x] Real browser verifies both form families, PSF duplicate/edit/save/preview/publish behavior, historical read-only states, required fields, requester/owner/admin permissions, and desktop/mobile dialog layout. Use an isolated authorized runtime when the existing auth worktree backend is stale; no tracked production dev-auth code and no change to local-test-auth.
- [x] Real Excel export retains old and new PSF fields and masks requester cells correctly.
- [x] Document actual schema/legacy/runtime behavior and any genuine blocker. Never substitute mocked results for live verification.
- [x] Final worktree is committed, clean, and unpushed. Local-test-auth remains untouched.

## Verified integration evidence
- Independent backend/frontend SPEC rereviews, focused calendar-date SPEC review (8 tests), and final quality/integration review approved. Quality independently ran 5 export/search/upgrade tests and 2 optimistic-race tests and exercised an in-memory actual-worker XLSX round-trip; these checks are separate from the live synchronous-export evidence. The minor PSF publish confirmation was made family-specific, with requester wording unchanged and a verified RED -> GREEN regression.
- Backend: 398 unit tests and 18 e2e tests passed; lint without autofix and Nest build passed. Frontend: 186 tests, lint, TypeScript check, and production build passed. `git diff --check` passed.
- A user-authorized disposable PostgreSQL schema exercised the additive nullable JSONB migration. Six copied legacy requests retained NULL PSF snapshots and unchanged original values; six new requests retained their captured descriptors. Requester v3 and PSF v4 were independently active. A real concurrent request-creation/publication test captured a complete v3 snapshot while v4 published.
- Real browser controls verified PSF Duplicate, edit/add/order/remove fields, Save, Preview, Publish and Discard; native radio/date/textarea rendering and multiline saves; a contained 390px field dialog; cancellation of dirty-sidebar navigation; and a delayed real duplicate response that did not override Back navigation.
- Real APIs verified incomplete saves, clearing optional data, required-before-status rollback with unchanged audit history, stale `expectedUpdatedAt` conflicts, role/status permissions, old-snapshot choice validation, calendar-date validation, and fail-closed malformed queries/schema identities/options/canonical collisions.
- Real frontend-origin Excel downloads and ExcelJS round-trips retained v1/v2 historical fields absent from active v3, preserved multiline/date values, ordered active columns before missing historical columns, and masked Requester PSF cells before PSF Created. Synchronous export was tested live; existing tests cover the worker path.
- Verification runtimes were stopped before namespace deletion; the namespace was read back as absent and isolated ports 3005/5301 were closed. All nine public-table hashes/counts matched before and after cleanup. Production authentication, the main checkout, and `local-test-auth` were not modified. Temporary fixture login and verification scripts remained outside tracked source.

# Documentation index

Scope: current `main`, including the 7 October Draft lifecycle and team-filter
updates. The previous alignment used `745ae99` after the email merge on 6 October.
This index distinguishes maintained guides from
dated specs, plans, decisions and verification records. The original documentation
audit was 2026-10-02; those historical records keep their original scope.

Read [current implementation](current-implementation.md) and the package READMEs
for present behavior. Source code is authoritative. Product specs, ADRs and plans
retain their original bodies as history, with visible status notices; they do
not prove current implementation, live GitHub state or deployment.

A verification record proves only its dated named checks. Read-only PostgreSQL
connectivity is distinct from application startup, feature writes, company LDAP
or connected-browser acceptance. Do not copy secrets from local configuration
into documentation or version control.

## Maintained guides

| Document | Use/scope |
| --- | --- |
| [Request Attachments and request IDs](request-attachments.md) | NAS folder layout, reconciliation, access and the Attachment Policy, request numbering, screens and dated verification scope (issues #78, #89 and #97) |
| [Draft management and reminders](draft-management-and-reminders.md) | Admin readonly inspection, creator/Admin permanent deletion, cleanup, seven-day notification and team filters |
| [docs/email-notifications.md](email-notifications.md) | Destination-status recipients, outbox/worker, safe configuration and dated offline/LAN verification scope; merged into main |
| [docs/status-catalog-and-manual-updates.md](status-catalog-and-manual-updates.md) | Exact PostgreSQL Status strings, classification and no automatic action-driven status changes |
| [docs/audit-history-access.md](audit-history-access.md) | Implemented Audit History access for every authenticated role, superseding older Admin-only requirements; dated verification scope |
| [docs/initial-data-load.md](initial-data-load.md) | One-time workbook reset: usage, clearing scope, mapping rules and known consequences |
| [CONTEXT.md](../CONTEXT.md) | Current domain glossary |
| [README.md](../README.md) | Project entry point and development scope |
| [backend/README.md](../backend/README.md) | Backend environment, startup writes and commands |
| [docs/README.md](README.md) | This documentation inventory |
| [docs/current-implementation.md](current-implementation.md) | Source-backed behavior, APIs, persistence and limits |
| [docs/diagrams.md](diagrams.md) | Current logical runtime/auth/workflow/export diagrams |
| [docs/local-development-auth.md](local-development-auth.md) | Remote/local database setup, mock guards and removal |
| [frontend/README.md](../frontend/README.md) | Frontend environment, routing and commands |

## Recent feature specs and plans

These documents describe agreed requirements and the implementation checklist.
Use the current implementation guide and dated verification records for completed
behavior and test outcomes.

| Document | Use/scope |
| --- | --- |
| [Draft lifecycle and Product Type team filtering](specs/2026-10-07-draft-lifecycle-and-product-team-filtering.md) | Approved requirements and confirmed system-test scope; implementation guide/verification record current behavior |
| [Draft lifecycle interview notes](specs/2026-10-07-draft-lifecycle-requirements-notes.md) | Recorded decisions from the three requirement rounds |
| [Auto-fill Rules and Status recipient design](specs/2026-10-07-autofill-admin-dialogs-design.md) | Active/Inactive selection, modal editing, field labels and recipient layout requirements |
| [Auto-fill Admin Dialogs plan](plans/2026-10-07-autofill-admin-dialogs.md) | Implementation checklist using `/implement` and `/code-review` |

## Research inputs

External research that feeds requirement interviews. It does not describe
current behavior.

| Document | Use/scope |
| --- | --- |
| [Form UX and color accessibility research](design/2026-10-20-form-ux-accessibility-research.md) | General guidance on dynamic-form structure, input errors, request lists and WCAG contrast (Thai); sources not yet verified against the originals |

## Agent and tracker conventions

| Document | Use/scope |
| --- | --- |
| [CLAUDE.md](../CLAUDE.md) | Local conventions; live GitHub labels/issues and tool availability require checking |
| [docs/agents/domain.md](agents/domain.md) | Local conventions; live GitHub labels/issues and tool availability require checking |
| [docs/agents/issue-tracker.md](agents/issue-tracker.md) | Local conventions; live GitHub labels/issues and tool availability require checking |
| [docs/agents/triage-labels.md](agents/triage-labels.md) | Local conventions; live GitHub labels/issues and tool availability require checking |

## Historical decisions and target documents

| Document | Use/scope |
| --- | --- |
| [docs/adr/0001-nestjs-postgresql-backend.md](adr/0001-nestjs-postgresql-backend.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0002-draft-form-version-upgrade.md](adr/0002-draft-form-version-upgrade.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0003-admin-configured-autofill-rules.md](adr/0003-admin-configured-autofill-rules.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0004-write-time-canonical-extraction.md](adr/0004-write-time-canonical-extraction.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0005-manual-workflow-status-transitions.md](adr/0005-manual-workflow-status-transitions.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0006-local-database-authentication.md](adr/0006-local-database-authentication.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0007-admin-json-schema-editor.md](adr/0007-admin-json-schema-editor.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0008-local-filesystem-attachment-storage.md](adr/0008-local-filesystem-attachment-storage.md) | Original design; the 20 October 2026 implementation keeps original file names in per-request NAS folders instead, see [Request Attachments](request-attachments.md) |
| [docs/adr/0009-autofill-resolution-strategy.md](adr/0009-autofill-resolution-strategy.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0010-shared-setup-queue-visibility.md](adr/0010-shared-setup-queue-visibility.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0011-key-by-key-diff-request-audit-logs.md](adr/0011-key-by-key-diff-request-audit-logs.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0012-schema-embedded-master-data.md](adr/0012-schema-embedded-master-data.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0013-excel-export-schema-alignment.md](adr/0013-excel-export-schema-alignment.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0014-current-production-baseline-and-visual-reference-boundary.md](adr/0014-current-production-baseline-and-visual-reference-boundary.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0015-initial-data-load-legacy-form-version-and-request-to.md](adr/0015-initial-data-load-legacy-form-version-and-request-to.md) | Accepted 8 October 2026: Legacy Columns kept as Form Version 1; Request To is Product Type |
| [docs/adr/0016-full-request-snapshot-per-audit-history-entry.md](adr/0016-full-request-snapshot-per-audit-history-entry.md) | Accepted 11 October 2026, implemented in source: every request Audit History entry stores a full Request Snapshot; replaces the no-snapshot choice in ADR 0011 |
| [docs/adr/0018-nas-folder-names-follow-the-sharepoint-export.md](adr/0018-nas-folder-names-follow-the-sharepoint-export.md) | Accepted 21 October 2026 for issue #97, implemented in source: Attachment folder names cut Product_Description to 100 characters and drop trailing dots or spaces, as the SharePoint export did |
| [docs/adr/0019-excel-export-shows-every-field-to-every-role.md](adr/0019-excel-export-shows-every-field-to-every-role.md) | Accepted 21 October 2026: the Excel export and Export Preview list every form field with `NA` for blanks and show PSF Created Information to every role before release |
| [docs/github_issues.md](github_issues.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/github_issues_refined.md](github_issues_refined.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/history/diagrams-target-architecture.md](history/diagrams-target-architecture.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [psf_setup_file_web_application_spec_en.md](../psf_setup_file_web_application_spec_en.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |

## Dated plans and verification

| Document | Use/scope |
| --- | --- |
| [docs/superpowers/specs/2026-10-06-form-management-and-request-assignment-design.md](superpowers/specs/2026-10-06-form-management-and-request-assignment-design.md) | Approved feature design incorporated into the main baseline; current behavior is described in the implementation guide |
| [docs/superpowers/plans/2026-10-06-form-management-and-request-assignment.md](superpowers/plans/2026-10-06-form-management-and-request-assignment.md) | Original feature execution and verification procedure; not a current execution instruction or proof of a passing run |
| [docs/plans/2026-10-01-status-management-and-request-editing.md](plans/2026-10-01-status-management-and-request-editing.md) | Original scoped plan; not a current execution instruction |
| [docs/plans/production-ui-integration-execution-plan.md](plans/production-ui-integration-execution-plan.md) | Original scoped plan; not a current execution instruction |
| [docs/plans/psf-created-information-editing.md](plans/psf-created-information-editing.md) | Original scoped plan; not a current execution instruction |
| [docs/superpowers/plans/2026-09-01-ldap-api-login.md](superpowers/plans/2026-09-01-ldap-api-login.md) | Original scoped plan; not a current execution instruction |
| [Requester as a status email recipient verification](verification/2026-10-21-requester-status-email.md) | Per-status choice to email each request's own Requester in To or CC: PGlite tests through the real services (To, CC, missing address, CC moved to To, no recipient, Imported Request, bulk replacement), settings and modal tests, and before/after screenshots plus queued recipients on a throwaway local database; not deployment or delivery acceptance |
| [Excel export limits verification](verification/2026-10-21-export-limits.md) | PR #95 (`perf/excel-export` with `main` at `620b0a2` merged in): export speed and memory against `main` on 5,570 synthetic requests, the Direct Export slot limit, the Export Memory Limit (including why `--max-old-space-size` needs the builder's own check) and the full backend suites; not deployment acceptance |
| [Excel export application integration](verification/2026-10-21-export-app-integration.md) and [formatting](verification/2026-10-21-export-formatting.md) | PR #95's snapshot-consistent worker export through the compiled HTTP routes and queue at 5,570 and 100,000 synthetic requests, then header and row formatting; the older [scale](verification/2026-10-20-export-scale.md), [concurrency](verification/2026-10-20-export-concurrency.md) and [choice/version](verification/2026-10-20-export-choice-version.md) records are its history; generated fixtures only, not deployment acceptance |
| [Every column in the Excel export verification](verification/2026-10-21-export-all-columns.md) | Every form field with `NA` for blanks, Modified By after Updated At, PSF Created Information for every role (ADR 0019) and the Export Preview showing the file's first 10 rows: before/after screenshots and files on a throwaway local database, and the 5,570-request cell check |
| [Export transfer verification](verification/2026-10-21-export-transfer.md) | Issue #102: captured form snapshots read once per export by a content key stored in `psf_requests`; before/after bytes from PostgreSQL and phase timings on a simulated slow link, and the 5,570-request cell check |
| [Request list columns and Modified By verification](verification/2026-10-21-request-list-columns.md) | One value per request-list column with Product Description first and PSF Setup File Name / Job File Name added, their release masking and one-time indexing, and Modified By recorded on every save with a one-time fill from Audit History: suites against base `9a051ff`, before/after screenshots on a throwaway local database; not deployment acceptance |
| [Single-column form verification](verification/2026-10-21-single-column-form.md) | Single-column field rows in all seven form renderings (issue #88) and the pinned action bar with save results in it (issue #90), then the centred 1335px request column and the Draft's Attachments spacing: renderer and interaction tests, measured row-height parity between viewing and editing, accessible names, bar position and roles, and desktop/phone light/dark screenshots on a throwaway local database; not deployment acceptance |
| [Input border contrast verification](verification/2026-10-21-input-border-contrast.md) | Light-mode input border token at 3:1 against card and page (issue #87): before/after browser-measured ratios, field states and light/dark screenshots on a throwaway local database; not deployment acceptance |
| [Request Snapshot verification](verification/2026-10-11-request-snapshot.md) | Suites against the `main` baseline, real-browser flow, and a run on the configured PostgreSQL inside session-temporary tables; not deployment acceptance |
| [Draft lifecycle verification](verification/2026-10-07-draft-lifecycle-and-team-filtering.md) | Public browser/HTTP/mail, SQL races and regression evidence |
| [docs/verification/2026-10-07-admin-autofill-dialogs.md](verification/2026-10-07-admin-autofill-dialogs.md) | Rule activation, modal editing and recipient-layout regression tests, browser evidence and two-axis review |
| [docs/verification/2026-10-06-main-documentation-alignment.md](verification/2026-10-06-main-documentation-alignment.md) | Main documentation baseline, assignment semantics, link checks and original Task 4 evidence availability |
| [docs/verification/2026-10-02-documentation-alignment.md](verification/2026-10-02-documentation-alignment.md) | Dated documentation audit and validation boundaries |
| [docs/verification/2026-10-02-status-management.md](verification/2026-10-02-status-management.md) | Dated evidence with its original test/runtime scope; not current deployment acceptance |
| [docs/verification/2026-10-02-status-type-and-demo-requests.md](verification/2026-10-02-status-type-and-demo-requests.md) | Dated evidence with its original test/runtime scope; not current deployment acceptance |
| [docs/verification/2026-10-02-unified-local-auth.md](verification/2026-10-02-unified-local-auth.md) | Dated evidence with its original test/runtime scope; not current deployment acceptance |

## Keeping documentation aligned

When changing behavior, update the current implementation guide, relevant setup
READMEs, diagrams and glossary in the same branch. Cite the controller/service
or configuration that establishes the claim. Mark unverified runtime conditions
explicitly. Preserve dated decisions/test results; add an amendment or new record
instead of rewriting prior outcomes. See [documentation audit](verification/2026-10-02-documentation-alignment.md)
for this audit's inventory and validation limits.

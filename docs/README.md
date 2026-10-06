# Documentation index

Scope: `main` at commit `745ae99`, aligned on 2026-10-06 after the
`feat/email-notification` merge. This index distinguishes maintained guides from
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
| [docs/email-notifications.md](email-notifications.md) | Destination-status recipients, outbox/worker, safe configuration and dated offline/LAN verification scope; merged into main |
| [docs/status-catalog-and-manual-updates.md](status-catalog-and-manual-updates.md) | Exact PostgreSQL Status strings, classification and no automatic action-driven status changes |
| [docs/audit-history-access.md](audit-history-access.md) | Implemented Audit History access for every authenticated role, superseding older Admin-only requirements; dated verification scope |
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
| [Auto-fill Rules and Status recipient design](specs/2026-10-07-autofill-admin-dialogs-design.md) | Active/Inactive selection, modal editing, field labels and recipient layout requirements |
| [Auto-fill Admin Dialogs plan](plans/2026-10-07-autofill-admin-dialogs.md) | Implementation checklist using `/implement` and `/code-review` |

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
| [docs/adr/0008-local-filesystem-attachment-storage.md](adr/0008-local-filesystem-attachment-storage.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0009-autofill-resolution-strategy.md](adr/0009-autofill-resolution-strategy.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0010-shared-setup-queue-visibility.md](adr/0010-shared-setup-queue-visibility.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0011-key-by-key-diff-request-audit-logs.md](adr/0011-key-by-key-diff-request-audit-logs.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0012-schema-embedded-master-data.md](adr/0012-schema-embedded-master-data.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0013-excel-export-schema-alignment.md](adr/0013-excel-export-schema-alignment.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
| [docs/adr/0014-current-production-baseline-and-visual-reference-boundary.md](adr/0014-current-production-baseline-and-visual-reference-boundary.md) | Original design/backlog/baseline snapshot; status notice points to current implementation |
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

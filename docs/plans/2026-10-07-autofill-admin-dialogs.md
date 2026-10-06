# Auto-fill Admin Dialogs Implementation Plan

> **For implementers:** Use `/implement` against the agreed spec, then `/code-review` against baseline `22dc786`. Review both documented standards and spec compliance before committing on `main`. Implementation was explicitly requested with `/implement` on 7 October 2026.

**Goal:** Add explicit rule activation and modal editing, and stabilize recipient inputs.

**Architecture:** Extend existing rule input with optional `status: 'active' | 'inactive'`, using the current database status column. Keep current validation and runtime filtering. Use existing native-dialog styles and label-only wrapping target lists.

**Tech Stack:** NestJS/pg, React/TypeScript, existing Jest/Vitest/Playwright.

**Spec:** [Approved design](../specs/2026-10-07-autofill-admin-dialogs-design.md).

## Global constraints

- Work only in the existing `main` checkout; no dependency changes.
- Status omission defaults to Active on create and preserves stored status on update.
- Save validation and automatic schema invalidation remain enforced.
- Preserve canonical keys in storage; hide them in field presentation.

## Review focus

- Inactive edit must not silently reactivate a rule.
- Invalid status and unknown request fields must be rejected.
- Removed schema fields must not become usable by selecting Active.
- Save errors must retain dialog values; busy state blocks close/double save.
- Adding many To recipients must not move either group's inputs.

## Task 1 — Backend activation

**Files:** backend/src/admin/autofill_rule.controller.ts, autofill_rule.service.ts and their specs; backend/test/autofill.postgres.test.ts if persistence coverage requires it.

**Contract:** Optional status on existing create/update input; returned AutofillRule shape unchanged. Store explicit status and distinguish manual disable reason. Omitted update status preserves existing status/reason.

- [x] Add behavior tests for inactive create/update, omitted update preservation, explicit activation, invalid status, schema-invalid activation and runtime exclusion.
- [x] Run tests to observe intended failures, implement input/SQL changes, rerun.
- [x] Run related backend tests, build and focused lint; inspect actual persistence using disposable database when practical.

## Task 2 — Frontend presentation

**Files:** frontend/src/components/AdminAutofillRulesPage.tsx, adminAutofillRulesState.ts, frontend/src/services/api.ts, frontend/src/index.css, AdminWorkflowTransitionPage.tsx/CSS and related tests.

**Contract:** Consume/submit optional status; editor draft always initializes and preserves explicit status. Both create/edit use modal. Recipient input groups appear before recipient lists.

- [x] Add behavioral tests for modal status/save/cancel/errors/focus and inactive preservation; update superseded activation expectations.
- [x] Implement native dialog, label-only presentation, Source removal and horizontal target wrapping.
- [x] Move recipient lists below both input groups; verify adding/removing retains values and input order.
- [x] Run related frontend tests, build and focused lint.

## Integration

- [x] Review backend/frontend contract and docs together.
- [x] Use existing disposable browser/database fixture for desktop/mobile and light/dark checks; record exact commands/outcomes.
- [x] Update current implementation, domain glossary and documentation index.
- [x] Run git diff --check and record final verification; publish only within user authorization.

## Completion record

Implementation and two-axis review completed on 7 October 2026. See
[verification](../verification/2026-10-07-admin-autofill-dialogs.md) for commands,
results, retained screenshots and validation scope.

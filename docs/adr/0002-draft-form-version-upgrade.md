# 2. Draft Form Version Upgrade Strategy

> **Implementation amendment:** [ADR 0014](0014-current-production-baseline-and-visual-reference-boundary.md) defines the current production baseline and takes precedence where this historical record conflicts with the implemented codebase.

We decided to implement a hybrid strategy for handling Draft version upgrades, prompting the user when a newer form schema is published.

## Context

When an administrator publishes a new form version, existing drafts remain associated with the older version. We need to decide whether to automatically migrate them, freeze them on the old version, or let the user decide.

## Decision

We chose a hybrid approach:
- When a user opens a Draft that is on an older form version than the current active version, the frontend will display a confirmation dialog.
- The dialog will prompt the user to choose between:
  1. **Upgrading to the new version**: The Draft is migrated to the active form schema (matching fields are preserved, new fields are added, and obsolete fields are removed).
  2. **Remaining on the old version**: The Draft continues using the old schema snapshot.
- Once the request is submitted (status changed to `Submitted`), it is locked to its final schema version snapshot.

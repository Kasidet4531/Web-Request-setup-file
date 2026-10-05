# 5. Manual and Dynamic Workflow Status Transitions

> **Status clarification, 4 October 2026:** [Database Status names and interaction rules](../status-catalog-and-manual-updates.md) supersede old short-label catalogs, directed transition matrices and action-driven automatic Status changes below. The retained body is historical evidence, not a Status catalog or current UX instruction. Do not reuse old named-stage buttons or transition-editor requirements.

> **Historical decision record (2026-10-02 audit):** The original decision and rationale are retained below; they do not certify all described features as implemented. [Current implementation](../current-implementation.md) takes precedence for present behavior, including where older implementation amendments differ. Current workflow uses a configurable status catalog and semantic status types rather than the role/department transition matrix described below; see [workflow service](../../backend/src/admin/workflow_transition.service.ts).

> **Implementation amendment:** [ADR 0014](0014-current-production-baseline-and-visual-reference-boundary.md) defines the current production baseline and takes precedence where this historical record conflicts with the implemented codebase.

We decided that all workflow status transitions (such as transitioning from Submitted to Setup In Progress, PSF Created, and Completed) must be set manually by the users (the requester/creator, setup owner, or admin) rather than being driven or automatically transitioned by system events. Furthermore, the list of statuses and permitted transitions must be dynamically configurable by administrators.

## Context

We need to decide how requests move between workflow statuses. Because the system cannot automatically track the progress of setup file creation or external operations, automated triggers for status updates are not feasible for the MVP. Additionally, the business requirements for workflow stages may evolve, requiring the ability to add, modify, or remove statuses without changing code.

## Decision

We chose a completely manual and dynamic status transition flow:
- Users (requesters, creators, setup owners, or administrators) must manually update the request status at each step of the lifecycle.
- Each transition is triggered by a manual user action in the UI (e.g. clicking a button to set the status to "Setup In Progress", "PSF Created", or "Completed").
- Permitted status changes are governed by role-based access rules (e.g., only the creator/requester or admin can perform certain actions, and setup owners can perform others), but the action itself is always manual.
- **Dynamic Administration**: The list of available statuses, their display labels, and the permitted transition paths are stored in the database. Administrators can add, modify, or remove statuses and update the transition matrix dynamically through the Admin Page, without requiring backend code changes or deployments.

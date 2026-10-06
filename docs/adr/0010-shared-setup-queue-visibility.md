# 10. Shared Queue Model for Setup File Owners

> **Superseded Status instructions:** Old short stages, transition permissions/paths and automatic owner assignment through Status changes below must not be reimplemented. Use [the current Status catalog and action constraints](../status-catalog-and-manual-updates.md).

> **Historical decision record (2026-10-02 audit):** The original decision and rationale are retained below; they do not certify all described features as implemented. [Current implementation](../current-implementation.md) takes precedence for present behavior, including where older implementation amendments differ. Current access distinguishes shared non-Draft work from creator-private Drafts, including for Admin and Setup File Owner; the Dashboard uses related work rather than unrestricted system-wide totals. See [request service](../../backend/src/requests/requests.service.ts).

> **Implementation amendment:** [ADR 0014](0014-current-production-baseline-and-visual-reference-boundary.md) defines the current production baseline and takes precedence where this historical record conflicts with the implemented codebase.

We decided to implement a shared queue model for the Dashboard and request processing, allowing any user with the Setup File Owner role to view, update, and transition any PSF Request in the system, rather than locking requests to a single assigned individual.

## Context

The initial specification suggested that Setup File Owners would only see "Assigned requests" on their dashboards. However, in our engineering workflow, any qualified engineer with the Setup File Owner role can review, edit, and complete any pending request. Having to manually assign or lock requests to individual owners beforehand introduces unnecessary scheduling steps and slows down queue throughput.

## Decision

We chose a Shared Queue Model:
- **Dashboard Visibility**: Setup File Owners will have system-wide visibility on their dashboards, similar to Administrators. They will be able to see all requests, with default dashboard views pre-filtered to requests that are pending action (e.g., status is `Submitted` or `Setup In Progress`).
- **Open Edit Access**: Any authenticated Setup File Owner can edit the *PSF Created Information* section and perform workflow status transitions on any request.
- **Audit and Tracking**: The `setup_owner` field in the database will record the identifier of the engineer who actually enters the PSF details and moves the request to `PSF Created` or `Completed`. This is captured dynamically at the write-time of those actions, rather than being pre-assigned.
- **Concurrent Modification Safeguard**: Since multiple Setup File Owners can access the same requests, we will implement optimistic concurrency locking on the backend (e.g., checking `updated_at` timestamps) to prevent one engineer from accidentally overwriting another's updates if they happen to edit the same request at the same time.

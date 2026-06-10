# 5. Manual Workflow Status Transitions

We decided that all workflow status transitions (such as transitioning from Submitted to Setup In Progress, PSF Created, and Completed) must be set manually by the users (the requester/creator, setup owner, or admin) rather than being driven or automatically transitioned by system events.

## Context

We need to decide how requests move between workflow statuses. Because the system cannot automatically track the progress of setup file creation or external operations, automated triggers for status updates are not feasible for the MVP.

## Decision

We chose a completely manual status transition flow:
- Users (requesters, creators, setup owners, or administrators) must manually update the request status at each step of the lifecycle.
- Each transition is triggered by a manual user action in the UI (e.g. clicking a button to set the status to "Setup In Progress", "PSF Created", or "Completed").
- Permitted status changes are governed by role-based access rules (e.g., only the creator/requester or admin can perform certain actions, and setup owners can perform others), but the action itself is always manual.

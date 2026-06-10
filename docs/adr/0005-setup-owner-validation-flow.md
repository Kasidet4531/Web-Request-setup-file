# 5. Workflow Transition to Completed Status

We decided that the transition from `PSF Created` to `Completed` status is manually performed by the Setup File Owner or Admin, rather than requiring Requester validation or automated system completion.

## Context

When a setup file is completed, the request enters the `PSF Created` state. We need to decide who transitions it to `Completed` (the final state) and whether this step should be automated or require a sign-off loop from the Requester.

## Decision

We chose a manual, Setup Owner-driven completion flow:
- The **Setup File Owner** or **Admin** manually updates the request status to `Completed` when they verify the setup file is ready.
- There is no formal validation or reject-back loop by the Requester built into the system. If the Requester finds issues with the setup file post-creation, corrections must be coordinated offline or by opening a new request.
